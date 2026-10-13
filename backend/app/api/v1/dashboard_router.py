"""Dashboard overview API routes."""
from __future__ import annotations

from fastapi import APIRouter, Request
from app.auth import get_current_user_id
from app.schemas.academic_schemas import DashboardSummaryResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])
_dashboard_service = DashboardService()


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(request: Request) -> DashboardSummaryResponse:
    user_id = get_current_user_id(request)
    data = _dashboard_service.get_summary(user_id)
    return DashboardSummaryResponse(**data)
