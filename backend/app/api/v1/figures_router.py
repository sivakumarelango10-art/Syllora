"""FastAPI Router for Diagram Retrieval (F11): Figure search and secure diagram streaming."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request, Response

from app.auth import get_current_user_id
from app.rate_limiter import standard_rate_limiter
from app.services.figure_service import get_figure_service

router = APIRouter(prefix="/api/v1/figures", tags=["figures"])


@router.get("/search")
async def search_figures(
    query: str,
    request: Request,
    document_id: str | None = None,
    limit: int = 4,
) -> dict[str, Any]:
    """Searches extracted textbook/lecture note diagrams relevant to student question (F11)."""
    user_id = get_current_user_id(request)
    standard_rate_limiter.check(user_id)
    fig_svc = get_figure_service()
    figures = fig_svc.search_figures(
        user_id=user_id,
        query=query,
        document_id=document_id,
        limit=limit,
    )
    return {"query": query, "figures": figures, "count": len(figures)}


@router.get("/{figure_id}/image")
async def get_figure_image(
    figure_id: str,
    request: Request,
):
    """Securely streams figure image binary bytes scoped to authenticated user."""
    user_id = get_current_user_id(request)
    fig_svc = get_figure_service()
    data = fig_svc.get_figure_bytes(user_id=user_id, figure_id=figure_id)
    if not data:
        raise HTTPException(status_code=404, detail="Figure not found.")
    image_bytes, media_type = data
    return Response(content=image_bytes, media_type=media_type)
