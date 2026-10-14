"""Syllora local AI API: Ollama connectivity, upload-time PDF indexing, and RAG."""
from __future__ import annotations

import asyncio
import hashlib
import logging
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
    EMBEDDING_DIM,
    OLLAMA_MODEL,
    validate_environment,
)

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.db import get_db_adapter
from app.rate_limiter import ai_rate_limiter, standard_rate_limiter, inference_concurrency_guard
from app.rag.pdf_processing import PdfProcessingError, extract_pdf_chunks, extract_pdf_pages_and_chunks
from app.rag.search import SearchMode, has_sufficient_evidence, invalidate_index_cache, search_passages
from app.rag.store import (
    UPLOAD_DIR,
    count_chunks,
    claim_next_pending_document,
    delete_document as delete_document_record,
    document_hash_exists,
    fail_document_index,
    get_document,
    get_document_by_hash,
    get_document_pages,
    insert_document,
    list_documents,
    update_document_status,
    retry_document_index,
)
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
    exams_router,
    answers_router,
    practice_router,
    library_router,
    figures_router,
    conflicts_router,
    viva_router,
    faculty_router,
)

logger = logging.getLogger(__name__)

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
app.include_router(exams_router)
app.include_router(answers_router)
app.include_router(practice_router)
app.include_router(library_router)
app.include_router(figures_router)
app.include_router(conflicts_router)
app.include_router(viva_router)
app.include_router(faculty_router)



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


def _document_upload_receipt(document: dict[str, Any], *, duplicate: bool) -> dict[str, Any]:
    status = document.get("index_status") or document.get("status") or "pending"
    return {
        "id": document["id"],
        "filename": document["filename"],
        "title": document.get("title") or document["filename"],
        "page_count": document.get("page_count") or 0,
        "chunk_count": document.get("chunk_count") or 0,
        "size_bytes": document.get("size_bytes") or 0,
        "sha256": document["sha256"],
        "status": status,
        "index_status": status,
        "index_error": document.get("index_error"),
        "duplicate": duplicate,
        "message": "This exact PDF is already in Study Materials." if duplicate else "PDF stored successfully. AI indexing is queued.",
    }


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


async def _process_document_index(document: dict[str, Any]) -> None:
    """Process one persisted PDF job after the upload receipt has been committed."""
    document_id = str(document["id"])
    user_id = str(document["user_id"])
    storage_path = str(document.get("storage_path") or document["storage_filename"])
    storage_adapter = _get_storage()
    pdf_bytes = await asyncio.to_thread(storage_adapter.get_file, storage_path)
    if not pdf_bytes:
        raise RuntimeError("The stored PDF could not be retrieved for indexing.")
    if hashlib.sha256(pdf_bytes).hexdigest() != document["sha256"]:
        raise RuntimeError("Stored PDF integrity check failed.")

    page_count, pdf_pages, pdf_chunks = await asyncio.to_thread(
        extract_pdf_pages_and_chunks,
        pdf_bytes,
        max_pages=MAX_PDF_PAGES,
        max_chunks=MAX_CHUNKS_PER_DOCUMENT,
    )
    chunk_texts = [chunk.text for chunk in pdf_chunks]
    vectors: list[list[float]] = []
    async with inference_concurrency_guard():
        for start in range(0, len(chunk_texts), 32):
            vectors.extend(
                await embed_texts(
                    chunk_texts[start:start + 32],
                    purpose="document",
                    model=OLLAMA_EMBED_MODEL,
                )
            )
    if len(vectors) != len(pdf_chunks):
        raise RuntimeError("The embedding model returned an incomplete result.")
    if any(len(vector) != EMBEDDING_DIM for vector in vectors):
        raise RuntimeError(
            f"The embedding model must return {EMBEDDING_DIM}-dimensional vectors."
        )

    chunks = [
        {
            "id": str(uuid.uuid4()),
            "page_number": chunk.page_number,
            "chunk_index": chunk.chunk_index,
            "text": chunk.text,
            "embedding": vectors[index],
            "embedding_model": OLLAMA_EMBED_MODEL,
            "metadata": {"char_count": len(chunk.text)},
        }
        for index, chunk in enumerate(pdf_chunks)
    ]
    indexed_document = {
        **document,
        "page_count": page_count,
        "chunk_count": len(chunks),
        "index_status": "indexed",
        "index_error": None,
        "mime_type": "application/pdf",
    }
    await asyncio.to_thread(
        insert_document,
        indexed_document,
        chunks,
        pdf_pages,
        user_id,
    )
    invalidate_index_cache()


async def _document_index_worker() -> None:
    """Claim and process persisted jobs with one bounded worker."""
    while True:
        try:
            document = await asyncio.to_thread(claim_next_pending_document)
        except Exception:
            logger.exception("Could not claim a pending document indexing job.")
            await asyncio.sleep(5)
            continue
        if document is None:
            await asyncio.sleep(2)
            continue

        try:
            await _process_document_index(document)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Document indexing failed for %s.", document.get("id"))
            try:
                await asyncio.to_thread(
                    fail_document_index,
                    str(document["id"]),
                    str(document["user_id"]),
                    str(exc),
                )
            except Exception:
                logger.exception(
                    "Could not persist the indexing failure for %s.", document.get("id")
                )


@app.on_event("startup")
async def start_document_index_worker() -> None:
    if os.getenv("SYLLORA_ENABLE_DOCUMENT_INDEX_WORKER", "true").strip().lower() in ("true", "1"):
        app.state.document_index_worker = asyncio.create_task(_document_index_worker())


@app.on_event("shutdown")
async def stop_document_index_worker() -> None:
    worker = getattr(app.state, "document_index_worker", None)
    if worker is not None:
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass


@app.get("/health", tags=["health"])
async def health() -> dict[str, Any]:
    env_status = validate_environment()
    db_connected = False
    try:
        count_chunks()
        db_connected = True
    except Exception:
        db_connected = False

    storage_connected = False
    try:
        adapter = _get_storage()
        storage_connected = adapter is not None
    except Exception:
        storage_connected = False

    overall_ok = env_status["valid"] and db_connected and storage_connected
    return {
        "status": "ok" if overall_ok else "degraded",
        "service": APP_NAME,
        "version": app.version,
        "environment": env_status["app_env"],
        "database_connected": db_connected,
        "database_provider": env_status["db_provider"],
        "storage_connected": storage_connected,
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
    """Report real database, storage, embedding, and model connectivity states."""
    user_id = get_current_user_id(request)
    db_connected = False
    docs: list[dict[str, Any]] = []
    chunks_count = 0
    try:
        docs = list_documents(user_id=user_id)
        chunks_count = count_chunks(user_id=user_id)
        db_connected = True
    except Exception:
        db_connected = False

    storage_connected = False
    storage_provider = "unknown"
    storage_bucket = ""
    try:
        adapter = _get_storage()
        storage_provider = adapter.provider_name
        storage_bucket = getattr(adapter, "bucket_name", "local")
        storage_connected = True
    except Exception:
        storage_connected = False

    chat_installed = False
    embed_installed = False
    ollama_reachable = False
    try:
        payload = await _ollama_get("/api/tags")
        ollama_reachable = True
        names = [item.get("name", "") for item in payload.get("models", [])]
        chat_installed = any(name == OLLAMA_MODEL or name.startswith(f"{OLLAMA_MODEL}:") for name in names)
        embed_installed = any(
            name == OLLAMA_EMBED_MODEL or name.startswith(f"{OLLAMA_EMBED_MODEL}:") for name in names
        )
    except Exception:
        ollama_reachable = False

    is_ready = db_connected and storage_connected and chat_installed and embed_installed
    messages: list[str] = []
    if not db_connected:
        messages.append("Database is unreachable.")
    if not storage_connected:
        messages.append("Storage provider is uninitialized.")
    if not ollama_reachable:
        messages.append(f"Ollama is unreachable at {OLLAMA_BASE_URL}.")
    elif not embed_installed:
        messages.append(f"Run `ollama pull {OLLAMA_EMBED_MODEL}`.")
    elif not chat_installed:
        messages.append(f"Run `ollama pull {OLLAMA_MODEL}`.")

    if not messages:
        messages.append("System is fully ready for document ingestion and semantic search.")

    return {
        "available": is_ready,
        "database": {
            "connected": db_connected,
            "provider": getattr(get_db_adapter(), "provider_name", "unknown"),
        },
        "storage": {
            "connected": storage_connected,
            "provider": storage_provider,
            "bucket": storage_bucket,
        },
        "embedding": {
            "model": OLLAMA_EMBED_MODEL,
            "reachable": ollama_reachable,
            "installed": embed_installed,
        },
        "chat": {
            "model": OLLAMA_MODEL,
            "reachable": ollama_reachable,
            "installed": chat_installed,
        },
        "chat_model": OLLAMA_MODEL,
        "chat_model_installed": chat_installed,
        "embedding_model": OLLAMA_EMBED_MODEL,
        "embedding_model_installed": embed_installed,
        "documents": len(docs),
        "chunks": chunks_count,
        "message": " ".join(messages),
    }


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


@app.post("/api/v1/documents", status_code=202, tags=["documents"])
async def upload_document(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
) -> dict[str, Any]:
    """Persist a PDF and queue durable indexing before returning an upload receipt."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    display_filename = _safe_filename(file.filename)
    if Path(display_filename).suffix.casefold() != ".pdf":
        raise HTTPException(status_code=415, detail="Only PDF files are supported.")

    auth_header = request.headers.get("authorization", "")
    auth_token = auth_header.split(" ", 1)[1].strip() if " " in auth_header else (auth_header.strip() if auth_header else None)

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
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=422, detail="The uploaded file does not look like a valid PDF.")

    file_hash = hashlib.sha256(pdf_bytes).hexdigest()
    existing_document = get_document_by_hash(file_hash, user_id=user_id)
    if existing_document:
        response.status_code = 200
        return _document_upload_receipt(existing_document, duplicate=True)

    document_id = str(uuid.uuid4())
    storage_adapter = _get_storage()
    storage_path = storage_adapter.build_path(user_id, document_id)

    try:
        storage_filename = storage_adapter.save_file(
            storage_path, pdf_bytes, content_type="application/pdf", auth_token=auth_token
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="PDF storage could not confirm the upload.") from exc

    timestamp = _now_iso()
    doc_title = (title or Path(display_filename).stem).strip()[:240] or Path(display_filename).stem
    document = {
        "id": document_id,
        "filename": display_filename,
        "title": doc_title,
        "storage_filename": storage_filename,
        "storage_path": storage_path,
        "sha256": file_hash,
        "size_bytes": len(pdf_bytes),
        "page_count": 0,
        "chunk_count": 0,
        "mime_type": "application/pdf",
        "index_status": "pending",
        "created_at": timestamp,
        "user_id": user_id,
    }

    try:
        insert_document(document, [], user_id=user_id)
    except Exception as exc:
        try:
            existing_document = get_document_by_hash(file_hash, user_id=user_id)
        except Exception:
            existing_document = None
            logger.exception("Could not resolve a concurrent upload for document hash %s.", file_hash)

        if existing_document:
            try:
                storage_adapter.delete_file(storage_path, auth_token=auth_token)
            except Exception as cleanup_exc:
                logger.warning(
                    "Could not remove concurrent duplicate upload %s from storage: %s",
                    document_id,
                    cleanup_exc,
                )
            response.status_code = 200
            return _document_upload_receipt(existing_document, duplicate=True)

        try:
            storage_adapter.delete_file(storage_path, auth_token=auth_token)
        except Exception as cleanup_exc:
            logger.warning(
                "Could not remove uncommitted upload %s from storage: %s",
                document_id,
                cleanup_exc,
            )
        raise HTTPException(
            status_code=500,
            detail="The PDF was stored, but its document record could not be committed.",
        ) from exc

    return _document_upload_receipt(document, duplicate=False)


@app.get("/api/v1/documents/{document_id}", tags=["documents"])
async def get_document_status(document_id: str, request: Request) -> dict[str, Any]:
    """Return persisted document and indexing status to its authenticated owner."""
    user_id = get_current_user_id(request)
    document = get_document(document_id, user_id=user_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


@app.post("/api/v1/documents/{document_id}/retry", status_code=202, tags=["documents"])
async def retry_document_indexing(document_id: str, request: Request) -> dict[str, str]:
    user_id = get_current_user_id(request)
    document = get_document(document_id, user_id=user_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    if document.get("index_status") != "failed":
        raise HTTPException(status_code=409, detail="Only failed document indexing can be retried.")
    if not retry_document_index(document_id, user_id):
        raise HTTPException(status_code=409, detail="The document is no longer available for retry.")
    return {"id": document_id, "status": "pending"}


@app.get("/api/v1/documents/{document_id}/download", tags=["documents"])
async def download_document(document_id: str, request: Request):
    """Securely stream or preview uploaded PDF document."""
    user_id = get_current_user_id(request)
    auth_header = request.headers.get("authorization", "")
    auth_token = auth_header.split(" ", 1)[1].strip() if " " in auth_header else (auth_header.strip() if auth_header else None)

    doc = get_document(document_id, user_id=user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    storage_adapter = _get_storage()
    path_to_fetch = doc.get("storage_path") or doc.get("storage_filename")
    file_bytes = storage_adapter.get_file(path_to_fetch, auth_token=auth_token)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="File content not found in storage.")

    from fastapi.responses import Response
    return Response(
        content=file_bytes,
        media_type=doc.get("mime_type") or "application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc["filename"]}"'},
    )


@app.get("/api/v1/documents/{document_id}/pages", tags=["documents"])
async def get_doc_pages(document_id: str, request: Request) -> dict[str, Any]:
    """Retrieve persisted extracted pages and metadata for a document."""
    user_id = get_current_user_id(request)
    doc = get_document(document_id, user_id=user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    pages = get_document_pages(document_id, user_id=user_id)
    return {"document_id": document_id, "pages": pages, "count": len(pages)}


@app.delete("/api/v1/documents/{document_id}", tags=["documents"])
async def remove_document(document_id: str, request: Request) -> dict[str, str]:
    user_id = get_current_user_id(request)
    auth_header = request.headers.get("authorization", "")
    auth_token = auth_header.split(" ", 1)[1].strip() if " " in auth_header else (auth_header.strip() if auth_header else None)

    result = delete_document_record(document_id, user_id=user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    storage_adapter = _get_storage()
    path_to_delete = result.get("storage_path") or result.get("storage_filename")
    if path_to_delete:
        try:
            storage_adapter.delete_file(path_to_delete, auth_token=auth_token)
        except Exception:
            pass

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
