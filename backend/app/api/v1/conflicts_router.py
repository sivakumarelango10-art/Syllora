"""FastAPI Router for Source Conflict Detector (F12): Discrepancy analysis and reconciliation."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.rate_limiter import standard_rate_limiter, ai_rate_limiter
from app.services.conflict_service import get_conflict_service
from app.repositories.academic_repository import get_academic_repository

router = APIRouter(prefix="/api/v1/conflicts", tags=["conflicts"])


class ScanConflictsRequest(BaseModel):
    concept: str = Field(min_length=1, max_length=500)
    course_id: str | None = None


class UpdateConflictStatusRequest(BaseModel):
    status: str = Field(pattern="^(detected|reviewed|dismissed)$")


@router.get("")
async def list_source_conflicts(
    request: Request,
    course_id: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    """Lists detected discrepancies across student's uploaded notes."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    conflicts = repo.list_conflicts(user_id=user_id, course_id=course_id, status=status)
    return {"conflicts": conflicts, "count": len(conflicts)}


@router.post("/scan")
async def scan_for_conflicts(
    body: ScanConflictsRequest,
    request: Request,
) -> dict[str, Any]:
    """Scans student documents for contradictory formulas or divergent definitions on a concept (F12)."""
    user_id = get_current_user_id(request)
    ai_rate_limiter.check(user_id)
    conflict_svc = get_conflict_service()
    conflicts = await conflict_svc.scan_for_conflicts(
        user_id=user_id,
        concept=body.concept,
        course_id=body.course_id,
    )
    return {"concept": body.concept, "conflicts": conflicts, "count": len(conflicts)}


@router.patch("/{conflict_id}")
async def update_conflict_status(
    conflict_id: str,
    body: UpdateConflictStatusRequest,
    request: Request,
) -> dict[str, Any]:
    """Allows student to mark conflict as reviewed or dismissed."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    repo.update_conflict_status(user_id=user_id, conflict_id=conflict_id, status=body.status)
    return {"conflict_id": conflict_id, "status": body.status}
