"""FastAPI Router for Faculty Mode (F14): Educator question banks, Bloom's tagging, and exam blueprints."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.rate_limiter import standard_rate_limiter
from app.services.faculty_service import get_faculty_service
from app.repositories.academic_repository import get_academic_repository

router = APIRouter(prefix="/api/v1/faculty", tags=["faculty"])


class CreateFacultyQuestionRequest(BaseModel):
    course_id: str
    question_text: str = Field(min_length=1, max_length=2000)
    marks: int = Field(default=5, ge=1, le=100)
    unit_number: int = Field(default=1, ge=1, le=20)
    bloom_level: str = Field(default="Understand", pattern="^(Remember|Understand|Apply|Analyze|Evaluate|Create)$")
    difficulty: str = Field(default="Medium", pattern="^(Easy|Medium|Hard)$")


class BlueprintRequest(BaseModel):
    total_marks: int = Field(default=100, ge=20, le=200)
    units_count: int = Field(default=5, ge=1, le=10)


@router.get("/questions")
async def list_faculty_questions(
    request: Request,
    course_id: str | None = None,
) -> dict[str, Any]:
    """Lists faculty question bank with Bloom's taxonomy tags and unit classifications (F14)."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    questions = repo.list_faculty_questions(user_id=user_id, course_id=course_id)
    return {"questions": questions, "count": len(questions)}


@router.post("/questions", status_code=201)
async def create_faculty_question(
    body: CreateFacultyQuestionRequest,
    request: Request,
) -> dict[str, Any]:
    """Adds a verified question to the faculty question bank."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    created = repo.create_faculty_question(
        user_id=user_id,
        course_id=body.course_id,
        question_text=body.question_text,
        marks=body.marks,
        unit_number=body.unit_number,
        bloom_level=body.bloom_level,
        difficulty=body.difficulty,
    )
    return created


@router.get("/courses/{course_id}/analytics")
async def get_course_faculty_analytics(
    course_id: str,
    request: Request,
) -> dict[str, Any]:
    """Provides aggregate struggle topic analytics for faculty without exposing individual student records (F14)."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    analytics = repo.get_faculty_course_analytics(user_id=user_id, course_id=course_id)
    return analytics


@router.post("/courses/{course_id}/blueprint")
async def generate_exam_blueprint(
    course_id: str,
    body: BlueprintRequest,
    request: Request,
) -> dict[str, Any]:
    """Generates an academic question paper blueprint matching university distributions (F14)."""
    user_id = get_current_user_id(request)
    fac_svc = get_faculty_service()
    blueprint = fac_svc.generate_exam_blueprint(
        user_id=user_id,
        course_id=course_id,
        total_marks=body.total_marks,
        units_count=body.units_count,
    )
    return blueprint


@router.post("/generate-blueprint")
async def generate_exam_blueprint_generic(
    body: BlueprintRequest,
    request: Request,
    course_id: str | None = None,
) -> dict[str, Any]:
    """Generates an academic question paper blueprint for the current course context."""
    user_id = get_current_user_id(request)
    fac_svc = get_faculty_service()
    return fac_svc.generate_exam_blueprint(
        user_id=user_id,
        course_id=course_id or "default-course",
        total_marks=body.total_marks,
        units_count=body.units_count,
    )


@router.get("/weak-topics")
async def get_weak_topics_generic(
    request: Request,
    course_id: str | None = None,
) -> dict[str, Any]:
    """Returns anonymized cohort weak topics for educator view."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    return repo.get_faculty_course_analytics(user_id=user_id, course_id=course_id or "default-course")

