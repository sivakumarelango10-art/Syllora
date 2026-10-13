"""Revision planner API routes."""
from __future__ import annotations

from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from app.auth import get_current_user_id
from app.repositories.academic_repository import get_academic_repository
from app.schemas.academic_schemas import (
    RevisionGenerateRequest,
    RevisionTaskCreateRequest,
    RevisionTaskResponse,
    RevisionTaskUpdateRequest,
)
from app.services.revision_service import RevisionService

router = APIRouter(prefix="/api/v1/revision", tags=["revision"])
_revision_service = RevisionService()


@router.get("/tasks", response_model=list[RevisionTaskResponse])
async def list_revision_tasks(
    request: Request, status: Literal["scheduled", "completed", "skipped"] | None = None
) -> list[RevisionTaskResponse]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    rows = repo.list_revision_tasks(user_id, status=status)
    return [RevisionTaskResponse(**r) for r in rows]


@router.post("/tasks", response_model=RevisionTaskResponse, status_code=201)
async def create_revision_task(
    body: RevisionTaskCreateRequest, request: Request
) -> RevisionTaskResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    task = repo.create_revision_task(
        user_id=user_id,
        topic_id=body.topic_id,
        due_at=body.due_at,
        priority=body.priority,
        misconception_id=body.misconception_id,
    )
    return RevisionTaskResponse(**task)


@router.patch("/tasks/{task_id}", response_model=RevisionTaskResponse)
async def update_revision_task(
    task_id: str, body: RevisionTaskUpdateRequest, request: Request
) -> RevisionTaskResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    updated = repo.update_revision_task(
        user_id=user_id, task_id=task_id, updates=body.model_dump(exclude_unset=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Revision task not found.")
    return RevisionTaskResponse(**updated)


@router.delete("/tasks/{task_id}", status_code=200)
async def delete_revision_task(task_id: str, request: Request) -> dict[str, str]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    repo.delete_revision_task(user_id=user_id, task_id=task_id)
    return {"status": "deleted", "task_id": task_id}


@router.post("/generate", response_model=list[RevisionTaskResponse])
async def generate_revision_tasks(
    body: RevisionGenerateRequest, request: Request
) -> list[RevisionTaskResponse]:
    user_id = get_current_user_id(request)
    generated = _revision_service.generate_revision_plan(
        user_id=user_id,
        days_ahead=body.days_ahead,
        daily_study_minutes=body.daily_study_minutes,
    )
    return [RevisionTaskResponse(**t) for t in generated]
