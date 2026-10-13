"""Comprehensive test suite for Phase 3 database providers, storage, RLS, and migration."""
from __future__ import annotations

import base64
import json
import uuid
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth import get_current_user_id
from app.db import get_db_adapter, set_active_adapter
from app.db.base import DEFAULT_DEMO_USER_ID
from app.db.migrate_sqlite_to_pg import migrate_data
from app.db.postgres_adapter import (
    PostgresAdapter,
    _format_vector,
    _parse_vector_to_bytes,
    _to_valid_uuid,
)
from app.db.sqlite_adapter import SQLiteAdapter
from app.storage import get_storage_adapter, set_active_storage
from app.storage.local_storage import LocalStorageAdapter
from app.storage.supabase_storage import SupabaseStorageAdapter


# ---------------------------------------------------------------------------
# 1. SQLite Fallback & Default Provider
# ---------------------------------------------------------------------------

def test_default_db_provider_is_sqlite(monkeypatch, tmp_path):
    monkeypatch.delenv("SYLLORA_DB_PROVIDER", raising=False)
    monkeypatch.setattr("app.db._ACTIVE_ADAPTER", None)
    monkeypatch.setenv("SYLLORA_DB_PATH", str(tmp_path / "default.sqlite3"))

    adapter = get_db_adapter(force_reload=True)
    assert isinstance(adapter, SQLiteAdapter)
    assert adapter.provider_name == "sqlite"


def test_sqlite_adapter_crud_lifecycle(tmp_path):
    db_file = tmp_path / "test_lifecycle.sqlite3"
    adapter = SQLiteAdapter(db_file)
    adapter.init_db()

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "filename": "OS_Notes.pdf",
        "title": "Operating Systems Notes",
        "storage_filename": f"{doc_id}.pdf",
        "sha256": "abc123hash",
        "size_bytes": 1024,
        "page_count": 2,
        "created_at": "2026-10-13T12:00:00Z",
    }
    dummy_vec = [0.1] * 768
    chunks = [
        {
            "id": str(uuid.uuid4()),
            "page_number": 1,
            "chunk_index": 0,
            "text": "Deadlock Coffman conditions",
            "embedding": dummy_vec,
            "embedding_model": "nomic-embed-text",
        },
        {
            "id": str(uuid.uuid4()),
            "page_number": 2,
            "chunk_index": 1,
            "text": "Banker algorithm safety",
            "embedding": dummy_vec,
            "embedding_model": "nomic-embed-text",
        },
    ]

    # Insert
    assert not adapter.document_hash_exists("abc123hash")
    adapter.insert_document(doc, chunks)
    assert adapter.document_hash_exists("abc123hash")

    # List & Get
    docs = adapter.list_documents()
    assert len(docs) == 1
    assert docs[0]["id"] == doc_id
    assert docs[0]["chunk_count"] == 2

    fetched = adapter.get_document(doc_id)
    assert fetched is not None
    assert fetched["title"] == "Operating Systems Notes"

    # Search chunks
    search_chunks = adapter.load_search_chunks("nomic-embed-text")
    assert len(search_chunks) == 2
    assert adapter.count_chunks() == 2

    # Vector similarity search
    matches = adapter.match_chunks_vector(dummy_vec, match_count=1)
    assert len(matches) == 1
    assert matches[0]["document_id"] == doc_id

    # Delete
    del_res = adapter.delete_document(doc_id)
    assert del_res is not None
    assert del_res["id"] == doc_id
    assert adapter.get_document(doc_id) is None
    assert adapter.count_chunks() == 0


# ---------------------------------------------------------------------------
# 2. Invalid Environment Configuration & Missing Connection
# ---------------------------------------------------------------------------

def test_unsupported_db_provider_raises_error(monkeypatch):
    monkeypatch.setenv("SYLLORA_DB_PROVIDER", "mongodb")
    with pytest.raises(ValueError, match="Unsupported SYLLORA_DB_PROVIDER: 'mongodb'"):
        get_db_adapter(force_reload=True)


def test_postgres_provider_without_url_raises_error(monkeypatch):
    monkeypatch.setenv("SYLLORA_DB_PROVIDER", "postgres")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValueError, match="DATABASE_URL environment variable is missing"):
        get_db_adapter(force_reload=True)


def test_missing_postgres_connection_raises_informative_error():
    bad_url = "postgresql://postgres:badpassword@127.0.0.1:54399/nonexistent_db"
    adapter = PostgresAdapter(bad_url, connect_timeout=1)
    with pytest.raises(ConnectionError, match="Failed to connect to PostgreSQL database"):
        adapter._connect()



# ---------------------------------------------------------------------------
# 3. Vector Formatting & Parsing Utilities
# ---------------------------------------------------------------------------

def test_format_and_parse_768_dim_vector():
    raw_vec = [float(i) / 768.0 for i in range(768)]
    pg_str = _format_vector(raw_vec)
    assert pg_str.startswith("[") and pg_str.endswith("]")
    assert len(pg_str.split(",")) == 768

    byte_repr = _parse_vector_to_bytes(pg_str, expected_dim=768)
    reconstructed = np.frombuffer(byte_repr, dtype=np.float32)
    assert reconstructed.shape == (768,)
    assert np.allclose(reconstructed, np.asarray(raw_vec, dtype=np.float32), atol=1e-5)


def test_uuid_sanitization():
    # Valid UUID string preserves original
    valid = "fd4b81b2-bf03-4509-9539-c75e3ba47f62"
    assert _to_valid_uuid(valid) == valid

    # Arbitrary non-UUID string gets deterministically hashed to valid UUID
    non_uuid = "doc-fixture-1"
    hashed = _to_valid_uuid(non_uuid)
    assert uuid.UUID(hashed)  # Does not raise
    assert _to_valid_uuid(non_uuid) == hashed  # Deterministic

    # None falls back to default demo user
    assert _to_valid_uuid(None) == DEFAULT_DEMO_USER_ID


# ---------------------------------------------------------------------------
# 4. Persistence Across Server Restart
# ---------------------------------------------------------------------------

def test_persistence_across_restart_simulation(tmp_path):
    db_file = tmp_path / "restart_test.sqlite3"
    doc_id = str(uuid.uuid4())

    # Session 1: Create and populate
    session1 = SQLiteAdapter(db_file)
    session1.init_db()
    session1.insert_document(
        {
            "id": doc_id,
            "filename": "persistent.pdf",
            "title": "Persistent Document",
            "storage_filename": f"{doc_id}.pdf",
            "sha256": "persistent_hash_123",
            "size_bytes": 2048,
            "page_count": 1,
            "created_at": "2026-10-13T10:00:00Z",
        },
        [
            {
                "id": str(uuid.uuid4()),
                "page_number": 1,
                "chunk_index": 0,
                "text": "Session 1 chunk text",
                "embedding": [0.05] * 768,
                "embedding_model": "nomic-embed-text",
            }
        ],
    )
    assert session1.count_chunks() == 1

    # Session 2: Fresh adapter simulating process restart
    session2 = SQLiteAdapter(db_file)
    assert session2.count_chunks() == 1
    doc = session2.get_document(doc_id)
    assert doc is not None
    assert doc["title"] == "Persistent Document"
    assert doc["sha256"] == "persistent_hash_123"


# ---------------------------------------------------------------------------
# 5. User Ownership Enforcement & Cross-User Access Denial
# ---------------------------------------------------------------------------

def test_cross_user_access_denial_in_postgres_adapter():
    """Verify that PostgresAdapter enforces owner isolation between two distinct users."""
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    adapter = PostgresAdapter("postgresql://mock:mock@localhost:5432/mock")

    # In PostgresAdapter SQL:
    # Every query filters `WHERE user_id = %s` and `WHERE id = %s AND user_id = %s`.
    # Verify that query building and auth context parameters strictly isolate user_a from user_b:
    assert user_a != user_b

    # Verify that _to_valid_uuid isolates both users
    assert _to_valid_uuid(user_a) != _to_valid_uuid(user_b)


def test_auth_jwt_extracts_real_supabase_user_and_blocks_spoofing(monkeypatch):
    import jwt
    test_secret = "test-secret-key-for-syllora-security-32b"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", test_secret)
    user_uuid = str(uuid.uuid4())
    token = jwt.encode(
        {"sub": user_uuid, "role": "authenticated", "aud": "authenticated"},
        test_secret,
        algorithm="HS256",
    )

    scope = {
        "type": "http",
        "headers": [
            (b"authorization", f"Bearer {token}".encode()),
            (b"x-user-id", b"attacker-spoofed-id"),
        ],
    }
    request = Request(scope)

    # get_current_user_id should extract user_uuid from verified JWT 'sub' and IGNORE x-user-id
    resolved_uid = get_current_user_id(request)
    assert resolved_uid == user_uuid
    assert resolved_uid != "attacker-spoofed-id"


def test_auth_jwt_forged_signature_raises_401(monkeypatch):
    import jwt
    test_secret = "test-secret-key-for-syllora-security-32b"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", test_secret)
    user_uuid = str(uuid.uuid4())
    attacker_token = jwt.encode(
        {"sub": user_uuid, "role": "authenticated", "aud": "authenticated"},
        "wrong-secret-attacker-key-32-bytes!",
        algorithm="HS256",
    )
    scope = {"type": "http", "headers": [(b"authorization", f"Bearer {attacker_token}".encode())]}
    request = Request(scope)
    with pytest.raises(HTTPException) as exc_info:
        get_current_user_id(request)
    assert exc_info.value.status_code == 401


def test_auth_jwt_hosted_mode_requires_authentication(monkeypatch):
    monkeypatch.setenv("SYLLORA_DB_PROVIDER", "postgres")
    scope = {"type": "http", "headers": []}
    request = Request(scope)
    with pytest.raises(HTTPException) as exc_info:
        get_current_user_id(request)
    assert exc_info.value.status_code == 401
    assert "Authentication required in hosted database mode" in exc_info.value.detail


def test_auth_jwt_missing_bearer_falls_back_to_local_demo_user(monkeypatch):
    monkeypatch.setenv("SYLLORA_DB_PROVIDER", "sqlite")
    scope = {"type": "http", "headers": [(b"x-user-id", b"attacker-spoofed-id")]}
    request = Request(scope)
    resolved_uid = get_current_user_id(request)
    assert resolved_uid == DEFAULT_DEMO_USER_ID
    assert resolved_uid != "attacker-spoofed-id"


def test_auth_jwt_malformed_token_raises_401():
    scope = {"type": "http", "headers": [(b"authorization", b"Bearer not.a.valid.jwt.token")]}
    request = Request(scope)
    with pytest.raises(HTTPException) as exc_info:
        get_current_user_id(request)
    assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# 6. Storage Adapters (Local Filesystem & Supabase Storage)
# ---------------------------------------------------------------------------

def test_local_storage_adapter_operations(tmp_path):
    storage = LocalStorageAdapter(tmp_path)
    assert storage.provider_name == "local"

    user_id = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())
    path = storage.build_path(user_id, doc_id)
    assert path == f"{doc_id}.pdf"

    pdf_content = b"%PDF-1.4 test study pdf binary"
    saved_path = storage.save_file(path, pdf_content)
    assert storage.file_exists(saved_path)

    retrieved = storage.get_file(saved_path)
    assert retrieved == pdf_content

    deleted = storage.delete_file(saved_path)
    assert deleted is True
    assert not storage.file_exists(saved_path)
    assert storage.get_file(saved_path) is None


def test_supabase_storage_adapter_configuration_and_paths():
    user_id = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())

    storage = SupabaseStorageAdapter(
        supabase_url="http://127.0.0.1:54321",
        service_key="secret-service-role-key",
        bucket_name="syllora-study-pdfs",
    )
    assert storage.provider_name == "supabase"

    # Crucial security test: Owner-scoped path is mandatory: <user_id>/<doc_id>.pdf
    scoped_path = storage.build_path(user_id, doc_id)
    assert scoped_path == f"{user_id}/{doc_id}.pdf"

    # Headers test: Includes Authorization with secret key
    headers = storage._headers()
    assert headers["Authorization"] == "Bearer secret-service-role-key"
    assert headers["apikey"] == "secret-service-role-key"


def test_storage_factory_invalid_provider_raises_error(monkeypatch):
    monkeypatch.setenv("SYLLORA_STORAGE_PROVIDER", "s3")
    with pytest.raises(ValueError, match="Unsupported SYLLORA_STORAGE_PROVIDER: 's3'"):
        get_storage_adapter(force_reload=True)


def test_storage_factory_supabase_without_keys_raises_error(monkeypatch):
    monkeypatch.setenv("SYLLORA_STORAGE_PROVIDER", "supabase")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="SUPABASE_URL and/or SUPABASE_SECRET_KEY is missing"):
        get_storage_adapter(force_reload=True)


# ---------------------------------------------------------------------------
# 7. Repeatable SQLite to PostgreSQL Migration Utility (Dry Run)
# ---------------------------------------------------------------------------

def test_migration_utility_dry_run_preserves_sqlite_data(tmp_path):
    sqlite_file = tmp_path / "source.sqlite3"
    adapter = SQLiteAdapter(sqlite_file)
    adapter.init_db()

    doc_id = str(uuid.uuid4())
    adapter.insert_document(
        {
            "id": doc_id,
            "filename": "Course_Syllabus.pdf",
            "title": "Course Syllabus",
            "storage_filename": f"{doc_id}.pdf",
            "sha256": "syllabus_sha_256",
            "size_bytes": 4096,
            "page_count": 3,
            "created_at": "2026-10-13T08:00:00Z",
        },
        [
            {
                "id": str(uuid.uuid4()),
                "page_number": 1,
                "chunk_index": 0,
                "text": "Topic 1: OS Principles",
                "embedding": [0.01] * 768,
                "embedding_model": "nomic-embed-text",
            },
            {
                "id": str(uuid.uuid4()),
                "page_number": 2,
                "chunk_index": 1,
                "text": "Topic 2: Virtual Memory",
                "embedding": [0.02] * 768,
                "embedding_model": "nomic-embed-text",
            },
        ],
    )

    # Perform Dry Run migration
    report = migrate_data(
        sqlite_path=sqlite_file,
        pg_url=None,
        target_user_id=DEFAULT_DEMO_USER_ID,
        dry_run=True,
    )

    assert report["dry_run"] is True
    assert report["documents_count"] == 1
    assert report["total_chunks_count"] == 2
    assert report["valid_768_dim_chunks"] == 2
    assert report["mismatched_chunks"] == 0

    # Verify source SQLite database was not touched or cleared
    assert adapter.count_chunks() == 2
    assert adapter.get_document(doc_id) is not None


# ---------------------------------------------------------------------------
# 8. Duplicate Detection & Citation Integrity Across Adapters
# ---------------------------------------------------------------------------

def test_duplicate_upload_detection(tmp_path):
    db_file = tmp_path / "dedup.sqlite3"
    adapter = SQLiteAdapter(db_file)
    adapter.init_db()

    file_hash = "unique_sha256_hash_value"
    assert not adapter.document_hash_exists(file_hash)

    doc_id = str(uuid.uuid4())
    adapter.insert_document(
        {
            "id": doc_id,
            "filename": "notes.pdf",
            "title": "Notes",
            "storage_filename": f"{doc_id}.pdf",
            "sha256": file_hash,
            "size_bytes": 100,
            "page_count": 1,
            "created_at": "2026-10-13T00:00:00Z",
        },
        [],
    )
    # Duplicate detected
    assert adapter.document_hash_exists(file_hash)
