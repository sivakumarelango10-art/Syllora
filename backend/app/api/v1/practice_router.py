"""FastAPI Router for Try-First Mode & Practice Simulator (F5)."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.rate_limiter import standard_rate_limiter, ai_rate_limiter
from app.services.evaluation_service import get_evaluation_service
from app.repositories.academic_repository import get_academic_repository

router = APIRouter(prefix="/api/v1/practice", tags=["practice"])


class PracticeAttemptRequest(BaseModel):
    question_id: str
    question_text: str
    student_attempt: str = Field(min_length=1, max_length=8000)
    marks: int = Field(default=5, ge=1, le=100)
    hints_used: int = Field(default=0, ge=0, le=5)
    topic_id: str | None = None


@router.post("/attempts", status_code=201)
async def submit_practice_attempt(
    body: PracticeAttemptRequest,
    request: Request,
) -> dict[str, Any]:
    """Evaluates Try-First practice attempt, scores against notes, and persists result (F5)."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    eval_svc = get_evaluation_service()
    repo = get_academic_repository()

    # 1. Run rigorous source-grounded evaluation
    eval_result = await eval_svc.evaluate_student_answer(
        user_id=user_id,
        question=body.question_text,
        student_answer=body.student_attempt,
        marks=body.marks,
        topic_id=body.topic_id,
        question_id=body.question_id,
    )

    # 2. Persist practice attempt record
    attempt_record = repo.save_practice_attempt(
        user_id=user_id,
        question_id=body.question_id,
        student_attempt=body.student_attempt,
        hints_used=body.hints_used,
        score=eval_result["score_awarded"],
        status="completed",
    )

    return {
        "attempt_id": attempt_record["id"],
        "evaluation": eval_result,
        "hints_used": body.hints_used,
    }


@router.get("/attempts")
async def list_practice_attempts(
    request: Request,
    question_id: str | None = None,
) -> dict[str, Any]:
    """Lists history of practice attempts for the student."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    attempts = repo.list_practice_attempts(user_id=user_id, question_id=question_id)
    return {"attempts": attempts, "count": len(attempts)}
