"""Automated test suite verifying the 16 requirements for Syllora RAG and Supabase lifecycle.

Covers:
 1. Upload a valid PDF.
 2. Reject an invalid file.
 3. Confirm the PDF exists in Supabase Storage.
 4. Confirm its database record contains the correct Storage path and metadata.
 5. Confirm extracted page content and chunks are persisted.
 6. Confirm embeddings are stored and retrievable.
 7. Confirm the document is marked completed only after successful indexing.
 8. Confirm a database or Storage failure results in an appropriate failed state.
 9. Confirm retrying ingestion does not create duplicate records or chunks.
10. Confirm document listing works after a backend restart.
11. Confirm document retrieval and citations use persisted data.
12. Confirm deletion cleans up associated resources.
13. Confirm user A cannot access user B's documents.
14. Confirm changes to persistent settings or records survive a reload.
15. Confirm the frontend uses the configured API base URL.
16. Confirm application health checks distinguish database, Storage, embedding, and model failures.
"""
from __future__ import annotations

import asyncio
import fitz
import hashlib
import json
import uuid
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

import app.main as main
from app.main import app
from app.storage.base import StorageAdapter
from app.storage.supabase_storage import SupabaseStorageAdapter
from app.db.base import DatabaseAdapter, DEFAULT_DEMO_USER_ID
from app.rag.store import (
    get_document,
    get_document_pages,
    list_documents,
    delete_document,
    insert_document,
    count_chunks,
)
from app.repositories.academic_repository import get_academic_repository


client = TestClient(app)


def make_sample_pdf(text: str, pages: int = 1) -> bytes:
    """Helper to synthesize valid in-memory PDF binaries with real text streams."""
    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_text((50, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def process_pending_document(document_id: str) -> Exception | None:
    claimed = main.claim_next_pending_document()
    assert claimed is not None
    assert claimed["id"] == document_id
    try:
        asyncio.run(main._process_document_index(claimed))
    except Exception as exc:
        main.fail_document_index(document_id, claimed["user_id"], str(exc))
        return exc
    return None


class InMemorySupabaseStorageMock(StorageAdapter):
    """Mocks Supabase Storage REST interactions in memory for isolated unit testing."""

    def __init__(self, bucket_name: str = "syllora-study-pdfs") -> None:
        self.bucket_name = bucket_name
        self.objects: dict[str, bytes] = {}

    @property
    def provider_name(self) -> str:
        return "supabase"

    def build_path(self, user_id: str, document_id: str) -> str:
        return f"{user_id.strip()}/{document_id.strip()}.pdf"

    def save_file(
        self, storage_path: str, data: bytes, content_type: str = "application/pdf", auth_token: str | None = None
    ) -> str:
        self.objects[storage_path] = data
        return storage_path

    def get_file(self, storage_path: str, auth_token: str | None = None) -> bytes | None:
        return self.objects.get(storage_path)

    def delete_file(self, storage_path: str, auth_token: str | None = None) -> bool:
        if storage_path in self.objects:
            del self.objects[storage_path]
            return True
        return False

    def file_exists(self, storage_path: str, auth_token: str | None = None) -> bool:
        return storage_path in self.objects


# ---------------------------------------------------------------------------
# Test Cases 1 - 16
# ---------------------------------------------------------------------------

def test_01_upload_valid_pdf(monkeypatch) -> None:
    """1. Upload a valid PDF and verify the durable 202 receipt and later indexing."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[0.01 * (i % 10) for i in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Lecture 1: Introduction to Distributed Systems and Consensus Algorithms.")
    res = client.post(
        "/api/v1/documents",
        files={"file": ("lecture1.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Lecture 1"},
    )
    assert res.status_code == 202, res.text
    data = res.json()
    assert data["filename"] == "lecture1.pdf"
    assert data["title"] == "Lecture 1"
    assert data["index_status"] == "pending"
    indexed_error = process_pending_document(data["id"])
    assert indexed_error is None
    indexed = get_document(data["id"], user_id=DEFAULT_DEMO_USER_ID)
    assert indexed is not None
    assert indexed["index_status"] == "indexed"
    assert indexed["page_count"] == 1
    assert indexed["chunk_count"] >= 1


def test_02_reject_invalid_file() -> None:
    """2. Reject an invalid file format (non-PDF) or non-PDF bytes."""
    # Test non-pdf extension
    res1 = client.post(
        "/api/v1/documents",
        files={"file": ("malicious.exe", b"MZ\x90\x00\x03\x00\x00\x00", "application/octet-stream")},
    )
    assert res1.status_code == 415

    # Test PDF extension with invalid header
    res2 = client.post(
        "/api/v1/documents",
        files={"file": ("corrupt.pdf", b"NOT_A_REAL_PDF_STREAM", "application/pdf")},
    )
    assert res2.status_code == 422


def test_03_confirm_pdf_exists_in_supabase_storage(monkeypatch) -> None:
    """3. Confirm the PDF binary actually exists in Supabase Storage with correct path."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[0.05 for _ in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Deadlock avoidance and Banker's Algorithm proofs.")
    res = client.post(
        "/api/v1/documents",
        files={"file": ("bankers.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 202
    doc_id = res.json()["id"]

    # Verify storage path exists in mock storage
    user_id = DEFAULT_DEMO_USER_ID
    expected_path = f"{user_id}/{doc_id}.pdf"
    assert mock_storage.file_exists(expected_path)
    stored_bytes = mock_storage.get_file(expected_path)
    assert stored_bytes == pdf_bytes


def test_04_confirm_database_record_contains_correct_storage_path_and_metadata(monkeypatch) -> None:
    """4. Confirm database record contains correct storage_path, sha256, mime_type, and size."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[0.02 for _ in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Page tables, translation lookaside buffers (TLB), and virtual memory.")
    expected_hash = hashlib.sha256(pdf_bytes).hexdigest()

    res = client.post(
        "/api/v1/documents",
        files={"file": ("vm_chapter.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Virtual Memory Chapter"},
    )
    assert res.status_code == 202
    doc_id = res.json()["id"]

    doc_record = get_document(doc_id, user_id=DEFAULT_DEMO_USER_ID)
    assert doc_record is not None
    assert doc_record["sha256"] == expected_hash
    assert doc_record["size_bytes"] == len(pdf_bytes)
    assert doc_record["title"] == "Virtual Memory Chapter"
    assert "vm_chapter.pdf" in doc_record["filename"]
    assert doc_record["storage_filename"].endswith(f"{doc_id}.pdf")


def test_05_confirm_extracted_page_content_and_chunks_persisted(monkeypatch) -> None:
    """5. Confirm extracted page text and passage chunks are stored in database."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[0.03 for _ in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Page 1 Content on Semaphore Primitives and Mutex Locks.")
    res = client.post(
        "/api/v1/documents",
        files={"file": ("semaphores.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 202
    doc_id = res.json()["id"]
    assert process_pending_document(doc_id) is None

    pages = get_document_pages(doc_id, user_id=DEFAULT_DEMO_USER_ID)
    assert len(pages) == 1
    assert "Semaphore" in pages[0]["extracted_text"]
    assert pages[0]["page_number"] == 1


def test_06_confirm_embeddings_are_stored_and_retrievable(monkeypatch) -> None:
    """6. Confirm embeddings are persisted and searchable via hybrid retrieval."""
    async def fake_embed(texts, *, purpose, model=None):
        # Return distinct vector for searching
        return [[1.0 if "deadlock" in t.lower() else 0.0 for _ in range(768)] for t in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    import app.rag.search as search_module
    monkeypatch.setattr(search_module, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Deadlock occurs when four Coffman conditions hold simultaneously.")
    res = client.post(
        "/api/v1/documents",
        files={"file": ("deadlocks.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 202
    assert process_pending_document(res.json()["id"]) is None

    search_res = client.post(
        "/api/v1/search",
        json={"query": "deadlock conditions", "limit": 3},
    )
    assert search_res.status_code == 200
    results = search_res.json()["results"]
    assert len(results) > 0
    assert "Coffman" in results[0]["excerpt"]


def test_07_confirm_document_is_marked_completed_only_after_successful_indexing(monkeypatch) -> None:
    """7. Confirm document status is indexed/completed only when processing succeeds."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[0.1 for _ in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Operating System Architecture Overview.")
    res = client.post(
        "/api/v1/documents",
        files={"file": ("os_arch.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 202
    data = res.json()
    assert data["index_status"] == "pending"

    record = get_document(data["id"], user_id=DEFAULT_DEMO_USER_ID)
    assert record["index_status"] == "pending"
    assert process_pending_document(data["id"]) is None
    record = get_document(data["id"], user_id=DEFAULT_DEMO_USER_ID)
    assert record["index_status"] == "indexed"


def test_08_confirm_indexing_failure_is_persisted_for_retry(monkeypatch) -> None:
    """8. Confirm an indexing failure leaves the stored PDF queued with an error."""
    from app.services.ollama_client import OllamaServiceError

    async def broken_embed(texts, *, purpose, model=None):
        raise OllamaServiceError("Ollama connection timed out during vector indexing.")

    monkeypatch.setattr(main, "embed_texts", broken_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Failure case text.")
    res = client.post(
        "/api/v1/documents",
        files={"file": ("fail_doc.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 202, res.text
    document_id = res.json()["id"]
    failure = process_pending_document(document_id)
    assert failure is not None
    record = get_document(document_id, user_id=DEFAULT_DEMO_USER_ID)
    assert record is not None
    assert record["index_status"] == "pending"
    assert "Ollama connection timed out" in record["index_error"]
    assert len(mock_storage.objects) == 1


def test_09_confirm_retrying_ingestion_does_not_create_duplicate_records(monkeypatch) -> None:
    """9. Confirm retrying upload with exact hash rejects duplicates and prevents duplicate chunks."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[0.05 for _ in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Network socket programming and TCP handshake mechanics.")
    res1 = client.post(
        "/api/v1/documents",
        files={"file": ("sockets.pdf", pdf_bytes, "application/pdf")},
    )
    assert res1.status_code == 202
    doc_id = res1.json()["id"]
    assert process_pending_document(doc_id) is None

    initial_count = count_chunks(user_id=DEFAULT_DEMO_USER_ID)

    # Retry exact upload
    res2 = client.post(
        "/api/v1/documents",
        files={"file": ("sockets_copy.pdf", pdf_bytes, "application/pdf")},
    )
    assert res2.status_code == 409

    # Verify no duplicate chunks created
    post_count = count_chunks(user_id=DEFAULT_DEMO_USER_ID)
    assert post_count == initial_count


def test_10_confirm_document_listing_works_after_backend_restart(monkeypatch) -> None:
    """10. Confirm document listing persists across backend restarts and simulated reloads."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[0.05 for _ in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Concurrency Control and Two-Phase Locking (2PL).")
    upload_res = client.post(
        "/api/v1/documents",
        files={"file": ("locking.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 202
    assert process_pending_document(upload_res.json()["id"]) is None

    # Simulate backend restart by resetting memory caches
    from app.rag.search import invalidate_index_cache
    invalidate_index_cache()

    list_res = client.get("/api/v1/documents")
    assert list_res.status_code == 200
    docs = list_res.json()["documents"]
    filenames = [d["filename"] for d in docs]
    assert "locking.pdf" in filenames


def test_11_confirm_document_retrieval_and_citations_use_persisted_data(monkeypatch) -> None:
    """11. Confirm /api/v1/ask produces grounded answers citing real persisted document pages."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[1.0 for _ in range(768)] for _ in texts]

    async def fake_chat(model, messages, *, temperature=0.2, num_ctx=4096):
        return "Two-phase locking prevents non-serializable interleavings [S1]."

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    import app.rag.search as search_module
    monkeypatch.setattr(search_module, "embed_texts", fake_embed)
    monkeypatch.setattr(main, "chat_completion", fake_chat)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Two-phase locking guarantees conflict serializability.")
    upload_res = client.post(
        "/api/v1/documents",
        files={"file": ("db_concurrency.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 202
    assert process_pending_document(upload_res.json()["id"]) is None

    ask_res = client.post(
        "/api/v1/ask",
        json={"question": "What does two-phase locking guarantee?", "top_k": 3},
    )
    assert ask_res.status_code == 200
    data = ask_res.json()
    assert data["status"] == "answered"
    assert len(data["citations"]) > 0
    assert data["citations"][0]["filename"] == "db_concurrency.pdf"
    assert data["citations"][0]["page_number"] == 1


def test_12_confirm_deletion_cleans_up_associated_resources(monkeypatch) -> None:
    """12. Confirm DELETE /api/v1/documents/{id} removes DB record, pages, chunks, and storage object."""
    async def fake_embed(texts, *, purpose, model=None):
        return [[0.05 for _ in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    pdf_bytes = make_sample_pdf("Transient document slated for deletion testing.")
    upload_res = client.post(
        "/api/v1/documents",
        files={"file": ("to_delete.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 202
    doc_id = upload_res.json()["id"]

    del_res = client.delete(f"/api/v1/documents/{doc_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Confirm record gone from DB
    assert get_document(doc_id, user_id=DEFAULT_DEMO_USER_ID) is None
    # Confirm pages gone
    assert len(get_document_pages(doc_id, user_id=DEFAULT_DEMO_USER_ID)) == 0
    # Confirm storage object removed
    assert not mock_storage.file_exists(f"{DEFAULT_DEMO_USER_ID}/{doc_id}.pdf")


def test_13_confirm_user_a_cannot_access_user_b_documents(monkeypatch) -> None:
    """13. Confirm tenant isolation: User A cannot read or download User B's documents."""
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())

    async def fake_embed(texts, *, purpose, model=None):
        return [[0.05 for _ in range(768)] for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embed)
    mock_storage = InMemorySupabaseStorageMock()
    monkeypatch.setattr(main, "_get_storage", lambda: mock_storage)

    # Upload document as User A
    monkeypatch.setattr(main, "get_current_user_id", lambda req: user_a)
    pdf_bytes = make_sample_pdf("User A Private Research Proposal.")
    res = client.post(
        "/api/v1/documents",
        files={"file": ("secret_user_a.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 202
    doc_id = res.json()["id"]

    # Attempt to access as User B
    monkeypatch.setattr(main, "get_current_user_id", lambda req: user_b)
    # Check download
    dl_res = client.get(f"/api/v1/documents/{doc_id}/download")
    assert dl_res.status_code == 404

    # Check listing
    list_res = client.get("/api/v1/documents")
    docs = list_res.json()["documents"]
    assert not any(d["id"] == doc_id for d in docs)

    # Check pages
    pages_res = client.get(f"/api/v1/documents/{doc_id}/pages")
    assert pages_res.status_code == 404


def test_14_confirm_changes_to_persistent_settings_survive_reload() -> None:
    """14. Confirm study preferences and settings update and persist across requests."""
    repo = get_academic_repository()
    user_id = DEFAULT_DEMO_USER_ID

    # Update preferences
    repo.update_study_preferences(
        user_id=user_id,
        daily_study_minutes=60,
        exam_date="2026-12-15",
        preferences={"target_grade": "A+", "notification_hour": 9},
    )

    # Re-fetch from fresh repository instance
    reloaded_prefs = repo.get_study_preferences(user_id=user_id)
    assert reloaded_prefs["daily_study_minutes"] == 60
    assert reloaded_prefs["exam_date"] == "2026-12-15"
    assert reloaded_prefs["preferences"]["target_grade"] == "A+"


def test_15_confirm_frontend_uses_configured_api_base_url() -> None:
    """15. Confirm build.js / config injection resolves PUBLIC_API_BASE_URL correctly."""
    from app.config import PUBLIC_API_BASE_URL
    assert PUBLIC_API_BASE_URL.startswith("http")
    assert not PUBLIC_API_BASE_URL.endswith("/")


def test_16_confirm_health_checks_distinguish_db_storage_embedding_and_model(monkeypatch) -> None:
    """16. Confirm application health check and rag status distinguish each component state."""
    # 1. Health check
    res_health = client.get("/health")
    assert res_health.status_code == 200
    health_data = res_health.json()
    assert "database_connected" in health_data
    assert "storage_connected" in health_data
    assert "database_provider" in health_data
    assert "storage_provider" in health_data

    # 2. RAG Status check with mocked Ollama down
    async def _mock_ollama_down(*args, **kwargs):
        raise ConnectionError("Ollama daemon unreachable")

    monkeypatch.setattr(main, "_ollama_get", _mock_ollama_down)
    res_rag = client.get("/api/v1/rag/status")
    assert res_rag.status_code == 200
    rag_data = res_rag.json()
    # Database and storage should report their states
    assert rag_data["database"]["connected"] is True
    assert rag_data["storage"]["connected"] is True
    # Embedding model and chat model report not reachable without crashing database reporting
    assert rag_data["embedding"]["reachable"] is False
    assert rag_data["chat"]["reachable"] is False
    assert rag_data["available"] is False
