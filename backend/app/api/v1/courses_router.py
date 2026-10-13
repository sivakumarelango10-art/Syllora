"""Courses API routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from app.auth import get_current_user_id
from app.repositories.academic_repository import get_academic_repository
from app.schemas.academic_schemas import CourseCreateRequest, CourseResponse, TopicResponse

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])


@router.get("", response_model=list[CourseResponse])
async def list_courses(request: Request) -> list[CourseResponse]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    rows = repo.list_courses(user_id)
    return [CourseResponse(**r) for r in rows]


@router.post("", response_model=CourseResponse, status_code=201)
async def create_course(body: CourseCreateRequest, request: Request) -> CourseResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    course = repo.create_course(
        user_id=user_id,
        title=body.title,
        code=body.code,
        description=body.description,
    )
    return CourseResponse(**course)


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(course_id: str, request: Request) -> CourseResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    course = repo.get_course(user_id, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    return CourseResponse(**course)


@router.delete("/{course_id}", status_code=200)
async def delete_course(course_id: str, request: Request) -> dict[str, str]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    course = repo.get_course(user_id, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    repo.delete_course(user_id, course_id)
    return {"status": "deleted", "course_id": course_id}


@router.get("/{course_id}/topics", response_model=list[TopicResponse])
async def list_course_topics(course_id: str, request: Request) -> list[TopicResponse]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    rows = repo.list_topics(user_id, course_id=course_id)
    return [TopicResponse(**r) for r in rows]
