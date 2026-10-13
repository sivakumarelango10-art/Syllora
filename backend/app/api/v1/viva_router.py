"""FastAPI Router for Viva Simulator (F13): Oral exam simulator with voice transcripts."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.rate_limiter import standard_rate_limiter, ai_rate_limiter
from app.services.viva_service import get_viva_service
from app.repositories.academic_repository import get_academic_repository

router = APIRouter(prefix="/api/v1/viva", tags=["viva"])


class StartVivaRequest(BaseModel):
    topic_title: str = Field(min_length=1, max_length=500)
    course_id: str | None = None
    topic_id: str | None = None


class RespondVivaRequest(BaseModel):
    session_id: str
    student_transcript: str = Field(min_length=1, max_length=5000)


@router.post("/start", status_code=201)
async def start_viva(
    body: StartVivaRequest,
    request: Request,
) -> dict[str, Any]:
    """Starts a viva oral exam session and generates initial grounded question (F13)."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    viva_svc = get_viva_service()
    result = await viva_svc.start_viva_session(
        user_id=user_id,
        topic_title=body.topic_title,
        course_id=body.course_id,
        topic_id=body.topic_id,
    )
    return result


@router.post("/respond")
async def respond_viva(
    body: RespondVivaRequest,
    request: Request,
) -> dict[str, Any]:
    """Submits student's verbal response, grades answer, and produces follow-up question (F13)."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    viva_svc = get_viva_service()
    try:
        result = await viva_svc.submit_viva_response(
            user_id=user_id,
            session_id=body.session_id,
            student_transcript=body.student_transcript,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/sessions")
async def list_viva_sessions(
    request: Request,
    limit: int = 10,
) -> dict[str, Any]:
    """Lists history of oral viva practice sessions."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    sessions = repo.list_viva_sessions(user_id=user_id, limit=limit)
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/sessions/{session_id}")
async def get_viva_session(
    session_id: str,
    request: Request,
) -> dict[str, Any]:
    """Retrieves full transcript and feedback for a viva session."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    session = repo.get_viva_session(user_id=user_id, session_id=session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Viva session not found.")
    return session
