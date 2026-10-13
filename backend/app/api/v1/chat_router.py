"""Chat sessions and message history API routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from app.auth import get_current_user_id
from app.repositories.academic_repository import get_academic_repository
from app.schemas.academic_schemas import (
    ChatMessageResponse,
    ChatSessionCreateRequest,
    ChatSessionResponse,
)

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def list_chat_sessions(request: Request, course_id: str | None = None) -> list[ChatSessionResponse]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    rows = repo.list_chat_sessions(user_id, course_id=course_id)
    return [ChatSessionResponse(**r) for r in rows]


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
async def create_chat_session(body: ChatSessionCreateRequest, request: Request) -> ChatSessionResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    session = repo.create_chat_session(user_id, title=body.title, course_id=body.course_id)
    return ChatSessionResponse(**session)


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_chat_session(session_id: str, request: Request) -> ChatSessionResponse:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    session = repo.get_chat_session(user_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return ChatSessionResponse(**session)


@router.delete("/sessions/{session_id}", status_code=200)
async def delete_chat_session(session_id: str, request: Request) -> dict[str, str]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    session = repo.get_chat_session(user_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    repo.delete_chat_session(user_id, session_id)
    return {"status": "deleted", "session_id": session_id}


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def list_session_messages(session_id: str, request: Request) -> list[ChatMessageResponse]:
    user_id = get_current_user_id(request)
    repo = get_academic_repository()
    session = repo.get_chat_session(user_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    messages = repo.list_chat_messages(user_id, session_id)
    return [ChatMessageResponse(**m) for m in messages]
