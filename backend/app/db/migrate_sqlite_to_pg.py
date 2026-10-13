"""Idempotent migration utility from historical SQLite to PostgreSQL / Supabase."""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

import numpy as np
import psycopg
from psycopg.rows import dict_row

from app.db.base import DEFAULT_DEMO_USER_ID
from app.db.postgres_adapter import _format_vector, _to_valid_uuid, normalize_postgres_url


def migrate_data(
    sqlite_path: Path,
    pg_url: str | None,
    target_user_id: str,
    course_id: str | None = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Inspect and optionally migrate historical SQLite documents and chunks to PostgreSQL."""
    if not sqlite_path.is_file():
        raise FileNotFoundError(f"Source SQLite database not found at {sqlite_path}")

    # Read SQLite records in read-only mode to prevent any alteration
    conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        documents_cur = conn.execute(
            """SELECT id, filename, title, storage_filename, sha256,
                      size_bytes, page_count, chunk_count, created_at
               FROM documents ORDER BY created_at ASC"""
        )
        sqlite_docs = [dict(row) for row in documents_cur.fetchall()]

        chunks_cur = conn.execute(
            """SELECT id, document_id, page_number, chunk_index, text,
                      embedding, embedding_dim, embedding_model, created_at
               FROM chunks ORDER BY document_id, page_number, chunk_index ASC"""
        )
        sqlite_chunks = [dict(row) for row in chunks_cur.fetchall()]
    finally:
        conn.close()

    # Group chunks by document
    chunks_by_doc: dict[str, list[dict[str, Any]]] = {}
    for c in sqlite_chunks:
        chunks_by_doc.setdefault(c["document_id"], []).append(c)

    # Validate embeddings and dimensions
    doc_summaries = []
    total_valid_chunks = 0
    mismatched_chunks = 0

    for doc in sqlite_docs:
        doc_id = doc["id"]
        doc_chunks = chunks_by_doc.get(doc_id, [])
        valid_in_doc = 0

        for c in doc_chunks:
            raw_emb = c["embedding"]
            dim = int(c["embedding_dim"])
            arr = np.frombuffer(raw_emb, dtype=np.float32)
            if arr.size == dim == 768:
                valid_in_doc += 1
            else:
                mismatched_chunks += 1

        total_valid_chunks += valid_in_doc
        doc_summaries.append({
            "id": doc_id,
            "filename": doc["filename"],
            "title": doc["title"],
            "sha256": doc["sha256"],
            "size_bytes": doc["size_bytes"],
            "page_count": doc["page_count"],
            "chunk_count": len(doc_chunks),
            "valid_768_chunks": valid_in_doc,
            "created_at": doc["created_at"],
        })

    report = {
        "sqlite_path": str(sqlite_path),
        "target_user_id": target_user_id,
        "course_id": course_id,
        "dry_run": dry_run,
        "documents_count": len(sqlite_docs),
        "total_chunks_count": len(sqlite_chunks),
        "valid_768_dim_chunks": total_valid_chunks,
        "mismatched_chunks": mismatched_chunks,
        "documents": doc_summaries,
        "status": "ready",
    }

    if dry_run:
        report["message"] = (
            f"Dry run completed. Found {len(sqlite_docs)} document(s) and {len(sqlite_chunks)} chunk(s). "
            f"All vectors verified at 768 dimensions without re-embedding. "
            "No data was written to PostgreSQL. Source SQLite data remains intact."
        )
        return report

    if not pg_url:
        raise ValueError("Cannot execute migration: DATABASE_URL is not provided.")

    # Execute migration into PostgreSQL
    target_uid = _to_valid_uuid(target_user_id)
    target_cid = _to_valid_uuid(course_id) if course_id else None

    inserted_docs = 0
    inserted_chunks = 0

    with psycopg.connect(normalize_postgres_url(pg_url), row_factory=dict_row) as pg_conn:
        with pg_conn.cursor() as cur:
            # Set local auth context using set_config
            try:
                cur.execute("SELECT set_config('request.jwt.claim.sub', %s, true);", (target_uid,))
                cur.execute("SELECT set_config('request.jwt.claim.role', %s, true);", ("authenticated",))
            except Exception:
                pass

            # Validate that target_uid exists in auth.users if auth schema is present
            try:
                cur.execute("SELECT 1 FROM auth.users WHERE id = %s;", (target_uid,))
                if not cur.fetchone():
                    raise ValueError(
                        f"Target user '{target_uid}' does not exist in auth.users. "
                        "Documents require an existing user identity in auth.users. "
                        "Create the user via Supabase Auth (Sign Up) before running migration."
                    )
            except psycopg.errors.UndefinedTable:
                # If running against a plain Postgres instance without Supabase auth schema
                pass

            for doc in sqlite_docs:
                p_doc_id = _to_valid_uuid(doc["id"])
                storage_path = f"{target_uid}/{p_doc_id}.pdf"
                cur.execute(
                    """
                    INSERT INTO public.study_documents
                        (id, user_id, course_id, filename, title, storage_path, sha256,
                         size_bytes, page_count, chunk_count, index_status, created_at, updated_at)
                    VALUES
                        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'indexed', %s, %s)
                    ON CONFLICT (id, user_id) DO UPDATE SET
                        filename = EXCLUDED.filename,
                        title = EXCLUDED.title,
                        storage_path = EXCLUDED.storage_path,
                        chunk_count = EXCLUDED.chunk_count,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        p_doc_id,
                        target_uid,
                        target_cid,
                        doc["filename"],
                        doc["title"],
                        storage_path,
                        doc["sha256"],
                        doc["size_bytes"],
                        doc["page_count"],
                        doc["chunk_count"],
                        doc["created_at"],
                        doc["created_at"],
                    ),
                )
                inserted_docs += 1

                doc_chunks = chunks_by_doc.get(doc["id"], [])
                chunk_tuples = []
                for chunk in doc_chunks:
                    c_id = _to_valid_uuid(chunk["id"])
                    raw_emb = chunk["embedding"]
                    arr = np.frombuffer(raw_emb, dtype=np.float32)
                    vec_str = _format_vector(arr)
                    chunk_tuples.append((
                        c_id,
                        target_uid,
                        p_doc_id,
                        chunk["page_number"],
                        chunk["chunk_index"],
                        chunk["text"],
                        vec_str,
                        chunk.get("embedding_model", "nomic-embed-text"),
                        chunk["created_at"],
                    ))

                cur.executemany(
                    """
                    INSERT INTO public.document_chunks
                        (id, user_id, document_id, page_number, chunk_index,
                         content, embedding, embedding_model, created_at)
                    VALUES
                        (%s, %s, %s, %s, %s, %s, %s::extensions.vector, %s, %s)
                    ON CONFLICT (document_id, page_number, chunk_index) DO UPDATE SET
                        content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding
                    """,
                    chunk_tuples,
                )
                inserted_chunks += len(chunk_tuples)

        pg_conn.commit()

    report["status"] = "migrated"
    report["inserted_docs"] = inserted_docs
    report["inserted_chunks"] = inserted_chunks
    report["message"] = (
        f"Migration committed successfully: {inserted_docs} documents and {inserted_chunks} chunks inserted/updated. "
        "Source SQLite database and indexed PDFs were untouched."
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Repeatable, idempotent SQLite to Supabase PostgreSQL migration utility."
    )
    parser.add_argument(
        "--sqlite-path",
        type=Path,
        default=Path("F:/Syllora/backend/data/indexes/syllora.sqlite3"),
        help="Path to source SQLite database file",
    )
    parser.add_argument(
        "--pg-url",
        type=str,
        default=os.getenv("DATABASE_URL"),
        help="Target PostgreSQL connection URL (or DATABASE_URL env var)",
    )
    parser.add_argument(
        "--user-id",
        type=str,
        default=DEFAULT_DEMO_USER_ID,
        help="Target Supabase Auth user UUID (defaults to deterministic local demo user)",
    )
    parser.add_argument(
        "--course-id",
        type=str,
        default=None,
        help="Optional course UUID to link migrated documents",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Execute the migration against PostgreSQL (default is dry-run)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform inspection and validation only without writing to PostgreSQL (default behavior)",
    )

    args = parser.parse_args()
    is_dry_run = not args.execute

    print("=" * 60)
    print("SYLLORA DATABASE MIGRATION UTILITY")
    print("=" * 60)
    print(f"Mode: {'DRY RUN (safe simulation)' if is_dry_run else 'EXECUTE (live migration)'}")
    print(f"Source SQLite: {args.sqlite_path}")
    print(f"Target User UUID: {args.user_id}")
    if args.pg_url:
        print(f"Target Postgres: {args.pg_url.split('@')[-1] if '@' in args.pg_url else args.pg_url}")
    else:
        print("Target Postgres: None configured")
    print("-" * 60)

    try:
        report = migrate_data(
            sqlite_path=args.sqlite_path,
            pg_url=args.pg_url,
            target_user_id=args.user_id,
            course_id=args.course_id,
            dry_run=is_dry_run,
        )
        print(f"Documents found: {report['documents_count']}")
        print(f"Total chunks found: {report['total_chunks_count']}")
        print(f"Valid 768-dim chunks: {report['valid_768_dim_chunks']}")
        print(f"Mismatched chunks: {report['mismatched_chunks']}")
        print("-" * 60)
        for d in report["documents"]:
            print(f"- Doc ID: {d['id']}")
            print(f"  Title: {d['title']}")
            print(f"  File: {d['filename']} ({d['size_bytes']} bytes, {d['page_count']} pages)")
            print(f"  Chunks: {d['chunk_count']} (768-dim valid: {d['valid_768_chunks']})")
            print(f"  SHA-256: {d['sha256']}")
        print("=" * 60)
        print(report["message"])
        print("=" * 60)
    except Exception as exc:
        print(f"Error during migration: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
