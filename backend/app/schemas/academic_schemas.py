"""Pydantic schemas for Syllora academic platform models."""
from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Auth & Profile
# ---------------------------------------------------------------------------
class UserProfileResponse(BaseModel):
    user_id: str
    display_name: str
    email: str | None = None
    phone_number: str | None = None
    avatar_path: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class UserProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    phone_number: str | None = Field(default=None, max_length=30)
    avatar_path: str | None = Field(default=None, max_length=500)


# ---------------------------------------------------------------------------
# Courses & Syllabus
# ---------------------------------------------------------------------------
class CourseCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    code: str = Field(default="", max_length=50)
    description: str = Field(default="", max_length=2000)


class CourseResponse(BaseModel):
    id: str
    user_id: str
    title: str
    code: str = ""
    description: str = ""
    created_at: str
    updated_at: str
    topic_count: int = 0
    document_count: int = 0


class TopicCreateRequest(BaseModel):
    course_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    parent_topic_id: str | None = None
    sort_order: int = 0


class TopicUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    sort_order: int | None = None
    mastery_score: float | None = Field(default=None, ge=0.0, le=1.0)


class TopicEvidenceItem(BaseModel):
    id: str
    topic_id: str
    chunk_id: str
    similarity: float
    document_id: str | None = None
    document_title: str | None = None
    page_number: int | None = None
    excerpt: str | None = None


class TopicResponse(BaseModel):
    id: str
    user_id: str
    course_id: str
    parent_topic_id: str | None = None
    title: str
    description: str = ""
    sort_order: int = 0
    mastery_score: float | None = None
    created_at: str
    updated_at: str
    evidence_count: int = 0


# ---------------------------------------------------------------------------
# Chat & Conversations
# ---------------------------------------------------------------------------
class ChatSessionCreateRequest(BaseModel):
    title: str = Field(default="New study session", max_length=200)
    course_id: str | None = None


class ChatSessionResponse(BaseModel):
    id: str
    user_id: str
    course_id: str | None = None
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0


class ChatMessageCitation(BaseModel):
    source_id: str = ""
    document_id: str | None = None
    filename: str | None = None
    title: str | None = None
    page_number: int | None = None
    excerpt: str | None = None
    relevance_score: float = 0.0


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    model: str | None = None
    evidence_status: str | None = None
    created_at: str
    citations: list[ChatMessageCitation] = []


# ---------------------------------------------------------------------------
# Check Understanding
# ---------------------------------------------------------------------------
class QuestionGenerateRequest(BaseModel):
    topic_id: str
    course_id: str | None = None
    difficulty: Literal["introductory", "intermediate", "advanced"] = "intermediate"


class QuestionGenerateResponse(BaseModel):
    topic_id: str
    topic_title: str
    question: str
    context_summary: str = ""
    key_concepts: list[str] = []
    model: str = "syllora-qwen"


class UnderstandingEvaluationRequest(BaseModel):
    topic_id: str
    question: str
    student_explanation: str = Field(min_length=1, max_length=4000)


class UnderstandingEvaluationResponse(BaseModel):
    id: str
    topic_id: str
    score: int = Field(ge=1, le=3)
    rubric: dict[str, Any]
    feedback: str
    accurate_points: list[str] = []
    missing_concepts: list[str] = []
    improvement_guidance: str = ""
    model: str = "syllora-qwen"
    created_at: str


class AttemptHistoryItem(BaseModel):
    id: str
    topic_id: str
    topic_title: str | None = None
    explanation: str
    score: int
    rubric: dict[str, Any]
    feedback: str
    model: str | None = None
    created_at: str


# ---------------------------------------------------------------------------
# Misconception Notebook
# ---------------------------------------------------------------------------
class MisconceptionCreateRequest(BaseModel):
    topic_id: str
    student_quote: str = Field(default="", max_length=2000)
    explanation: str = Field(min_length=1, max_length=4000)
    corrected_explanation: str = Field(default="", max_length=4000)
    attempt_id: str | None = None


class MisconceptionUpdateRequest(BaseModel):
    status: Literal["open", "in_progress", "resolved"] | None = None
    corrected_explanation: str | None = Field(default=None, max_length=4000)


class MisconceptionResponse(BaseModel):
    id: str
    user_id: str
    topic_id: str
    topic_title: str | None = None
    attempt_id: str | None = None
    student_quote: str = ""
    explanation: str
    corrected_explanation: str = ""
    status: Literal["open", "in_progress", "resolved"] = "open"
    created_at: str
    resolved_at: str | None = None


# ---------------------------------------------------------------------------
# Revision Planner
# ---------------------------------------------------------------------------
class RevisionTaskCreateRequest(BaseModel):
    topic_id: str
    due_at: str
    priority: int = Field(default=3, ge=1, le=5)
    misconception_id: str | None = None


class RevisionTaskUpdateRequest(BaseModel):
    status: Literal["scheduled", "completed", "skipped"] | None = None
    priority: int | None = Field(default=None, ge=1, le=5)
    due_at: str | None = None


class RevisionTaskResponse(BaseModel):
    id: str
    user_id: str
    topic_id: str
    topic_title: str | None = None
    misconception_id: str | None = None
    due_at: str
    priority: int = 3
    status: Literal["scheduled", "completed", "skipped"] = "scheduled"
    completed_at: str | None = None
    created_at: str


class RevisionGenerateRequest(BaseModel):
    days_ahead: int = Field(default=7, ge=1, le=30)
    daily_study_minutes: int | None = Field(default=None, ge=15, le=480)


# ---------------------------------------------------------------------------
# Dashboard Summary
# ---------------------------------------------------------------------------
class RecentActivityItem(BaseModel):
    type: Literal["upload", "chat", "assessment", "revision", "misconception"]
    title: str
    timestamp: str
    detail: str = ""


class DashboardSummaryResponse(BaseModel):
    total_materials: int = 0
    indexed_materials: int = 0
    total_courses: int = 0
    total_topics: int = 0
    syllabus_coverage_percent: float = 0.0
    active_misconceptions: int = 0
    pending_revision_tasks: int = 0
    recent_activity: list[RecentActivityItem] = []
    continue_learning: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Settings & Preferences
# ---------------------------------------------------------------------------
class StudyPreferencesResponse(BaseModel):
    user_id: str
    daily_study_minutes: int = 45
    exam_date: str | None = None
    preferences: dict[str, Any] = {}
    updated_at: str | None = None


class StudyPreferencesUpdateRequest(BaseModel):
    daily_study_minutes: int | None = Field(default=None, ge=0, le=1440)
    exam_date: str | None = None
    preferences: dict[str, Any] | None = None
