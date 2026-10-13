"""Storage factory for Syllora study PDFs."""
from __future__ import annotations

import os
from pathlib import Path

from app.storage.base import StorageAdapter
from app.storage.local_storage import LocalStorageAdapter

_ACTIVE_STORAGE: StorageAdapter | None = None


def get_storage_adapter(force_reload: bool = False) -> StorageAdapter:
    """Instantiate or retrieve active storage adapter based on environment variables."""
    global _ACTIVE_STORAGE
    if _ACTIVE_STORAGE is not None and not force_reload:
        return _ACTIVE_STORAGE

    from app.config import (
        STORAGE_BUCKET,
        STORAGE_PROVIDER,
        SUPABASE_SECRET_KEY,
        SUPABASE_URL,
        UPLOAD_DIR,
    )

    provider = os.getenv("SYLLORA_STORAGE_PROVIDER")
    if not provider:
        provider = STORAGE_PROVIDER or "local"
    provider = provider.strip().lower()

    if provider in ("local", "filesystem"):
        upload_dir_env = os.getenv("SYLLORA_UPLOAD_DIR") or os.getenv("LOCAL_UPLOAD_DIR")
        upload_dir = Path(upload_dir_env) if upload_dir_env else UPLOAD_DIR
        adapter = LocalStorageAdapter(upload_dir)
    elif provider in ("supabase", "cloud"):
        supabase_url = os.getenv("SUPABASE_URL", SUPABASE_URL).strip()
        service_key = os.getenv("SUPABASE_SECRET_KEY", SUPABASE_SECRET_KEY).strip()
        bucket = os.getenv("SUPABASE_STORAGE_BUCKET", STORAGE_BUCKET).strip()
        if not supabase_url or not service_key:
            raise ValueError(
                "SYLLORA_STORAGE_PROVIDER is set to 'supabase', but SUPABASE_URL and/or SUPABASE_SECRET_KEY is missing."
            )
        from app.storage.supabase_storage import SupabaseStorageAdapter

        adapter = SupabaseStorageAdapter(
            supabase_url=supabase_url,
            service_key=service_key,
            bucket_name=bucket,
        )
    else:
        raise ValueError(
            f"Unsupported SYLLORA_STORAGE_PROVIDER: '{provider}'. Supported providers are 'local' and 'supabase'."
        )

    _ACTIVE_STORAGE = adapter
    return _ACTIVE_STORAGE


def set_active_storage(adapter: StorageAdapter | None) -> None:
    """Explicitly override storage adapter (for test isolation)."""
    global _ACTIVE_STORAGE
    _ACTIVE_STORAGE = adapter
