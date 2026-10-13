"""Auth & profile API routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from app.auth import get_current_user_id
from app.repositories.academic_repository import get_academic_repository
from app.schemas.academic_schemas import UserProfileResponse, UserProfileUpdateRequest

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(request: Request) -> UserProfileResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    profile = repo.get_profile(user_id)
    return UserProfileResponse(
        user_id=user_id,
        display_name=profile.get("display_name", "Student"),
        avatar_path=profile.get("avatar_path"),
        created_at=profile.get("created_at"),
        updated_at=profile.get("updated_at"),
    )


@router.put("/profile", response_model=UserProfileResponse)
async def update_my_profile(
    body: UserProfileUpdateRequest, request: Request
) -> UserProfileResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    updated = repo.update_profile(
        user_id=user_id,
        display_name=body.display_name,
        avatar_path=body.avatar_path,
    )
    return UserProfileResponse(
        user_id=user_id,
        display_name=updated.get("display_name", "Student"),
        avatar_path=updated.get("avatar_path"),
        created_at=updated.get("created_at"),
        updated_at=updated.get("updated_at"),
    )
