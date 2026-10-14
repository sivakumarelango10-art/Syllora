"""Database abstraction layer for Syllora."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.config import APP_ENV, DB_PATH
from app.db.base import DatabaseAdapter, DEFAULT_DEMO_USER_ID
from app.db.sqlite_adapter import SQLiteAdapter

_ACTIVE_ADAPTER: DatabaseAdapter | None = None


def get_db_adapter(force_reload: bool = False) -> DatabaseAdapter:
    """Retrieve or initialize the active database adapter based on environment variables."""
    global _ACTIVE_ADAPTER
    if _ACTIVE_ADAPTER is not None and not force_reload:
        return _ACTIVE_ADAPTER

    provider = os.getenv("SYLLORA_DB_PROVIDER", "sqlite").strip().lower()

    if provider in ("sqlite", ""):
        if APP_ENV == "production":
            raise ValueError(
                "SQLite cannot be used as the persistent database in production. "
                "Configure DATABASE_URL and set SYLLORA_DB_PROVIDER=postgres."
            )
        db_path_env = os.getenv("SYLLORA_DB_PATH")
        db_path = Path(db_path_env) if db_path_env else DB_PATH
        adapter = SQLiteAdapter(db_path)
    elif provider in ("postgres", "postgresql", "supabase"):
        db_url = os.getenv("DATABASE_URL", "").strip()
        if not db_url:
            raise ValueError(
                "SYLLORA_DB_PROVIDER is set to 'postgres', but DATABASE_URL environment variable is missing. "
                "Set DATABASE_URL or configure PostgreSQL credentials."
            )
        from app.db.postgres_adapter import PostgresAdapter

        adapter = PostgresAdapter(db_url)
    else:
        raise ValueError(
            f"Unsupported SYLLORA_DB_PROVIDER: '{provider}'. "
            "Supported providers are 'sqlite' and 'postgres'."
        )

    _ACTIVE_ADAPTER = adapter
    return _ACTIVE_ADAPTER


def set_active_adapter(adapter: DatabaseAdapter | None) -> None:
    """Explicitly override the active adapter (used primarily in tests)."""
    global _ACTIVE_ADAPTER
    _ACTIVE_ADAPTER = adapter
