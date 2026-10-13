"""Authentication and user ownership verification for Syllora."""
from __future__ import annotations

import base64
import json
import logging
import os
import uuid
from typing import Any

from fastapi import HTTPException, Request

from app.db.base import DEFAULT_DEMO_USER_ID

logger = logging.getLogger(__name__)

_jwk_client = None



def _get_jwk_client():
    global _jwk_client
    jwks_url = os.getenv("SUPABASE_JWKS_URL")
    if not jwks_url:
        supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
        if supabase_url:
            jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
    if jwks_url and _jwk_client is None:
        try:
            from jwt import PyJWKClient
            _jwk_client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)
        except Exception as exc:
            logger.debug("Could not initialize PyJWKClient for %s: %s", jwks_url, exc)
    return _jwk_client


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """
    Cryptographically verify a Supabase JWT token.
    Enforces signature verification, expiry, audience, and valid subject claims.
    Rejects tampered, forged, or expired tokens.
    """
    import jwt

    payload = None
    last_error: Exception | None = None

    # 1. Asymmetric verification via Supabase JWKS (.well-known/jwks.json)
    jwk_client = _get_jwk_client()
    if jwk_client:
        try:
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience="authenticated",
                options={"verify_signature": True, "verify_aud": True, "verify_exp": True},
            )
        except Exception as exc:
            last_error = exc

    # 2. Symmetric verification fallback if SUPABASE_JWT_SECRET is configured
    if payload is None:
        jwt_secret = os.getenv("SUPABASE_JWT_SECRET") or os.getenv("SUPABASE_SECRET_KEY")
        if jwt_secret and not jwt_secret.startswith("sb_secret_vZCnc"):
            try:
                payload = jwt.decode(
                    token,
                    jwt_secret,
                    algorithms=["HS256"],
                    audience="authenticated",
                    options={"verify_signature": True, "verify_aud": True, "verify_exp": True},
                )
            except Exception as exc:
                last_error = exc

    if payload is None:
        err_msg = f"Cryptographic JWT verification failed: {last_error}" if last_error else "No valid trusted signing keys or secret configured."
        logger.warning(err_msg)
        raise HTTPException(status_code=401, detail="Invalid or unverified authentication token.")

    user_sub = payload.get("sub")
    if not user_sub:
        raise HTTPException(status_code=401, detail="Token payload missing 'sub' subject claim.")

    try:
        uuid.UUID(str(user_sub))
        return payload
    except ValueError:
        raise HTTPException(status_code=401, detail="User subject claim is not a valid UUID.")


def is_loopback_request(request: Request) -> bool:
    """
    Determine if a request originates strictly from a local loopback environment.
    Rejects any request arriving through public tunnels (e.g. Cloudflare, ngrok)
    or external reverse proxies.
    """
    # 1. Reject any request with public tunnel / external proxy headers
    proxy_headers = ("cf-ray", "cf-connecting-ip", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto")
    if any(h in request.headers for h in proxy_headers):
        return False

    # 2. Verify Host header if present (must be a loopback or test address)
    host_raw = request.headers.get("host", "").split(":")[0].strip().lower()
    if host_raw and host_raw not in ("localhost", "127.0.0.1", "testserver", "::1"):
        return False

    # 3. Verify client IP if present (uvicorn populates client for all network connections)
    client_ip = (request.client.host if request.client else "").strip().lower()
    if client_ip and client_ip not in ("127.0.0.1", "::1", "localhost", "testclient"):
        return False

    return True


def get_current_user_id(request: Request) -> str:
    """
    Extract and verify the authenticated user ID from the request.
    
    Security rules:
    - If Authorization header is provided:
        Must be a cryptographically verified Supabase JWT.
        Forged, expired, or tampered tokens are REJECTED with HTTP 401.
    - If NO Authorization header is provided:
        - In hosted PostgreSQL mode, strictly requires an authenticated token.
        - On public tunnels, proxies, or remote hosts, strictly requires an authenticated token.
        - In offline SQLite local dev mode, only allowed on loopback when SYLLORA_ALLOW_DEMO_AUTH is enabled.
    - Rejects client-supplied spoofing headers (e.g., X-User-Id).
    """
    auth_header = request.headers.get("Authorization", "").strip()

    if auth_header:
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header must use Bearer scheme.")
        token = auth_header[7:].strip()
        if not token:
            raise HTTPException(status_code=401, detail="Empty Bearer token provided.")
        payload = verify_supabase_jwt(token)
        return str(uuid.UUID(str(payload["sub"])))

    # No Authorization header provided:
    db_provider = os.getenv("SYLLORA_DB_PROVIDER", "postgres").strip().lower()
    require_auth = os.getenv("SYLLORA_REQUIRE_AUTH", "true").strip().lower() in ("true", "1")
    if db_provider in ("postgres", "postgresql", "supabase"):
        raise HTTPException(
            status_code=401,
            detail="Authentication required in hosted database mode. Provide a valid Supabase Bearer token.",
        )
    if require_auth:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide a valid Supabase Bearer token.",
        )

    # In SQLite mode, strictly verify whether demo authentication is permitted:
    # 1. Must be a loopback request (not a public tunnel, external proxy, or remote IP)
    if not is_loopback_request(request):
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Anonymous demo access is strictly prohibited on public, tunnel, or external network requests.",
        )

    # 2. Explicit demo mode flag must not be disabled
    allow_demo = os.getenv("SYLLORA_ALLOW_DEMO_AUTH", "true").strip().lower() in ("true", "1")
    if not allow_demo:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Demo authentication mode is disabled.",
        )

    # Local development fallback for offline SQLite mode on loopback only
    return DEFAULT_DEMO_USER_ID
