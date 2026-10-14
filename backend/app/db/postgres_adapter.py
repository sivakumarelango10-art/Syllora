"""PostgreSQL / Supabase persistence adapter for Syllora."""
from __future__ import annotations

import json
import logging
import os
import re
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np
import psycopg
from psycopg.rows import dict_row

from app.db.base import DatabaseAdapter, DEFAULT_DEMO_USER_ID

logger = logging.getLogger(__name__)


def _to_valid_uuid(val: str | None, default: str | None = None) -> str:
    """Ensure a string is a valid UUID, hashing if it is an arbitrary text identifier."""
    if not val:
        return default or DEFAULT_DEMO_USER_ID
    try:
        return str(uuid.UUID(val))
    except (ValueError, TypeError, AttributeError):
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, str(val)))


def _format_vector(embedding: list[float] | np.ndarray) -> str:
    """Format float array into PostgreSQL pgvector literal string '[v1,v2,...]'."""
    if isinstance(embedding, np.ndarray):
        arr = embedding.tolist()
    else:
        arr = list(embedding)
    return "[" + ",".join(f"{x:.8f}" for x in arr) + "]"


def _parse_vector_to_bytes(vector_val: Any, expected_dim: int = 768) -> bytes:
    """Convert pgvector string or list representation into float32 bytes."""
    if isinstance(vector_val, bytes):
        return vector_val
    if isinstance(vector_val, (list, tuple)):
        return np.asarray(vector_val, dtype=np.float32).tobytes()
    if isinstance(vector_val, str):
        # Format: "[0.123, -0.456, ...]"
        cleaned = vector_val.strip("[]")
        if not cleaned:
            return b""
        floats = [float(x.strip()) for x in cleaned.split(",") if x.strip()]
        return np.asarray(floats, dtype=np.float32).tobytes()
    return b""


def normalize_postgres_url(raw_url: str) -> str:
    """Normalize and sanitize PostgreSQL URI for psycopg.

    Handles unencoded special characters in password (such as '@'),
    strips driver-specific query parameters like 'pgbouncer=true', and ensures sslmode=require for Supabase.
    """
    if not raw_url:
        return raw_url
    match = re.match(r"^(postgres(?:ql)?://)(.*)$", raw_url.strip())
    if not match:
        return raw_url
    scheme, rest = match.groups()

    # Strip query parameters that psycopg does not support (e.g. pgbouncer=true)
    if "?" in rest:
        base_rest, query_str = rest.split("?", 1)
        params = [p for p in query_str.split("&") if not p.lower().startswith("pgbouncer=")]
        query_str = "&".join(params)
    else:
        base_rest = rest
        query_str = ""

    # Split credentials from host:port/dbname at the LAST '@'
    if "@" in base_rest:
        creds_part, host_db_part = base_rest.rsplit("@", 1)
        if ":" in creds_part:
            user_part, pass_part = creds_part.split(":", 1)
            # Unquote first then quote to safely encode '@' as '%40' without double-encoding
            clean_pass = urllib.parse.quote_plus(urllib.parse.unquote(pass_part))
            base_rest = f"{user_part}:{clean_pass}@{host_db_part}"

    # Supabase cloud poolers require SSL
    if "supabase.com" in base_rest and "sslmode" not in query_str:
        query_str = f"sslmode=require&{query_str}" if query_str else "sslmode=require"

    return f"{scheme}{base_rest}" + (f"?{query_str}" if query_str else "")


class PostgresAdapter(DatabaseAdapter):
    """PostgreSQL adapter compatible with Supabase schema, pgvector, and RLS."""

    def __init__(self, connection_url: str, connect_timeout: int = 2) -> None:
        self.raw_connection_url = connection_url
        self.connection_url = normalize_postgres_url(connection_url)
        self.connect_timeout = connect_timeout

    @property
    def provider_name(self) -> str:
        return "postgres"

    def _connect(self) -> psycopg.Connection:
        """Create a direct connection to PostgreSQL with dict_row factory."""
        try:
            conn = psycopg.connect(
                self.connection_url,
                row_factory=dict_row,
                autocommit=False,
                connect_timeout=self.connect_timeout,
            )
            return conn
        except Exception as exc:
            raise ConnectionError(
                f"Failed to connect to PostgreSQL database at {self._sanitized_url()}: {exc}"
            ) from exc


    def _sanitized_url(self) -> str:
        """Hide password in database URL for safe logging."""
        return re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", self.connection_url)

    def _set_auth_context(self, cursor: psycopg.Cursor, user_id: str) -> None:
        """Set local session context so Supabase RLS policies (auth.uid() = user_id) work."""
        try:
            cursor.execute("SELECT set_config('request.jwt.claim.sub', %s, true);", (user_id,))
            cursor.execute("SELECT set_config('request.jwt.claim.role', %s, true);", ("authenticated",))
            cursor.execute("SET LOCAL ROLE authenticated;")
        except Exception:
            # If running against an engine where set_config or authenticated role is not supported, ignore harmlessly
            pass

    def init_db(self, allow_schema_creation: bool | None = None) -> None:
        """Verify that foundational schema exists. Ad-hoc DDL is blocked unless explicitly enabled."""
        if allow_schema_creation is None:
            allow_schema_creation = os.getenv("SYLLORA_ALLOW_AD_HOC_DDL", "false").strip().lower() in ("true", "1")

        with self._connect() as conn:
            with conn.cursor() as cur:
                # Check whether study_documents and document_chunks already exist
                cur.execute(
                    """
                    SELECT count(*) FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                      AND table_name IN ('study_documents', 'document_chunks');
                    """
                )
                existing_count = cur.fetchone()["count"]
                if existing_count >= 2:
                    return

                if not allow_schema_creation:
                    raise RuntimeError(
                        "Hosted database tables ('study_documents', 'document_chunks') are not yet created. "
                        "Execute the official Syllora foundation migration "
                        "(supabase/migrations/20261013000001_syllora_foundation.sql) to set up tables and RLS."
                    )

                # Enabled only when explicitly requested (e.g. isolated test environments)
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS public.study_documents (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id uuid NOT NULL,
                        course_id uuid,
                        filename text NOT NULL,
                        title text NOT NULL,
                        storage_path text NOT NULL,
                        sha256 text NOT NULL,
                        size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
                        page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
                        chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
                        index_status text NOT NULL DEFAULT 'indexed'
                            CHECK (index_status IN ('pending','processing','indexed','failed')),
                        index_error text,
                        created_at timestamptz NOT NULL DEFAULT now(),
                        updated_at timestamptz NOT NULL DEFAULT now(),
                        UNIQUE (user_id, sha256),
                        UNIQUE (id, user_id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_study_documents_user_created
                        ON public.study_documents(user_id, created_at DESC);
                    """
                )
                # Ensure document_chunks exists
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS public.document_chunks (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id uuid NOT NULL,
                        document_id uuid NOT NULL,
                        page_number integer NOT NULL CHECK (page_number >= 1),
                        chunk_index integer NOT NULL CHECK (chunk_index >= 0),
                        content text NOT NULL,
                        embedding extensions.vector(768),
                        embedding_model text NOT NULL DEFAULT 'nomic-embed-text',
                        created_at timestamptz NOT NULL DEFAULT now(),
                        UNIQUE (document_id, page_number, chunk_index),
                        UNIQUE (id, user_id),
                        FOREIGN KEY (document_id, user_id)
                            REFERENCES public.study_documents(id, user_id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_document_chunks_user_doc
                        ON public.document_chunks(user_id, document_id);
                    CREATE INDEX IF NOT EXISTS idx_document_chunks_embed_model
                        ON public.document_chunks(embedding_model);
                    """
                )
            conn.commit()

    def document_hash_exists(self, sha256: str, user_id: str | None = None) -> bool:
        uid = _to_valid_uuid(user_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    "SELECT 1 FROM public.study_documents WHERE user_id = %s AND sha256 = %s",
                    (uid, sha256),
                )
                row = cur.fetchone()
                return row is not None

    def get_document_by_hash(self, sha256: str, user_id: str | None = None) -> dict[str, Any] | None:
        uid = _to_valid_uuid(user_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    SELECT id::text, filename, title, storage_path, sha256, size_bytes,
                           page_count, chunk_count, index_status, index_error, mime_type,
                           created_at::text, updated_at::text
                    FROM public.study_documents
                    WHERE user_id = %s AND sha256 = %s
                    """,
                    (uid, sha256),
                )
                row = cur.fetchone()
        if not row:
            return None
        document = dict(row)
        document["storage_filename"] = document.get("storage_path", "")
        document["status"] = document.get("index_status", "completed")
        return document

    def insert_document(
        self,
        document: dict[str, Any],
        chunks: list[dict[str, Any]],
        pages: list[dict[str, Any]] | None = None,
        user_id: str | None = None,
    ) -> None:
        uid = _to_valid_uuid(user_id or document.get("user_id"))
        doc_id = _to_valid_uuid(document["id"])
        storage_path = document.get("storage_path") or document.get("storage_filename") or f"{uid}/{doc_id}.pdf"
        created_at = document.get("created_at") or datetime.now(timezone.utc).isoformat()
        mime_type = document.get("mime_type") or "application/pdf"
        status = document.get("index_status") or document.get("status") or "completed"
        error = document.get("index_error") or document.get("error")

        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    INSERT INTO public.study_documents
                        (id, user_id, filename, title, storage_path, sha256,
                         size_bytes, page_count, chunk_count, index_status, index_error, mime_type, created_at, updated_at)
                    VALUES
                        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id, user_id) DO UPDATE SET
                        filename = EXCLUDED.filename,
                        title = EXCLUDED.title,
                        storage_path = EXCLUDED.storage_path,
                        chunk_count = EXCLUDED.chunk_count,
                        page_count = EXCLUDED.page_count,
                        index_status = EXCLUDED.index_status,
                        index_error = EXCLUDED.index_error,
                        mime_type = EXCLUDED.mime_type,
                        updated_at = now()
                    """,
                    (
                        doc_id,
                        uid,
                        document["filename"],
                        document["title"],
                        storage_path,
                        document["sha256"],
                        document["size_bytes"],
                        document.get("page_count", 0),
                        len(chunks),
                        status,
                        error,
                        mime_type,
                        created_at,
                        created_at,
                    ),
                )

                if pages:
                    page_rows = []
                    for p in pages:
                        p_num = p["page_number"]
                        p_text = p.get("extracted_text") or p.get("text", "")
                        p_meta = json.dumps(p.get("page_metadata") or p.get("metadata") or {})
                        page_rows.append((
                            uid,
                            doc_id,
                            p_num,
                            p_text,
                            p_meta,
                            created_at,
                        ))

                    cur.executemany(
                        """
                        INSERT INTO public.document_pages
                            (user_id, document_id, page_number, extracted_text, page_metadata, created_at)
                        VALUES
                            (%s, %s, %s, %s, %s::jsonb, %s)
                        ON CONFLICT (document_id, page_number) DO UPDATE SET
                            extracted_text = EXCLUDED.extracted_text,
                            page_metadata = EXCLUDED.page_metadata
                        """,
                        page_rows,
                    )

                if chunks:
                    chunk_rows = []
                    for chunk in chunks:
                        c_id = _to_valid_uuid(chunk["id"])
                        vec_str = _format_vector(chunk["embedding"]) if chunk.get("embedding") is not None else None
                        text = chunk.get("text") or chunk.get("content", "")
                        chunk_meta = json.dumps(chunk.get("metadata") or {})
                        chunk_rows.append((
                            c_id,
                            uid,
                            doc_id,
                            chunk["page_number"],
                            chunk["chunk_index"],
                            text,
                            vec_str,
                            chunk.get("embedding_model", "nomic-embed-text"),
                            chunk_meta,
                            created_at,
                        ))

                    cur.executemany(
                        """
                        INSERT INTO public.document_chunks
                            (id, user_id, document_id, page_number, chunk_index,
                             content, embedding, embedding_model, metadata, created_at)
                        VALUES
                            (%s, %s, %s, %s, %s, %s, %s::extensions.vector, %s, %s::jsonb, %s)
                        ON CONFLICT (document_id, page_number, chunk_index) DO UPDATE SET
                            content = EXCLUDED.content,
                            embedding = EXCLUDED.embedding,
                            metadata = EXCLUDED.metadata
                        """,
                        chunk_rows,
                    )
            conn.commit()

    def update_document_status(
        self,
        document_id: str,
        status: str,
        error: str | None = None,
        user_id: str | None = None,
    ) -> None:
        uid = _to_valid_uuid(user_id)
        doc_id = _to_valid_uuid(document_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    UPDATE public.study_documents
                    SET index_status = %s, index_error = %s, updated_at = now()
                    WHERE id = %s AND user_id = %s;
                    """,
                    (status, error, doc_id, uid),
                )
            conn.commit()

    def claim_next_pending_document(self) -> dict[str, Any] | None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    WITH candidate AS (
                        SELECT id, user_id
                        FROM public.study_documents
                        WHERE (
                            index_status = 'pending'
                            AND next_attempt_at <= now()
                            AND index_attempts < 3
                        ) OR (
                            index_status = 'processing'
                            AND updated_at <= now() - interval '10 minutes'
                            AND index_attempts < 3
                        )
                        ORDER BY created_at ASC
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                    )
                    UPDATE public.study_documents AS document
                    SET index_status = 'processing',
                        index_error = NULL,
                        index_attempts = document.index_attempts + 1,
                        updated_at = now()
                    FROM candidate
                    WHERE document.id = candidate.id
                      AND document.user_id = candidate.user_id
                    RETURNING document.id::text AS id, document.user_id::text AS user_id,
                              document.filename, document.title, document.storage_path AS storage_filename,
                              document.storage_path, document.sha256, document.size_bytes,
                              document.page_count, document.chunk_count, document.mime_type,
                              document.created_at::text AS created_at, document.index_attempts
                    """
                )
                row = cur.fetchone()
            conn.commit()
        return dict(row) if row else None

    def fail_document_index(self, document_id: str, user_id: str, error: str) -> None:
        uid = _to_valid_uuid(user_id)
        doc_id = _to_valid_uuid(document_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE public.study_documents
                    SET index_status = CASE WHEN index_attempts >= 3 THEN 'failed' ELSE 'pending' END,
                        index_error = %s,
                        next_attempt_at = CASE
                            WHEN index_attempts >= 3 THEN next_attempt_at
                            ELSE now() + CASE WHEN index_attempts = 1
                                THEN interval '30 seconds'
                                ELSE interval '120 seconds'
                            END
                        END,
                        updated_at = now()
                    WHERE id = %s AND user_id = %s
                    """,
                    (error[:1000], doc_id, uid),
                )
            conn.commit()

    def retry_document_index(self, document_id: str, user_id: str) -> bool:
        uid = _to_valid_uuid(user_id)
        doc_id = _to_valid_uuid(document_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    UPDATE public.study_documents
                    SET index_status = 'pending', index_error = NULL, index_attempts = 0,
                        next_attempt_at = now(), updated_at = now()
                    WHERE id = %s AND user_id = %s AND index_status = 'failed'
                    """,
                    (doc_id, uid),
                )
                changed = cur.rowcount > 0
            conn.commit()
        return changed

    def get_document_pages(
        self, document_id: str, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        uid = _to_valid_uuid(user_id)
        doc_id = _to_valid_uuid(document_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    SELECT id::text, document_id::text, page_number, extracted_text,
                           page_metadata, created_at::text
                    FROM public.document_pages
                    WHERE document_id = %s AND user_id = %s
                    ORDER BY page_number ASC;
                    """,
                    (doc_id, uid),
                )
                return [dict(r) for r in cur.fetchall()]

    def list_documents(self, user_id: str | None = None) -> list[dict[str, Any]]:
        uid = _to_valid_uuid(user_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    SELECT id::text, filename, title, storage_path, sha256, size_bytes,
                           page_count, chunk_count, index_status, index_error, mime_type,
                           created_at::text, updated_at::text
                    FROM public.study_documents
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    """,
                    (uid,),
                )
                rows = cur.fetchall()
        result = []
        for r in rows:
            item = dict(r)
            item["storage_filename"] = item.get("storage_path", "")
            item["status"] = item.get("index_status", "completed")
            result.append(item)
        return result

    def get_document(self, document_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        uid = _to_valid_uuid(user_id)
        doc_id = _to_valid_uuid(document_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    SELECT id::text, filename, title, storage_path, sha256, size_bytes,
                           page_count, chunk_count, index_status, index_error, mime_type,
                           created_at::text, updated_at::text
                    FROM public.study_documents
                    WHERE id = %s AND user_id = %s
                    """,
                    (doc_id, uid),
                )
                row = cur.fetchone()
        if not row:
            return None
        res = dict(row)
        res["storage_filename"] = res.get("storage_path", "")
        res["status"] = res.get("index_status", "completed")
        return res


    def delete_document(self, document_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        uid = _to_valid_uuid(user_id)
        doc_id = _to_valid_uuid(document_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    SELECT id::text, storage_path
                    FROM public.study_documents
                    WHERE id = %s AND user_id = %s
                    """,
                    (doc_id, uid),
                )
                row = cur.fetchone()
                if not row:
                    return None
                storage_filename = row["storage_path"]
                cur.execute(
                    "DELETE FROM public.study_documents WHERE id = %s AND user_id = %s",
                    (doc_id, uid),
                )
            conn.commit()
        return {"id": doc_id, "storage_filename": storage_filename}

    def load_search_chunks(
        self, embedding_model: str, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        uid = _to_valid_uuid(user_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    """
                    SELECT c.id::text, c.document_id::text, c.page_number, c.chunk_index,
                           c.content AS text, c.embedding::text AS embedding_str,
                           768 AS embedding_dim, c.embedding_model,
                           d.filename, d.title
                    FROM public.document_chunks c
                    JOIN public.study_documents d
                      ON d.id = c.document_id AND d.user_id = c.user_id
                    WHERE c.user_id = %s AND c.embedding_model = %s
                    ORDER BY d.created_at, c.page_number, c.chunk_index
                    """,
                    (uid, embedding_model),
                )
                rows = cur.fetchall()

        records = []
        for r in rows:
            item = dict(r)
            raw_emb = item.pop("embedding_str", "")
            item["embedding"] = _parse_vector_to_bytes(raw_emb, expected_dim=768)
            records.append(item)
        return records

    def count_chunks(self, user_id: str | None = None) -> int:
        uid = _to_valid_uuid(user_id)
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                cur.execute(
                    "SELECT COUNT(*) AS count FROM public.document_chunks WHERE user_id = %s",
                    (uid,),
                )
                row = cur.fetchone()
        return int(row["count"]) if row else 0

    def match_chunks_vector(
        self,
        query_embedding: list[float],
        match_count: int = 5,
        user_id: str | None = None,
        course_id: str | None = None,
        document_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        uid = _to_valid_uuid(user_id)
        q_vec_str = _format_vector(query_embedding)
        cid = _to_valid_uuid(course_id) if course_id else None
        d_ids = [_to_valid_uuid(d) for d in document_ids] if document_ids else None

        with self._connect() as conn:
            with conn.cursor() as cur:
                self._set_auth_context(cur, uid)
                # First try the stored procedure public.match_document_chunks if available
                try:
                    cur.execute(
                        """
                        SELECT chunk_id::text, document_id::text, page_number,
                               chunk_index, content, filename, title, similarity
                        FROM public.match_document_chunks(
                            %s::extensions.vector,
                            %s,
                            %s,
                            %s
                        )
                        """,
                        (q_vec_str, match_count, cid, d_ids),
                    )
                    rows = cur.fetchall()
                    return [dict(r) for r in rows]
                except Exception:
                    # Fallback to direct inline cosine similarity query if function not defined
                    conn.rollback()
                    self._set_auth_context(cur, uid)
                    cur.execute(
                        """
                        SELECT c.id::text AS chunk_id, c.document_id::text AS document_id,
                               c.page_number, c.chunk_index, c.content,
                               d.filename, d.title,
                               1 - (c.embedding <=> %s::extensions.vector) AS similarity
                        FROM public.document_chunks c
                        JOIN public.study_documents d ON d.id = c.document_id AND d.user_id = c.user_id
                        WHERE c.user_id = %s AND c.embedding IS NOT NULL
                          AND (%s::uuid[] IS NULL OR c.document_id = ANY(%s::uuid[]))
                        ORDER BY c.embedding <=> %s::extensions.vector
                        LIMIT %s
                        """,
                        (q_vec_str, uid, d_ids, d_ids, q_vec_str, match_count),
                    )
                    rows = cur.fetchall()
                    return [dict(r) for r in rows]
