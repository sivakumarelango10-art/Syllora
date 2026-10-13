"""Syllabus topics and evidence API routes."""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from app.auth import get_current_user_id
from app.repositories.academic_repository import get_academic_repository
from app.schemas.academic_schemas import (
    TopicCreateRequest,
    TopicEvidenceItem,
    TopicResponse,
    TopicUpdateRequest,
)

router = APIRouter(prefix="/api/v1/syllabus", tags=["syllabus"])


class LinkEvidenceRequest(BaseModel):
    chunk_id: str
    similarity: float = Field(default=0.8, ge=-1.0, le=1.0)


@router.get("/topics", response_model=list[TopicResponse])
async def list_topics(request: Request, course_id: str | None = None) -> list[TopicResponse]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    rows = repo.list_topics(user_id, course_id=course_id)
    return [TopicResponse(**r) for r in rows]


@router.post("/topics", response_model=TopicResponse, status_code=201)
async def create_topic(body: TopicCreateRequest, request: Request) -> TopicResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    topic = repo.create_topic(
        user_id=user_id,
        course_id=body.course_id,
        title=body.title,
        description=body.description,
        parent_topic_id=body.parent_topic_id,
        sort_order=body.sort_order,
    )
    return TopicResponse(**topic)


@router.get("/topics/{topic_id}", response_model=TopicResponse)
async def get_topic(topic_id: str, request: Request) -> TopicResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    topic = repo.get_topic(user_id, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found.")
    return TopicResponse(**topic)


@router.put("/topics/{topic_id}", response_model=TopicResponse)
async def update_topic(topic_id: str, body: TopicUpdateRequest, request: Request) -> TopicResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    updated = repo.update_topic(user_id, topic_id, body.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Topic not found.")
    return TopicResponse(**updated)


@router.delete("/topics/{topic_id}", status_code=200)
async def delete_topic(topic_id: str, request: Request) -> dict[str, str]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    topic = repo.get_topic(user_id, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found.")
    repo.delete_topic(user_id, topic_id)
    return {"status": "deleted", "topic_id": topic_id}


@router.get("/topics/{topic_id}/evidence", response_model=list[TopicEvidenceItem])
async def list_topic_evidence(topic_id: str, request: Request) -> list[TopicEvidenceItem]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    rows = repo.list_topic_evidence(user_id, topic_id)
    return [TopicEvidenceItem(**r) for r in rows]


@router.post("/topics/{topic_id}/evidence", status_code=201)
async def link_evidence(topic_id: str, body: LinkEvidenceRequest, request: Request) -> dict[str, Any]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    linked = repo.link_topic_evidence(user_id, topic_id, body.chunk_id, body.similarity)
    return linked
