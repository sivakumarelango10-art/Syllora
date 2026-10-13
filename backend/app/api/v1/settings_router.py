"""Settings, preferences, and data export API routes."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Request
from app.auth import get_current_user_id
from app.rag.store import list_documents
from app.repositories.academic_repository import get_academic_repository
from app.schemas.academic_schemas import (
    StudyPreferencesResponse,
    StudyPreferencesUpdateRequest,
)

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("", response_model=StudyPreferencesResponse)
async def get_settings(request: Request) -> StudyPreferencesResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    prefs = repo.get_study_preferences(user_id)
    return StudyPreferencesResponse(**prefs)


@router.put("", response_model=StudyPreferencesResponse)
async def update_settings(
    body: StudyPreferencesUpdateRequest, request: Request
) -> StudyPreferencesResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    updated = repo.update_study_preferences(
        user_id=user_id,
        daily_study_minutes=body.daily_study_minutes,
        exam_date=body.exam_date,
        preferences=body.preferences,
    )
    return StudyPreferencesResponse(**updated)


@router.post("/export")
async def export_student_data(request: Request) -> dict[str, Any]:
    """Safe data export of all student-owned academic records."""
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    profile = repo.get_profile(user_id)
    prefs = repo.get_study_preferences(user_id)
    courses = repo.list_courses(user_id)
    topics = repo.list_topics(user_id)
    docs = list_documents(user_id=user_id)
    misconceptions = repo.list_misconceptions(user_id=user_id)
    tasks = repo.list_revision_tasks(user_id=user_id)
    attempts = repo.list_understanding_attempts(user_id=user_id)
    sessions = repo.list_chat_sessions(user_id=user_id)

    return {
        "user_id": user_id,
        "exported_at": prefs.get("updated_at"),
        "profile": profile,
        "preferences": prefs,
        "courses": courses,
        "topics": topics,
        "documents": [
            {k: v for k, v in d.items() if k != "storage_filename"} for d in docs
        ],
        "misconceptions": misconceptions,
        "revision_tasks": tasks,
        "understanding_attempts": attempts,
        "chat_sessions": sessions,
    }
