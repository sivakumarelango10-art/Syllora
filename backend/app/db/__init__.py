"""Database abstraction layer for Syllora."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
    _backend_dir = Path(__file__).resolve().parents[2]
    load_dotenv(_backend_dir / ".env")
    load_dotenv(_backend_dir.parent / ".env.local")
except Exception:
    pass

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
        backend_dir = Path(__file__).resolve().parents[2]
        db_path = Path(
            os.getenv("SYLLORA_DB_PATH", str(backend_dir / "data" / "indexes" / "syllora.sqlite3"))
        )
        adapter = SQLiteAdapter(db_path)
    elif provider in ("postgres", "postgresql", "supabase"):
        database_url = os.getenv("DATABASE_URL", "").strip()
        if not database_url:
            raise ValueError(
                "SYLLORA_DB_PROVIDER is set to 'postgres', but DATABASE_URL environment variable is missing. "
                "Set DATABASE_URL (e.g., postgresql://postgres:password@127.0.0.1:54322/postgres) or switch to SYLLORA_DB_PROVIDER=sqlite."
            )
        from app.db.postgres_adapter import PostgresAdapter

        adapter = PostgresAdapter(database_url)
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
