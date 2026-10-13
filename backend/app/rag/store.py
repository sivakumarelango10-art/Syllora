"""SQLite persistence for documents, page-aware chunks and their embeddings."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

import numpy as np

BACKEND_DIR = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.getenv("SYLLORA_DB_PATH", str(BACKEND_DIR / "data" / "indexes" / "syllora.sqlite3")))
UPLOAD_DIR = Path(os.getenv("SYLLORA_UPLOAD_DIR", str(BACKEND_DIR / "data" / "uploads")))


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(DB_PATH), timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_db() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                title TEXT NOT NULL,
                storage_filename TEXT NOT NULL,
                sha256 TEXT NOT NULL UNIQUE,
                size_bytes INTEGER NOT NULL,
                page_count INTEGER NOT NULL,
                chunk_count INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                page_number INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                embedding BLOB NOT NULL,
                embedding_dim INTEGER NOT NULL,
                embedding_model TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_embedding_model ON chunks(embedding_model);
            CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
            """
        )


def document_hash_exists(sha256: str) -> bool:
    with _connect() as connection:
        row = connection.execute("SELECT 1 FROM documents WHERE sha256 = ?", (sha256,)).fetchone()
        return row is not None


def insert_document(document: dict[str, Any], chunks: list[dict[str, Any]]) -> None:
    """Insert document metadata and all already-computed embeddings atomically."""
    with _connect() as connection:
        connection.execute(
            """INSERT INTO documents
               (id, filename, title, storage_filename, sha256, size_bytes, page_count, chunk_count, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                document["id"], document["filename"], document["title"], document["storage_filename"],
                document["sha256"], document["size_bytes"], document["page_count"],
                len(chunks), document["created_at"],
            ),
        )
        connection.executemany(
            """INSERT INTO chunks
               (id, document_id, page_number, chunk_index, text, embedding, embedding_dim, embedding_model, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    chunk["id"], document["id"], chunk["page_number"], chunk["chunk_index"], chunk["text"],
                    np.asarray(chunk["embedding"], dtype=np.float32).tobytes(),
                    len(chunk["embedding"]), chunk["embedding_model"], document["created_at"],
                )
                for chunk in chunks
            ],
        )


def list_documents() -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """SELECT id, filename, title, size_bytes, page_count, chunk_count, created_at
               FROM documents ORDER BY created_at DESC"""
        ).fetchall()
    return [dict(row) for row in rows]


def get_document(document_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            """SELECT id, filename, title, storage_filename, size_bytes, page_count, chunk_count, created_at
               FROM documents WHERE id = ?""",
            (document_id,),
        ).fetchone()
    return dict(row) if row else None


def delete_document(document_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            "SELECT id, storage_filename FROM documents WHERE id = ?", (document_id,)
        ).fetchone()
        if row is None:
            return None
        storage_filename = row["storage_filename"]
        connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    return {"id": document_id, "storage_filename": storage_filename}


def load_search_chunks(embedding_model: str) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """SELECT c.id, c.document_id, c.page_number, c.chunk_index, c.text,
                      c.embedding, c.embedding_dim, c.embedding_model,
                      d.filename, d.title
               FROM chunks c JOIN documents d ON d.id = c.document_id
               WHERE c.embedding_model = ?
               ORDER BY d.created_at, c.page_number, c.chunk_index""",
            (embedding_model,),
        ).fetchall()
    return [dict(row) for row in rows]


def count_chunks() -> int:
    with _connect() as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM chunks").fetchone()
    return int(row["count"])


# Create the schema as soon as the backend package is imported.
init_db()
