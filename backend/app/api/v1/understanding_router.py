"""Check Understanding evaluation API routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from app.auth import get_current_user_id
from app.repositories.academic_repository import get_academic_repository
from app.schemas.academic_schemas import (
    AttemptHistoryItem,
    QuestionGenerateRequest,
    QuestionGenerateResponse,
    UnderstandingEvaluationRequest,
    UnderstandingEvaluationResponse,
)
from app.services.understanding_service import UnderstandingService

router = APIRouter(prefix="/api/v1/understanding", tags=["understanding"])
_understanding_service = UnderstandingService()


@router.post("/generate", response_model=QuestionGenerateResponse)
async def generate_understanding_question(
    body: QuestionGenerateRequest, request: Request
) -> QuestionGenerateResponse:
    user_id = get_current_user_id(request)
    try:
        result = await _understanding_service.generate_question(
            user_id=user_id, topic_id=body.topic_id, difficulty=body.difficulty
        )
        return QuestionGenerateResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/evaluate", response_model=UnderstandingEvaluationResponse)
async def evaluate_understanding(
    body: UnderstandingEvaluationRequest, request: Request
) -> UnderstandingEvaluationResponse:
    user_id = get_current_user_id(request)
    try:
        result = await _understanding_service.evaluate_explanation(
            user_id=user_id,
            topic_id=body.topic_id,
            question=body.question,
            student_explanation=body.student_explanation,
        )
        return UnderstandingEvaluationResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}") from exc


@router.get("/attempts", response_model=list[AttemptHistoryItem])
async def list_understanding_attempts(
    request: Request, topic_id: str | None = None, limit: int = 20
) -> list[AttemptHistoryItem]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    rows = repo.list_understanding_attempts(user_id, topic_id=topic_id, limit=limit)
    return [AttemptHistoryItem(**r) for r in rows]
