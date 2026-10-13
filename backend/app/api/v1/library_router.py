"""FastAPI Router for Semester-Wide Library Search (F6): Cross-course search across student materials."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.rate_limiter import standard_rate_limiter
from app.rag.search import search_passages
from app.services.ollama_client import OLLAMA_EMBED_MODEL
from app.repositories.academic_repository import get_academic_repository

router = APIRouter(prefix="/api/v1/library", tags=["library"])


class LibrarySearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    course_id: str | None = None
    doc_types: list[str] | None = None
    limit: int = Field(default=8, ge=1, le=20)


@router.post("/search")
async def search_semester_library(
    body: LibrarySearchRequest,
    request: Request,
) -> dict[str, Any]:
    """Searches across all courses and documents owned by the student with metadata ranking (F6)."""
    user_id = get_current_user_id(request)
    standard_rate_limiter.check(user_id)
    repo = get_academic_repository()

    # 1. Fetch user's courses for mapping context
    courses = repo.list_courses(user_id=user_id)
    course_map = {c["id"]: c["title"] for c in courses}

    # 2. Run hybrid retrieval across all documents
    passages = await search_passages(
        query=body.query,
        mode="combined",
        limit=body.limit,
        embedding_model=OLLAMA_EMBED_MODEL,
        user_id=user_id,
    )

    enriched_results = []
    for p in passages:
        doc_id = p.get("document_id")
        cid = p.get("course_id")
        course_name = course_map.get(cid, "General Materials") if cid else "Study Notes"
        enriched_results.append({
            "chunk_id": p.get("chunk_id"),
            "document_id": doc_id,
            "filename": p.get("filename"),
            "title": p.get("title"),
            "page_number": p.get("page_number"),
            "excerpt": p.get("text", "")[:450],
            "score": round(float(p.get("score", 0.0)), 4),
            "course_id": cid,
            "course_title": course_name,
        })

    return {
        "query": body.query,
        "count": len(enriched_results),
        "results": enriched_results,
        "total_courses": len(courses),
    }
