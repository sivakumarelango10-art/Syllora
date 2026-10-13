"""Syllora API v1 routers package."""
from app.api.v1.auth_router import router as auth_router
from app.api.v1.dashboard_router import router as dashboard_router
from app.api.v1.courses_router import router as courses_router
from app.api.v1.syllabus_router import router as syllabus_router
from app.api.v1.chat_router import router as chat_router
from app.api.v1.understanding_router import router as understanding_router
from app.api.v1.misconceptions_router import router as misconceptions_router
from app.api.v1.revision_router import router as revision_router
from app.api.v1.settings_router import router as settings_router

__all__ = [
    "auth_router",
    "dashboard_router",
    "courses_router",
    "syllabus_router",
    "chat_router",
    "understanding_router",
    "misconceptions_router",
    "revision_router",
    "settings_router",
]
