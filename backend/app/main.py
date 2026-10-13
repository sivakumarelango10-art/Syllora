"""Syllora local AI API: Ollama connectivity, upload-time PDF indexing, and RAG."""
from __future__ import annotations

import hashlib
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from app.config import (
    APP_NAME,
    CORS_ALLOWED_ORIGINS,
    MAX_CHUNKS_PER_DOCUMENT,
    MAX_PDF_PAGES,
    MAX_UPLOAD_BYTES,
    OLLAMA_MODEL,
    validate_environment,
)

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.rate_limiter import ai_rate_limiter, standard_rate_limiter, inference_concurrency_guard
from app.rag.pdf_processing import PdfProcessingError, extract_pdf_chunks
from app.rag.search import SearchMode, has_sufficient_evidence, invalidate_index_cache, search_passages
from app.rag.store import UPLOAD_DIR, count_chunks, delete_document as delete_document_record
from app.rag.store import document_hash_exists, get_document, insert_document, list_documents
from app.storage import get_storage_adapter
from app.storage.local_storage import LocalStorageAdapter
from app.services.ollama_client import (
    OLLAMA_BASE_URL,
    OLLAMA_EMBED_MODEL,
    OLLAMA_EMBED_TIMEOUT_SECONDS,
    OLLAMA_TIMEOUT_SECONDS,
    OllamaServiceError,
    chat_completion,
    embed_texts,
    get_tags,
)
from app.repositories.academic_repository import get_academic_repository
from app.api.v1 import (
    auth_router,
    dashboard_router,
    courses_router,
    syllabus_router,
    chat_router,
    understanding_router,
    misconceptions_router,
    revision_router,
    settings_router,
)

INSUFFICIENT_EVIDENCE_MESSAGE = (
    "I couldn't find enough evidence in the uploaded materials to answer this reliably. "
    "Try uploading the relevant lecture notes or textbook section."
)

app = FastAPI(
    title=APP_NAME,
    description=(
        "Syllora Academic Platform API for Ollama, PDF ingestion, vector retrieval, "
        "and verified curriculum progress."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Register Platform Academic Routers
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(courses_router)
app.include_router(syllabus_router)
app.include_router(chat_router)
app.include_router(understanding_router)
app.include_router(misconceptions_router)
app.include_router(revision_router)
app.include_router(settings_router)


class ModelTestRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ModelTestResponse(BaseModel):
    model: str
    answer: str
    note: str = "Model connectivity test only; answer is not grounded in uploaded documents yet."


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    mode: SearchMode = "combined"
    document_ids: list[str] | None = None
    limit: int = Field(default=5, ge=1, le=20)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    document_ids: list[str] | None = None
    top_k: int = Field(default=5, ge=1, le=8)
    session_id: str | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _model_indicates_insufficient_evidence(answer: str) -> bool:
    """Recognize explicit abstentions so they do not get labelled as answered."""
    normalized = re.sub(r"[*_`#>]", "", answer).casefold()
    indicators = (
        "do not contain enough evidence",
        "does not contain enough evidence",
        "don't contain enough evidence",
        "doesn't contain enough evidence",
        "could not find enough evidence",
        "couldn't find enough evidence",
        "not enough evidence in the uploaded materials",
        "not supported by the provided passages",
        "not supported by the retrieved passages",
        "cannot be answered based on the provided",
        "can't be answered based on the provided",
        "no information about",
        "not contain information about",
    )
    return any(indicator in normalized for indicator in indicators)


def _safe_filename(filename: str | None) -> str:
    # Strip any path components sent by a client; use only the display name.
    cleaned = Path(filename or "study-material.pdf").name.replace("\x00", "").strip()
    return cleaned[:240] or "study-material.pdf"


async def _ollama_get(path: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=httpx.Timeout(OLLAMA_TIMEOUT_SECONDS),
        ) as client:
            response = await client.get(path)
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Cannot reach Ollama at {OLLAMA_BASE_URL}.") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Ollama returned HTTP {exc.response.status_code}.") from exc


def _get_storage():
    adapter = get_storage_adapter()
    if isinstance(adapter, LocalStorageAdapter) and adapter.upload_dir != UPLOAD_DIR:
        adapter.upload_dir = UPLOAD_DIR
    return adapter


@app.get("/health", tags=["health"])
async def health() -> dict[str, Any]:
    env_status = validate_environment()
    return {
        "status": "ok" if env_status["valid"] else "degraded",
        "service": APP_NAME,
        "version": app.version,
        "environment": env_status["app_env"],
        "database_provider": env_status["db_provider"],
        "storage_provider": env_status["storage_provider"],
        "require_auth": env_status["require_auth"],
    }


@app.get("/api/v1/llm/status", tags=["llm"])
async def llm_status(request: Request) -> dict[str, Any]:
    """Check configured chat model availability."""
    user_id = get_current_user_id(request)
    standard_rate_limiter.check(user_id)
    try:
        payload = await _ollama_get("/api/tags")
    except HTTPException as exc:
        return {"available": False, "model": OLLAMA_MODEL, "installed": False, "message": exc.detail}
    names = [item.get("name", "") for item in payload.get("models", [])]
    installed = any(name == OLLAMA_MODEL or name.startswith(f"{OLLAMA_MODEL}:") for name in names)
    return {
        "available": True,
        "model": OLLAMA_MODEL,
        "installed": installed,
        "available_models": names,
        "message": "Model is ready." if installed else f"Run `ollama pull {OLLAMA_MODEL}` to install the configured model.",
    }


@app.get("/api/v1/rag/status", tags=["rag"])
async def rag_status(request: Request) -> dict[str, Any]:
    """Report required models and local index size before attempting an upload."""
    user_id = get_current_user_id(request)
    docs = list_documents(user_id=user_id)
    chunks_count = count_chunks(user_id=user_id)
    try:
        payload = await _ollama_get("/api/tags")
        names = [item.get("name", "") for item in payload.get("models", [])]
        chat_installed = any(name == OLLAMA_MODEL or name.startswith(f"{OLLAMA_MODEL}:") for name in names)
        embed_installed = any(
            name == OLLAMA_EMBED_MODEL or name.startswith(f"{OLLAMA_EMBED_MODEL}:") for name in names
        )
        return {
            "available": True,
            "chat_model": OLLAMA_MODEL,
            "chat_model_installed": chat_installed,
            "embedding_model": OLLAMA_EMBED_MODEL,
            "embedding_model_installed": embed_installed,
            "documents": len(docs),
            "chunks": chunks_count,
            "message": "Ready for document ingestion." if chat_installed and embed_installed
                       else f"Install missing model(s). For embeddings run: ollama pull {OLLAMA_EMBED_MODEL}",
        }
    except HTTPException as exc:
        return {"available": False, "message": exc.detail, "documents": len(docs), "chunks": chunks_count}


@app.post("/api/v1/llm/test", response_model=ModelTestResponse, tags=["llm"])
async def test_llm(request: ModelTestRequest, http_request: Request) -> ModelTestResponse:
    """Connectivity test only; this endpoint does not retrieve study documents."""
    user_id = get_current_user_id(http_request)
    ai_rate_limiter.check(user_id)
    try:
        async with inference_concurrency_guard():
            answer = await chat_completion(
                OLLAMA_MODEL,
                [
                    {"role": "system", "content": (
                        "You are Syllora, a clear and concise academic study assistant. "
                        "This is a general model connectivity test; no study documents were provided. "
                        "Do not claim to cite or have read uploaded materials."
                    )},
                    {"role": "user", "content": request.message},
                ],
                temperature=0.2,
                num_ctx=4096,
            )
    except OllamaServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ModelTestResponse(model=OLLAMA_MODEL, answer=answer)


@app.get("/api/v1/documents", tags=["documents"])
async def get_documents(request: Request) -> dict[str, Any]:
    user_id = get_current_user_id(request)
    docs = list_documents(user_id=user_id)
    return {"documents": docs, "count": len(docs)}


@app.post("/api/v1/documents", status_code=201, tags=["documents"])
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
) -> dict[str, Any]:
    """Upload a text-based PDF and complete extraction + embedding before returning."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    display_filename = _safe_filename(file.filename)
    if Path(display_filename).suffix.casefold() != ".pdf":
        raise HTTPException(status_code=415, detail="Only PDF files are supported in this phase.")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File is too large. The current upload limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
                )
        except ValueError:
            pass

    pdf_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large. The current upload limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    file_hash = hashlib.sha256(pdf_bytes).hexdigest()
    if document_hash_exists(file_hash, user_id=user_id):
        raise HTTPException(status_code=409, detail="This exact PDF has already been uploaded.")

    try:
        page_count, pdf_chunks = extract_pdf_chunks(
            pdf_bytes, max_pages=MAX_PDF_PAGES, max_chunks=MAX_CHUNKS_PER_DOCUMENT
        )
    except PdfProcessingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    embedding_model = OLLAMA_EMBED_MODEL
    chunk_texts = [chunk.text for chunk in pdf_chunks]
    try:
        vectors: list[list[float]] = []
        async with inference_concurrency_guard():
            # Batches keep request payloads bounded and use the batched Ollama API when available.
            for start in range(0, len(chunk_texts), 32):
                vectors.extend(await embed_texts(chunk_texts[start:start + 32], purpose="document", model=embedding_model))
    except OllamaServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if len(vectors) != len(pdf_chunks):
        raise HTTPException(status_code=502, detail="Embedding count did not match the PDF chunk count.")
    dimensions = {len(vector) for vector in vectors}
    if len(dimensions) != 1 or 0 in dimensions:
        raise HTTPException(status_code=502, detail="The embedding model returned inconsistent vector dimensions.")

    document_id = str(uuid.uuid4())
    storage_adapter = _get_storage()
    storage_path = storage_adapter.build_path(user_id, document_id)
    try:
        storage_filename = storage_adapter.save_file(storage_path, pdf_bytes)
        timestamp = _now_iso()
        document = {
            "id": document_id,
            "filename": display_filename,
            "title": (title or Path(display_filename).stem).strip()[:240] or Path(display_filename).stem,
            "storage_filename": storage_filename,
            "storage_path": storage_path,
            "sha256": file_hash,
            "size_bytes": len(pdf_bytes),
            "page_count": page_count,
            "created_at": timestamp,
            "user_id": user_id,
        }
        chunks = [
            {
                "id": str(uuid.uuid4()),
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
                "text": chunk.text,
                "embedding": vectors[index],
                "embedding_model": embedding_model,
            }
            for index, chunk in enumerate(pdf_chunks)
        ]
        insert_document(document, chunks, user_id=user_id)
    except Exception as exc:
        storage_adapter.delete_file(storage_path)
        raise HTTPException(status_code=500, detail=f"Could not store the indexed PDF: {exc}") from exc

    # Warm the in-memory vector index now, as part of upload completion, not the first question.
    invalidate_index_cache()
    try:
        from app.rag.search import _get_index
        _get_index(embedding_model, user_id=user_id)
    except Exception:
        # The SQLite index is committed. A later search can rebuild the cache if necessary.
        pass

    return {
        "id": document_id,
        "filename": display_filename,
        "title": document["title"],
        "page_count": page_count,
        "chunk_count": len(pdf_chunks),
        "size_bytes": len(pdf_bytes),
        "embedding_model": embedding_model,
        "status": "indexed",
        "message": "PDF extracted and indexed. Searchable passages are ready.",
    }


@app.get("/api/v1/documents/{document_id}/download", tags=["documents"])
async def download_document(document_id: str, request: Request):
    """Securely stream or preview uploaded PDF document."""
    user_id = get_current_user_id(request)
    doc = get_document(document_id, user_id=user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    storage_adapter = _get_storage()
    file_bytes = storage_adapter.get_file_bytes(doc["storage_filename"])
    if not file_bytes:
        raise HTTPException(status_code=404, detail="File content not found in storage.")
    from fastapi.responses import Response
    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc["filename"]}"'},
    )


@app.delete("/api/v1/documents/{document_id}", tags=["documents"])
async def remove_document(document_id: str, request: Request) -> dict[str, str]:
    user_id = get_current_user_id(request)
    result = delete_document_record(document_id, user_id=user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    _get_storage().delete_file(result["storage_filename"])
    invalidate_index_cache()
    return {"status": "deleted", "document_id": document_id}


def _public_search_result(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "chunk_id": item["chunk_id"],
        "document_id": item["document_id"],
        "filename": item["filename"],
        "title": item["title"],
        "page_number": item["page_number"],
        "excerpt": item["text"][:600],
        "score": round(float(item["score"]), 4),
        "semantic_score": round(float(item["semantic_score"]), 4),
        "keyword_score": round(float(item["keyword_score"]), 4),
    }


@app.post("/api/v1/search", tags=["search"])
async def search_documents(request: SearchRequest, http_request: Request) -> dict[str, Any]:
    """Search pre-indexed passage metadata using keyword, semantic, or combined retrieval."""
    user_id = get_current_user_id(http_request)
    ai_rate_limiter.check(user_id)
    try:
        results = await search_passages(
            request.query,
            mode=request.mode,
            document_ids=request.document_ids,
            limit=request.limit,
            embedding_model=OLLAMA_EMBED_MODEL,
            user_id=user_id,
        )
    except OllamaServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "query": request.query,
        "mode": request.mode,
        "count": len(results),
        "results": [_public_search_result(item) for item in results],
    }


@app.post("/api/v1/ask", tags=["rag"])
async def ask_from_documents(request: AskRequest, http_request: Request) -> dict[str, Any]:
    """Answer a question from retrieved study passages and return document/page sources."""
    user_id = get_current_user_id(http_request)
    ai_rate_limiter.check(user_id)
    try:
        results = await search_passages(
            request.question,
            mode="combined",
            document_ids=request.document_ids,
            limit=request.top_k,
            embedding_model=OLLAMA_EMBED_MODEL,
            user_id=user_id,
        )
    except OllamaServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not results or not has_sufficient_evidence(request.question, results):
        return {
            "status": "insufficient_evidence",
            "question": request.question,
            "answer": INSUFFICIENT_EVIDENCE_MESSAGE,
            "citations": [],
            "retrieved_count": len(results),
            "model": OLLAMA_MODEL,
        }



    # Use stable source labels so the answer can cite only passages actually retrieved.
    context_parts: list[str] = []
    for number, item in enumerate(results, start=1):
        context_parts.append(
            f"[S{number}] Document: {item['filename']} | Title: {item['title']} | Page: {item['page_number']}\n"
            f"Passage: {item['text'][:1500]}"
        )
    context = "\n\n".join(context_parts)
    system_prompt = (
        "You are Syllora, a careful academic study assistant. Answer the user's question primarily "
        "and only as far as the supplied study passages support it. Do not use outside knowledge to fill "
        "gaps. If the passages do not answer the question sufficiently, clearly say that the uploaded "
        "materials do not contain enough evidence. Never invent page numbers, quotes, or sources. "
        "Cite factual claims using the exact source labels [S1], [S2], etc. which precede the passages. "
        "Explain concepts in simple, student-friendly language and keep the answer structured."
    )
    user_prompt = f"QUESTION:\n{request.question}\n\nRETRIEVED STUDY PASSAGES:\n{context}\n\nAnswer with source labels such as [S1]."
    try:
        async with inference_concurrency_guard():
            answer = await chat_completion(
                OLLAMA_MODEL,
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                temperature=0.1,
                num_ctx=4096,
            )
    except OllamaServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # A model may correctly refuse after reading the context. Reflect that in the
    # machine-readable status and never attach unrelated passages as citations.
    if _model_indicates_insufficient_evidence(answer):
        return {
            "status": "insufficient_evidence",
            "question": request.question,
            "answer": INSUFFICIENT_EVIDENCE_MESSAGE,
            "citations": [],
            "retrieved_count": len(results),
            "model": OLLAMA_MODEL,
            "embedding_model": OLLAMA_EMBED_MODEL,
        }

    cited_numbers = {int(number) for number in re.findall(r"\[S(\d+)\]", answer)}
    citations: list[dict[str, Any]] = []
    for number, item in enumerate(results, start=1):
        if cited_numbers and number not in cited_numbers:
            continue
        citations.append({
            "source_id": f"S{number}",
            "document_id": item["document_id"],
            "filename": item["filename"],
            "title": item["title"],
            "page_number": item["page_number"],
            "excerpt": item["text"][:500],
            "relevance_score": round(float(item["score"]), 4),
        })
    final_status = "answered"
    res_payload = {
        "status": final_status,
        "question": request.question,
        "answer": answer,
        "citations": citations,
        "retrieved_count": len(results),
        "model": OLLAMA_MODEL,
        "embedding_model": OLLAMA_EMBED_MODEL,
        "session_id": request.session_id,
    }

    # Persist in conversation session if requested
    if request.session_id:
        try:
            repo = get_academic_repository()
            # Record user question
            repo.add_chat_message(
                user_id=user_id,
                session_id=request.session_id,
                role="user",
                content=request.question,
            )
            # Record assistant response with citations
            repo.add_chat_message(
                user_id=user_id,
                session_id=request.session_id,
                role="assistant",
                content=answer,
                model=OLLAMA_MODEL,
                evidence_status=final_status,
                citations=citations,
            )
        except Exception:
            pass

    return res_payload
