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
from app.api.v1.exams_router import router as exams_router
from app.api.v1.answers_router import router as answers_router
from app.api.v1.practice_router import router as practice_router
from app.api.v1.library_router import router as library_router
from app.api.v1.figures_router import router as figures_router
from app.api.v1.conflicts_router import router as conflicts_router
from app.api.v1.viva_router import router as viva_router
from app.api.v1.faculty_router import router as faculty_router

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
    "exams_router",
    "answers_router",
    "practice_router",
    "library_router",
    "figures_router",
    "conflicts_router",
    "viva_router",
    "faculty_router",
]

