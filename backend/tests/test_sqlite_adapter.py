from __future__ import annotations

import sqlite3

from app.db.sqlite_adapter import SQLiteAdapter


def test_init_db_adds_indexing_columns_to_legacy_documents(tmp_path) -> None:
    db_path = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE documents (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'local_user',
                filename TEXT NOT NULL,
                title TEXT NOT NULL,
                storage_filename TEXT NOT NULL,
                sha256 TEXT NOT NULL UNIQUE,
                size_bytes INTEGER NOT NULL,
                page_count INTEGER NOT NULL,
                chunk_count INTEGER NOT NULL,
                index_status TEXT NOT NULL DEFAULT 'completed',
                index_error TEXT,
                mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            INSERT INTO documents (
                id, filename, title, storage_filename, sha256, size_bytes,
                page_count, chunk_count, created_at
            ) VALUES ('legacy-id', 'notes.pdf', 'Notes', 'notes.pdf', 'hash', 12, 1, 1, '2026-01-01T00:00:00+00:00')
            """
        )

    SQLiteAdapter(db_path).init_db()

    with sqlite3.connect(db_path) as connection:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(documents)")
        }
        document = connection.execute(
            "SELECT index_attempts, next_attempt_at, updated_at FROM documents WHERE id = ?",
            ("legacy-id",),
        ).fetchone()

    assert {"index_attempts", "next_attempt_at", "updated_at"} <= columns
    assert document is not None
    assert document[0] == 0
    assert document[1]
    assert document[2] == "2026-01-01T00:00:00+00:00"
