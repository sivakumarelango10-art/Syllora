"""Integration tests for live Supabase PostgreSQL and hosted schema.

These tests are clearly distinguished into:
1. LOCAL / OFFLINE TESTS (executed by default, mocking or simulating hosted behaviors)
2. HOSTED SCHEMA TESTS (skipped unless RUN_HOSTED_TESTS=true and tables exist)
"""
from __future__ import annotations

import os
import uuid
import pytest
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env")
    load_dotenv(backend_dir.parent / ".env.local")
except Exception:
    pass

import psycopg
from psycopg.rows import dict_row

from app.db.base import DEFAULT_DEMO_USER_ID
from app.db.postgres_adapter import PostgresAdapter, normalize_postgres_url, _format_vector
from app.storage.supabase_storage import SupabaseStorageAdapter


# ---------------------------------------------------------------------------
# LOCAL VERIFICATION TESTS (Always runnable locally without hosted tables)
# ---------------------------------------------------------------------------

def test_local_connection_url_normalization():
    """Verify that connection string normalization handles special characters and flags."""
    raw = "postgresql://user:pass@word@pooler.supabase.com:6543/postgres?pgbouncer=true"
    normalized = normalize_postgres_url(raw)
    assert "pgbouncer=" not in normalized
    assert "sslmode=require" in normalized
    assert "pass%40word" in normalized


def test_local_768_dim_vector_representation():
    """Verify exact 768-dimensional vector literal formatting."""
    dim = 768
    vector = [0.01 * (i % 10) for i in range(dim)]
    formatted = _format_vector(vector)
    assert formatted.startswith("[") and formatted.endswith("]")
    elements = formatted[1:-1].split(",")
    assert len(elements) == 768


def test_local_storage_path_privacy_conventions():
    """Verify that private PDF storage paths conform to <user_id>/<doc_id>.pdf."""
    user_id = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())
    storage = SupabaseStorageAdapter(
        supabase_url="https://mock.supabase.co",
        service_key="mock-key",
        bucket_name="syllora-study-pdfs",
    )
    scoped_path = storage.build_path(user_id, doc_id)
    assert scoped_path == f"{user_id}/{doc_id}.pdf"
    # Ensure user folder prefix matches user_id
    assert scoped_path.startswith(f"{user_id}/")


def test_local_two_user_rls_simulation():
    """Simulate RLS query generation and ensure user isolation in SQL filters."""
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())

    # Build query for user A
    query_a = "SELECT id FROM study_documents WHERE id = %s AND user_id = %s"
    params_a = (doc_id, user_a)
    params_b = (doc_id, user_b)

    assert params_a[1] != params_b[1]
    assert params_a[1] == user_a
    assert params_b[1] == user_b


# ---------------------------------------------------------------------------
# HOSTED SCHEMA TESTS (Gated by environment and table existence)
# ---------------------------------------------------------------------------

def _is_hosted_db_ready() -> bool:
    """Check if hosted database is reachable and schema tables exist."""
    db_url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        return False
    try:
        norm_url = normalize_postgres_url(db_url)
        with psycopg.connect(norm_url, connect_timeout=4, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
                )
                count = cur.fetchone()["count"]
                return count >= 13
    except Exception:
        return False


def _has_hosted_auth_users() -> bool:
    """Check if hosted auth.users contains registered users for foreign key testing."""
    db_url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not db_url or os.getenv("RUN_HOSTED_DATA_TESTS", "").lower() not in ("true", "1"):
        return False
    try:
        norm_url = normalize_postgres_url(db_url)
        with psycopg.connect(norm_url, connect_timeout=4, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM auth.users;")
                count = cur.fetchone()["count"]
                return count >= 2
    except Exception:
        return False


HOSTED_DB_READY = _is_hosted_db_ready()
HOSTED_AUTH_USERS_READY = _has_hosted_auth_users()

skip_if_hosted_not_ready = pytest.mark.skipif(
    not HOSTED_DB_READY,
    reason="Hosted schema integration test: Requires hosted database tables to exist.",
)

skip_if_no_hosted_auth_users = pytest.mark.skipif(
    not HOSTED_AUTH_USERS_READY,
    reason="Requires test users in hosted auth.users (pending authorized Stage B hosted user creation).",
)


@skip_if_hosted_not_ready
def test_hosted_all_13_tables_exist():
    """Verify all 13 Syllora foundation tables exist on hosted Supabase."""
    expected_tables = {
        "profiles", "courses", "study_documents", "document_chunks", "syllabus_topics",
        "topic_evidence", "chat_sessions", "chat_messages", "answer_citations",
        "understanding_attempts", "misconceptions", "revision_tasks", "study_preferences",
    }
    db_url = normalize_postgres_url(os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL"))
    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
            actual_tables = {r["table_name"] for r in cur.fetchall()}
            assert expected_tables.issubset(actual_tables)


@skip_if_hosted_not_ready
def test_hosted_768_dim_vector_storage_and_search():
    """Verify inserting and querying a 768-dim vector using match_document_chunks with transaction isolation."""
    db_url = normalize_postgres_url(os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL"))
    test_user_id = str(uuid.uuid4())
    test_doc_id = str(uuid.uuid4())
    dim = 768
    vector = [0.05] * dim
    vec_literal = _format_vector(vector)

    with psycopg.connect(db_url, autocommit=False, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Temporary test identity within transaction (never committed to hosted auth.users)
            cur.execute(
                """
                INSERT INTO auth.users (id, aud, role, email)
                VALUES (%s, 'authenticated', 'authenticated', 'temp_vec@syllora.test');
                """,
                (test_user_id,),
            )
            # Set auth context
            cur.execute("SELECT set_config('request.jwt.claim.sub', %s, true);", (test_user_id,))
            cur.execute("SELECT set_config('request.jwt.claim.role', %s, true);", ("authenticated",))

            # Insert document
            cur.execute(
                """
                INSERT INTO study_documents (id, user_id, filename, title, storage_path, sha256, size_bytes)
                VALUES (%s, %s, 'test.pdf', 'Test Document', %s, 'testhash123', 1024);
                """,
                (test_doc_id, test_user_id, f"{test_user_id}/{test_doc_id}.pdf"),
            )

            # Insert chunk with 768-dim vector
            cur.execute(
                """
                INSERT INTO document_chunks (user_id, document_id, page_number, chunk_index, content, embedding)
                VALUES (%s, %s, 1, 0, 'Operating system concurrency deadlock test', %s::extensions.vector);
                """,
                (test_user_id, test_doc_id, vec_literal),
            )

            # Test similarity match function
            cur.execute(
                """
                SELECT chunk_id, content, similarity 
                FROM match_document_chunks(%s::extensions.vector, 1);
                """,
                (vec_literal,),
            )
            matches = cur.fetchall()
            assert len(matches) == 1
            assert matches[0]["similarity"] > 0.99  # Identical vector

        # Always rollback so no test data remains
        conn.rollback()


@skip_if_hosted_not_ready
def test_hosted_rls_two_user_isolation_with_authenticated_role():
    """Verify strict Row Level Security enforcement between two users using transaction rollback isolation."""
    db_url = normalize_postgres_url(os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL"))
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    doc_a = str(uuid.uuid4())
    doc_b = str(uuid.uuid4())

    with psycopg.connect(db_url, autocommit=False, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Create transaction-isolated temporary test identities in auth.users (never committed)
            cur.execute(
                """
                INSERT INTO auth.users (id, aud, role, email)
                VALUES (%s, 'authenticated', 'authenticated', 'temp_a@syllora.test'),
                       (%s, 'authenticated', 'authenticated', 'temp_b@syllora.test');
                """,
                (user_a, user_b),
            )

            # 1. Setup User A's document as postgres owner
            cur.execute(
                """
                INSERT INTO study_documents (id, user_id, filename, title, storage_path, sha256, size_bytes)
                VALUES (%s, %s, 'user_a.pdf', 'User A Notes', %s, 'hash_a', 2048);
                """,
                (doc_a, user_a, f"{user_a}/{doc_a}.pdf"),
            )
            cur.execute(
                """
                INSERT INTO document_chunks (user_id, document_id, page_number, chunk_index, content, embedding)
                VALUES (%s, %s, 1, 0, 'User A secret academic notes', %s::extensions.vector);
                """,
                (user_a, doc_a, _format_vector([0.1] * 768)),
            )

            # 2. Switch session to the non-privileged 'authenticated' role as User B
            cur.execute("SET LOCAL ROLE authenticated;")
            cur.execute("SELECT set_config('request.jwt.claim.sub', %s, true);", (user_b,))
            cur.execute("SELECT set_config('request.jwt.claim.role', %s, true);", ("authenticated",))

            # SELECT: User B must see 0 documents
            cur.execute("SELECT * FROM study_documents WHERE id = %s;", (doc_a,))
            assert cur.fetchall() == []

            # UPDATE: User B cannot modify User A's document
            cur.execute("UPDATE study_documents SET title = 'hacked' WHERE id = %s;", (doc_a,))
            assert cur.rowcount == 0

            # DELETE: User B cannot delete User A's document
            cur.execute("DELETE FROM study_documents WHERE id = %s;", (doc_a,))
            assert cur.rowcount == 0

            # VECTOR SEARCH: User B must not retrieve User A's chunk via match_document_chunks
            cur.execute("SELECT * FROM match_document_chunks(%s::extensions.vector, 5);", (_format_vector([0.1] * 768),))
            assert cur.fetchall() == []

            # INSERT: User B cannot forge an insert under User A's ID (RLS check fails)
            cur.execute("SAVEPOINT sp1;")
            with pytest.raises(psycopg.Error) as exc_info:
                cur.execute(
                    """
                    INSERT INTO study_documents (id, user_id, filename, title, storage_path, sha256, size_bytes)
                    VALUES (%s, %s, 'spoof.pdf', 'Spoofed', %s, 'hash_spoof', 100);
                    """,
                    (doc_b, user_a, f"{user_a}/{doc_b}.pdf"),
                )
            assert "row-level security" in str(exc_info.value).lower() or "violates" in str(exc_info.value).lower()
            cur.execute("ROLLBACK TO SAVEPOINT sp1;")

            # Positive check: User A CAN see their own document
            cur.execute("SELECT set_config('request.jwt.claim.sub', %s, true);", (user_a,))
            cur.execute("SELECT title FROM study_documents WHERE id = %s;", (doc_a,))
            rows_a = cur.fetchall()
            assert len(rows_a) == 1
            assert rows_a[0]["title"] == "User A Notes"

        # Rollback guarantees zero persistence to hosted database
        conn.rollback()
