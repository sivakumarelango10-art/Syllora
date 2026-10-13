"""Misconception Notebook API routes."""
from __future__ import annotations

from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from app.auth import get_current_user_id
from app.repositories.academic_repository import get_academic_repository
from app.schemas.academic_schemas import (
    MisconceptionCreateRequest,
    MisconceptionResponse,
    MisconceptionUpdateRequest,
)

router = APIRouter(prefix="/api/v1/misconceptions", tags=["misconceptions"])


@router.get("", response_model=list[MisconceptionResponse])
async def list_misconceptions(
    request: Request, status: Literal["open", "in_progress", "resolved"] | None = None
) -> list[MisconceptionResponse]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    rows = repo.list_misconceptions(user_id, status=status)
    return [MisconceptionResponse(**r) for r in rows]


@router.post("", response_model=MisconceptionResponse, status_code=201)
async def create_misconception(
    body: MisconceptionCreateRequest, request: Request
) -> MisconceptionResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    created = repo.create_misconception(
        user_id=user_id,
        topic_id=body.topic_id,
        explanation=body.explanation,
        student_quote=body.student_quote,
        corrected_explanation=body.corrected_explanation,
        attempt_id=body.attempt_id,
    )
    topic = repo.get_topic(user_id, body.topic_id)
    created["topic_title"] = topic["title"] if topic else None
    return MisconceptionResponse(**created)


@router.patch("/{misconception_id}", response_model=MisconceptionResponse)
async def update_misconception(
    misconception_id: str, body: MisconceptionUpdateRequest, request: Request
) -> MisconceptionResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    updated = repo.update_misconception(
        user_id, misconception_id, body.model_dump(exclude_unset=True)
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Misconception not found.")
    return MisconceptionResponse(**updated)


@router.delete("/{misconception_id}", status_code=200)
async def delete_misconception(misconception_id: str, request: Request) -> dict[str, str]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    repo.delete_misconception(user_id, misconception_id)
    return {"status": "deleted", "misconception_id": misconception_id}
