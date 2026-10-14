"""Persistence facade for documents, page-aware chunks and embeddings.

Delegates to the active DatabaseAdapter (SQLite or PostgreSQL / Supabase)
while maintaining backward-compatible module-level functions and paths.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.db import get_db_adapter
from app.db.base import DatabaseAdapter
from app.db.sqlite_adapter import SQLiteAdapter

BACKEND_DIR = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.getenv("SYLLORA_DB_PATH", str(BACKEND_DIR / "data" / "indexes" / "syllora.sqlite3")))
UPLOAD_DIR = Path(os.getenv("SYLLORA_UPLOAD_DIR", str(BACKEND_DIR / "data" / "uploads")))


def _get_adapter() -> DatabaseAdapter:
    """Retrieve active persistence adapter, synchronizing monkeypatched test paths if applicable."""
    adapter = get_db_adapter()
    if isinstance(adapter, SQLiteAdapter) and adapter.db_path != DB_PATH:
        adapter.db_path = DB_PATH
    return adapter


def init_db() -> None:
    """Initialize active database schema."""
    _get_adapter().init_db()


def document_hash_exists(sha256: str, user_id: str | None = None) -> bool:
    """Check if document with matching SHA-256 hash exists in active database."""
    return _get_adapter().document_hash_exists(sha256, user_id=user_id)


def insert_document(
    document: dict[str, Any],
    chunks: list[dict[str, Any]],
    pages: list[dict[str, Any]] | None = None,
    user_id: str | None = None,
) -> None:
    """Insert document metadata, chunks, and page text atomically."""
    _get_adapter().insert_document(document, chunks, pages=pages, user_id=user_id)


def update_document_status(
    document_id: str,
    status: str,
    error: str | None = None,
    user_id: str | None = None,
) -> None:
    """Update document lifecycle status and optional error details."""
    _get_adapter().update_document_status(document_id, status, error=error, user_id=user_id)

def claim_next_pending_document() -> dict[str, Any] | None:
    """Atomically claim the next persisted document-indexing job."""
    return _get_adapter().claim_next_pending_document()

def fail_document_index(document_id: str, user_id: str, error: str) -> None:
    """Schedule a retry or persist a terminal indexing failure."""
    _get_adapter().fail_document_index(document_id, user_id, error)

def retry_document_index(document_id: str, user_id: str) -> bool:
    """Reset a failed indexing job for its authenticated owner."""
    return _get_adapter().retry_document_index(document_id, user_id)


def get_document_pages(
    document_id: str, user_id: str | None = None
) -> list[dict[str, Any]]:
    """Retrieve all extracted page records for a document."""
    return _get_adapter().get_document_pages(document_id, user_id=user_id)


def list_documents(user_id: str | None = None) -> list[dict[str, Any]]:
    """List study documents ordered by creation timestamp descending."""
    return _get_adapter().list_documents(user_id=user_id)


def get_document(document_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    """Retrieve a single document by its ID."""
    return _get_adapter().get_document(document_id, user_id=user_id)


def delete_document(document_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    """Delete a document and return its storage reference for filesystem cleanup."""
    return _get_adapter().delete_document(document_id, user_id=user_id)


def load_search_chunks(embedding_model: str, user_id: str | None = None) -> list[dict[str, Any]]:
    """Load all search chunk records for the in-memory hybrid search index."""
    return _get_adapter().load_search_chunks(embedding_model, user_id=user_id)


def count_chunks(user_id: str | None = None) -> int:
    """Count the total number of chunks stored in the active database."""
    return _get_adapter().count_chunks(user_id=user_id)



# Initialize database schema upon module import
try:
    init_db()
except Exception:
    # In test or misconfigured environment, initialization errors are reported on demand
    pass
