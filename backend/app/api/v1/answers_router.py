"""FastAPI Router for Mark-Aware Answers, Evaluator, Proof Mode, and Answerability (F2, F3, F4, F8)."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.rate_limiter import standard_rate_limiter, ai_rate_limiter
from app.services.answer_service import get_answer_service
from app.services.evaluation_service import get_evaluation_service
from app.services.claim_verifier import get_claim_verifier
from app.services.answerability_service import get_answerability_service
from app.repositories.academic_repository import get_academic_repository

router = APIRouter(prefix="/api/v1/answers", tags=["answers"])


class GenerateAnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    marks: int = Field(default=5, ge=1, le=100)
    document_ids: list[str] | None = None
    top_k: int = Field(default=5, ge=1, le=10)


class EvaluateAnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    student_answer: str = Field(min_length=1, max_length=8000)
    marks: int = Field(default=5, ge=1, le=100)
    course_id: str | None = None
    topic_id: str | None = None
    question_id: str | None = None


class VerifyProofRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=8000)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    message_id: str | None = None


class CheckAnswerabilityRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    course_id: str | None = None
    document_ids: list[str] | None = None


@router.post("/generate")
async def generate_mark_aware_answer(
    body: GenerateAnswerRequest,
    request: Request,
) -> dict[str, Any]:
    """Generates an exam-oriented answer tailored to configurable mark allocation (F2)."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    answer_svc = get_answer_service()
    result = await answer_svc.generate_mark_aware_answer(
        user_id=user_id,
        question=body.question,
        marks=body.marks,
        document_ids=body.document_ids,
        top_k=body.top_k,
    )
    return result


@router.post("/evaluate")
async def evaluate_answer(
    body: EvaluateAnswerRequest,
    request: Request,
) -> dict[str, Any]:
    """Evaluates student's submitted answer against verified study notes with detailed rubric (F3)."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    eval_svc = get_evaluation_service()
    result = await eval_svc.evaluate_student_answer(
        user_id=user_id,
        question=body.question,
        student_answer=body.student_answer,
        marks=body.marks,
        course_id=body.course_id,
        topic_id=body.topic_id,
        question_id=body.question_id,
    )
    return result


@router.post("/verify-proof")
async def verify_proof(
    body: VerifyProofRequest,
    request: Request,
) -> dict[str, Any]:
    """Proof Mode: Verifies factual claims in an answer against cited source passages (F4)."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    verifier = get_claim_verifier()
    result = await verifier.verify_proof(
        user_id=user_id,
        answer_text=body.answer,
        citations=body.citations,
        message_id=body.message_id,
    )
    return result


@router.post("/check-answerability")
async def check_answerability(
    body: CheckAnswerabilityRequest,
    request: Request,
) -> dict[str, Any]:
    """Answerability Meter: Checks whether uploaded materials have sufficient evidence to answer (F8)."""
    user_id = get_current_user_id(request)
    standard_rate_limiter.check(user_id)
    ans_svc = get_answerability_service()
    result = await ans_svc.evaluate_answerability(
        user_id=user_id,
        question=body.question,
        course_id=body.course_id,
        document_ids=body.document_ids,
    )
    return result


@router.get("/evaluations")
async def list_evaluations(
    request: Request,
    limit: int = 20,
) -> dict[str, Any]:
    """Retrieves student's evaluation and rubric grading history."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    evals = repo.list_answer_evaluations(user_id=user_id, limit=limit)
    return {"evaluations": evals, "count": len(evals)}
