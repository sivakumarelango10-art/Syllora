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


def _get_supabase_issuer() -> str:
    supabase_url = os.getenv("SUPABASE_URL", os.getenv("PUBLIC_SUPABASE_URL", "")).rstrip("/")
    if not supabase_url:
        return ""
    return f"{supabase_url}/auth/v1"


def _is_legacy_hs256_secret(secret_name: str, secret_value: str | None) -> bool:
    if not secret_value:
        return False
    if secret_name in {"SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"}:
        return False
    if secret_value.startswith("sb_secret_") or secret_value.startswith("sbp_"):
        return False
    return True


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

    Security requirements:
    - Prefer Supabase's JWKS for RS256/ES256 JWTs
    - Never treat Supabase service-role keys as JWT signing secrets
    - Only accept explicit legacy HS256 secrets via SUPABASE_JWT_SECRET
    """
    import jwt

    payload = None
    last_error: Exception | None = None
    issuer = _get_supabase_issuer()

    def _decode_with_options(secret: str, algorithms: list[str]) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "algorithms": algorithms,
            "audience": "authenticated",
            "options": {"verify_signature": True, "verify_aud": True, "verify_exp": True, "verify_iss": False},
        }
        if issuer:
            # Some legacy/local tokens do not carry an iss claim. Only enforce issuer when the
            # claim exists and matches the configured Supabase issuer.
            unverified = jwt.decode(token, options={"verify_signature": False, "verify_aud": False, "verify_exp": False, "verify_iss": False})
            if isinstance(unverified, dict) and "iss" in unverified and unverified.get("iss"):
                kwargs["issuer"] = issuer
                kwargs["options"]["verify_iss"] = True
        payload = jwt.decode(token, secret, **kwargs)
        if issuer and payload.get("iss") and payload.get("iss") != issuer:
            raise jwt.InvalidIssuerError(f"Invalid issuer: {payload.get('iss')}")
        return payload

    # 1. Preferred asymmetric validation via Supabase JWKS.
    jwk_client = _get_jwk_client()
    if jwk_client:
        try:
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            kwargs: dict[str, Any] = {
                "algorithms": ["RS256", "ES256"],
                "audience": "authenticated",
                "options": {"verify_signature": True, "verify_aud": True, "verify_exp": True},
            }
            if issuer:
                kwargs["issuer"] = issuer
                kwargs["options"]["verify_iss"] = True
            payload = jwt.decode(token, signing_key.key, **kwargs)
        except Exception as exc:
            last_error = exc

    # 2. Allow explicit legacy HS256 secrets only when they are configured as a JWT secret,
    #    never when they come from a Supabase service-role or secret API key.
    if payload is None:
        legacy_secret = os.getenv("SUPABASE_JWT_SECRET")
        if _is_legacy_hs256_secret("SUPABASE_JWT_SECRET", legacy_secret):
            try:
                payload = _decode_with_options(legacy_secret, ["HS256"])
            except Exception as exc:
                last_error = exc

    if os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        logger.warning(
            "Ignoring SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY for JWT verification; "
            "use SUPABASE_JWT_SECRET only for explicit legacy HS256 tokens."
        )

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
