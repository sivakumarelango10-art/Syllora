"""FastAPI Router for Past-Paper Intelligence (F1): PYQ uploads, questions, and repeat frequency analytics."""
from __future__ import annotations

import uuid
from typing import Any
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.rate_limiter import standard_rate_limiter, ai_rate_limiter
from app.config import MAX_UPLOAD_BYTES
from app.services.exam_service import get_exam_service
from app.repositories.academic_repository import get_academic_repository

router = APIRouter(prefix="/api/v1/exams", tags=["exams"])


class UpdateQuestionRequest(BaseModel):
    question_text: str | None = None
    marks: int | None = Field(default=None, ge=1, le=100)
    unit_number: int | None = Field(default=None, ge=1, le=20)
    topic_hint: str | None = None
    evidence_status: str | None = None


@router.post("/papers", status_code=201)
async def upload_exam_paper(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    exam_year: int = Form(...),
    semester: str = Form(default="Spring"),
    exam_type: str = Form(default="End-Semester"),
    course_id: str | None = Form(default=None),
) -> dict[str, Any]:
    """Uploads a previous-year question paper PDF and automatically extracts exam questions."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF exam papers are supported.")

    pdf_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Exam paper PDF exceeds upload limit.")

    exam_svc = get_exam_service()
    result = exam_svc.process_pyq_pdf(
        user_id=user_id,
        pdf_bytes=pdf_bytes,
        filename=file.filename,
        title=title,
        exam_year=exam_year,
        semester=semester,
        exam_type=exam_type,
        course_id=course_id,
    )
    return result


@router.get("/papers")
async def list_exam_papers(
    request: Request,
    course_id: str | None = None,
) -> dict[str, Any]:
    """Lists all uploaded previous-year question papers for the student."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    papers = repo.list_exam_papers(user_id=user_id, course_id=course_id)
    return {"papers": papers, "count": len(papers)}


@router.get("/papers/{paper_id}")
async def get_exam_paper_details(
    paper_id: str,
    request: Request,
) -> dict[str, Any]:
    """Retrieves paper metadata and all extracted questions for this paper."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    paper = repo.get_exam_paper(user_id=user_id, paper_id=paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Exam paper not found.")
    questions = repo.list_exam_questions(user_id=user_id, paper_id=paper_id)
    return {"paper": paper, "questions": questions, "count": len(questions)}


@router.delete("/papers/{paper_id}")
async def delete_exam_paper(
    paper_id: str,
    request: Request,
) -> dict[str, Any]:
    """Deletes an exam paper and all associated extracted questions."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    repo.delete_exam_paper(user_id=user_id, paper_id=paper_id)
    return {"status": "deleted", "paper_id": paper_id}


@router.get("/questions")
async def list_exam_questions(
    request: Request,
    paper_id: str | None = None,
    course_id: str | None = None,
    unit_number: int | None = None,
) -> dict[str, Any]:
    """Lists questions across papers with optional filtering by unit or course."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    questions = repo.list_exam_questions(
        user_id=user_id,
        paper_id=paper_id,
        course_id=course_id,
        unit_number=unit_number,
    )
    return {"questions": questions, "count": len(questions)}


@router.patch("/questions/{question_id}")
async def update_question(
    question_id: str,
    body: UpdateQuestionRequest,
    request: Request,
) -> dict[str, Any]:
    """Allows student to correct extracted question text, marks, or syllabus unit."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    updated = repo.update_exam_question(
        user_id=user_id,
        question_id=question_id,
        question_text=body.question_text,
        marks=body.marks,
        unit_number=body.unit_number,
        topic_hint=body.topic_hint,
        evidence_status=body.evidence_status,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Question not found.")
    return updated


@router.post("/questions/{question_id}/evidence")
async def link_question_evidence(
    question_id: str,
    request: Request,
) -> dict[str, Any]:
    """Scans student's notes and links relevant passages as supporting evidence for this question."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    exam_svc = get_exam_service()
    evidence = await exam_svc.link_question_evidence_async(user_id=user_id, question_id=question_id)
    return {"question_id": question_id, "evidence": evidence, "count": len(evidence)}


@router.get("/questions/{question_id}/evidence")
async def get_question_evidence(
    question_id: str,
    request: Request,
) -> dict[str, Any]:
    """Retrieves linked note passages and page numbers for a question."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    evidence = repo.get_question_evidence(user_id=user_id, question_id=question_id)
    return {"question_id": question_id, "evidence": evidence, "count": len(evidence)}


@router.get("/analytics")
async def get_exam_analytics(
    request: Request,
    course_id: str | None = None,
) -> dict[str, Any]:
    """Returns past-paper intelligence analytics: repetition frequencies, unit heatmap, and marks distribution."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    analytics = repo.get_exam_analytics(user_id=user_id, course_id=course_id)
    return analytics
