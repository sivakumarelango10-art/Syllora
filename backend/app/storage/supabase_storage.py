"""Supabase Storage adapter for private, owner-scoped study PDFs."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.storage.base import StorageAdapter

logger = logging.getLogger(__name__)


class SupabaseStorageAdapter(StorageAdapter):
    """Integrates with Supabase Storage REST API for private PDF storage."""

    def __init__(
        self,
        supabase_url: str,
        service_key: str | None = None,
        bucket_name: str = "syllora-study-pdfs",
        api_key: str | None = None,
        timeout_seconds: float = 180.0,
    ) -> None:
        self.supabase_url = supabase_url.rstrip("/")
        self.service_key = service_key or ""
        self.api_key = api_key or self.service_key
        self.bucket_name = bucket_name
        self.timeout_seconds = timeout_seconds

    @property
    def provider_name(self) -> str:
        return "supabase"

    def _headers(self, custom_token: str | None = None) -> dict[str, str]:
        token = custom_token or self.service_key or self.api_key
        apikey = self.api_key or self.service_key
        return {
            "apikey": apikey,
            "Authorization": f"Bearer {token}",
        }

    def build_path(self, user_id: str, document_id: str) -> str:
        """Construct owner-scoped private path: <auth.uid()>/<document_uuid>.pdf."""
        clean_user = user_id.strip()
        clean_doc = document_id.strip()
        return f"{clean_user}/{clean_doc}.pdf"

    def save_file(
        self,
        storage_path: str,
        data: bytes,
        content_type: str = "application/pdf",
        auth_token: str | None = None,
    ) -> str:
        url = f"{self.supabase_url}/storage/v1/object/{self.bucket_name}/{storage_path}"
        headers = self._headers(auth_token)
        headers["Content-Type"] = content_type
        headers["x-upsert"] = "true"

        with httpx.Client(timeout=self.timeout_seconds) as client:
            try:
                response = client.post(url, headers=headers, content=data)
                response.raise_for_status()
                return storage_path
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(
                    f"Supabase Storage upload failed ({exc.response.status_code}): {exc.response.text}"
                ) from exc
            except httpx.RequestError as exc:
                raise ConnectionError(
                    f"Cannot reach Supabase Storage at {self.supabase_url}: {exc}"
                ) from exc

    def get_file(self, storage_path: str, auth_token: str | None = None) -> bytes | None:
        url = f"{self.supabase_url}/storage/v1/object/authenticated/{self.bucket_name}/{storage_path}"
        headers = self._headers(auth_token)

        with httpx.Client(timeout=self.timeout_seconds) as client:
            try:
                response = client.get(url, headers=headers)
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                return response.content
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    return None
                raise RuntimeError(
                    f"Supabase Storage download failed ({exc.response.status_code}): {exc.response.text}"
                ) from exc
            except httpx.RequestError as exc:
                raise ConnectionError(
                    f"Cannot reach Supabase Storage at {self.supabase_url}: {exc}"
                ) from exc

    def delete_file(self, storage_path: str, auth_token: str | None = None) -> bool:
        url = f"{self.supabase_url}/storage/v1/object/{self.bucket_name}/{storage_path}"
        headers = self._headers(auth_token)

        with httpx.Client(timeout=self.timeout_seconds) as client:
            try:
                response = client.delete(url, headers=headers)
                if response.status_code == 404:
                    return False
                response.raise_for_status()
                return True
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    return False
                raise RuntimeError(
                    f"Supabase Storage deletion failed ({exc.response.status_code}): {exc.response.text}"
                ) from exc
            except httpx.RequestError as exc:
                raise ConnectionError(
                    f"Cannot reach Supabase Storage at {self.supabase_url}: {exc}"
                ) from exc

    def file_exists(self, storage_path: str, auth_token: str | None = None) -> bool:
        url = f"{self.supabase_url}/storage/v1/object/info/authenticated/{self.bucket_name}/{storage_path}"
        headers = self._headers(auth_token)

        with httpx.Client(timeout=self.timeout_seconds) as client:
            try:
                response = client.get(url, headers=headers)
                return response.status_code == 200
            except Exception:
                return False

    def create_signed_url(
        self,
        storage_path: str,
        expires_in: int = 3600,
        auth_token: str | None = None,
    ) -> str | None:
        """Generate a signed download URL for private study document."""
        url = f"{self.supabase_url}/storage/v1/object/sign/{self.bucket_name}/{storage_path}"
        headers = self._headers(auth_token)
        with httpx.Client(timeout=self.timeout_seconds) as client:
            try:
                res = client.post(url, headers=headers, json={"expiresIn": expires_in})
                if res.status_code == 200:
                    data = res.json()
                    signed_path = data.get("signedURL")
                    if signed_path:
                        return f"{self.supabase_url}/storage/v1{signed_path}"
            except Exception as exc:
                logger.warning("Failed to create signed URL for %s: %s", storage_path, exc)
        return None
