from __future__ import annotations

import asyncio

import fitz
from fastapi.testclient import TestClient

import app.main as main
import app.rag.search as search_module

client = TestClient(main.app)


def make_pdf(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    payload = doc.tobytes()
    doc.close()
    return payload


def finish_document_indexing(uploaded: dict) -> dict:
    claimed = main.claim_next_pending_document()
    assert claimed is not None
    assert claimed["id"] == uploaded["id"]
    asyncio.run(main._process_document_index(claimed))
    status = client.get(f"/api/v1/documents/{uploaded['id']}")
    assert status.status_code == 200, status.text
    return status.json()


def test_upload_indexes_pdf_and_ask_returns_real_page_citation(monkeypatch) -> None:
    async def fake_embeddings(texts, *, purpose, model=None):
        return [[1.0] + [0.0] * (main.EMBEDDING_DIM - 1) for _ in texts]

    async def fake_chat(model, messages, *, temperature=0.2, num_ctx=4096):
        assert "[S1]" in messages[1]["content"]
        return "Deadlock happens when processes wait on resources held by one another [S1]."

    monkeypatch.setattr(main, "embed_texts", fake_embeddings)
    monkeypatch.setattr(search_module, "embed_texts", fake_embeddings)
    monkeypatch.setattr(main, "chat_completion", fake_chat)

    pdf_bytes = make_pdf(
        "Deadlock occurs when processes are blocked while each waits for a resource held by another process."
    )
    upload = client.post(
        "/api/v1/documents",
        files={"file": ("OS Notes.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Operating Systems Notes"},
    )
    assert upload.status_code == 202, upload.text
    uploaded = upload.json()
    assert uploaded["status"] == "pending"
    assert uploaded["page_count"] == 0
    assert uploaded["chunk_count"] == 0

    indexed = finish_document_indexing(uploaded)
    assert indexed["index_status"] == "indexed"
    assert indexed["page_count"] == 1
    assert indexed["chunk_count"] >= 1

    listed = client.get("/api/v1/documents")
    assert listed.status_code == 200
    assert listed.json()["count"] == 1

    ask = client.post("/api/v1/ask", json={"question": "Explain deadlock", "top_k": 3})
    assert ask.status_code == 200, ask.text
    result = ask.json()
    assert result["status"] == "answered"
    assert result["citations"]
    assert result["citations"][0]["filename"] == "OS Notes.pdf"
    assert result["citations"][0]["page_number"] == 1


def test_duplicate_pdf_is_rejected(monkeypatch) -> None:
    async def fake_embeddings(texts, *, purpose, model=None):
        return [[1.0] + [0.0] * (main.EMBEDDING_DIM - 1) for _ in texts]

    monkeypatch.setattr(main, "embed_texts", fake_embeddings)
    pdf_bytes = make_pdf("A deadlock is a waiting condition in an operating system.")
    first = client.post("/api/v1/documents", files={"file": ("notes.pdf", pdf_bytes, "application/pdf")})
    assert first.status_code == 202, first.text
    second = client.post("/api/v1/documents", files={"file": ("copy.pdf", pdf_bytes, "application/pdf")})
    assert second.status_code == 409


def test_model_abstention_is_returned_as_insufficient_evidence_without_citations(monkeypatch) -> None:
    async def fake_embeddings(texts, *, purpose, model=None):
        # Identical vectors force the high-similarity branch so the model refusal path is tested.
        return [[1.0] + [0.0] * (main.EMBEDDING_DIM - 1) for _ in texts]

    async def fake_chat(model, messages, *, temperature=0.2, num_ctx=4096):
        return (
            "Planning text that should never be returned to the user </think>\n"
            "The uploaded materials do not contain enough evidence to explain quantum entanglement."
        )

    monkeypatch.setattr(main, "embed_texts", fake_embeddings)
    monkeypatch.setattr(search_module, "embed_texts", fake_embeddings)
    monkeypatch.setattr(main, "chat_completion", fake_chat)

    pdf_bytes = make_pdf("In Round Robin scheduling, a time quantum limits each process time slice.")
    upload = client.post(
        "/api/v1/documents",
        files={"file": ("OS Notes.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload.status_code == 202, upload.text
    indexed = finish_document_indexing(upload.json())
    assert indexed["index_status"] == "indexed"

    response = client.post(
        "/api/v1/ask",
        json={"question": "According to notes, explain quantum entanglement", "top_k": 3},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "insufficient_evidence"
    assert result["citations"] == []
    assert "couldn't find enough evidence" in result["answer"].lower()
