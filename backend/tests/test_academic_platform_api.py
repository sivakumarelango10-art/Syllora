"""Automated end-to-end tests for Syllora academic platform APIs and services."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from app.db.base import DEFAULT_DEMO_USER_ID
from app.main import app
from app.repositories.academic_repository import get_academic_repository


@pytest.fixture
def client():
    return TestClient(app)


def test_auth_me_and_profile_update(client: TestClient):
    """Verify profile retrieval and update endpoints."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 200
    data = res.json()
    assert "user_id" in data
    assert "display_name" in data

    # Update profile
    upd = client.put("/api/v1/auth/profile", json={"display_name": "Prajith Scholar"})
    assert upd.status_code == 200
    assert upd.json()["display_name"] == "Prajith Scholar"


def test_courses_and_syllabus_lifecycle(client: TestClient):
    """Verify course creation, topic creation, updating, and evidence linking."""
    # 1. Create Course
    course_res = client.post(
        "/api/v1/courses",
        json={"title": "Distributed Systems", "code": "CS401", "description": "Consensus & Raft"},
    )
    assert course_res.status_code == 201
    course_data = course_res.json()
    course_id = course_data["id"]
    assert course_data["title"] == "Distributed Systems"

    # 2. List Courses
    list_res = client.get("/api/v1/courses")
    assert list_res.status_code == 200
    courses = list_res.json()
    assert any(c["id"] == course_id for c in courses)

    # 3. Create Syllabus Topic
    topic_res = client.post(
        "/api/v1/syllabus/topics",
        json={
            "course_id": course_id,
            "title": "Raft Leader Election",
            "description": "Heartbeats and term transitions",
            "sort_order": 1,
        },
    )
    assert topic_res.status_code == 201
    topic_data = topic_res.json()
    topic_id = topic_data["id"]

    # 4. Update Topic Mastery
    upd_topic = client.put(
        f"/api/v1/syllabus/topics/{topic_id}",
        json={"mastery_score": 0.85},
    )
    assert upd_topic.status_code == 200
    assert upd_topic.json()["mastery_score"] == 0.85

    # 5. Link Evidence to Topic
    chunk_id = str(uuid.uuid4())
    link_res = client.post(
        f"/api/v1/syllabus/topics/{topic_id}/evidence",
        json={"chunk_id": chunk_id, "similarity": 0.92},
    )
    assert link_res.status_code == 201

    # 6. List Topic Evidence
    ev_list = client.get(f"/api/v1/syllabus/topics/{topic_id}/evidence")
    assert ev_list.status_code == 200


def test_chat_session_and_message_persistence(client: TestClient):
    """Verify chat session creation and message persistence."""
    # 1. Create chat session
    sess_res = client.post(
        "/api/v1/chat/sessions",
        json={"title": "Midterm Exam Preparation"},
    )
    assert sess_res.status_code == 201
    session_id = sess_res.json()["id"]

    # 2. List sessions
    list_res = client.get("/api/v1/chat/sessions")
    assert list_res.status_code == 200
    assert any(s["id"] == session_id for s in list_res.json())

    # 3. Ask Syllora with session_id persistence
    with patch("app.main.search_passages", new=AsyncMock(return_value=[{
        "chunk_id": str(uuid.uuid4()),
        "document_id": str(uuid.uuid4()),
        "filename": "OS_Notes.pdf",
        "title": "Operating Systems",
        "page_number": 12,
        "text": "Deadlock requires circular wait and no preemption.",
        "score": 0.95,
        "semantic_score": 0.95,
        "keyword_score": 0.9,
    }])), patch("app.main.chat_completion", new=AsyncMock(return_value="According to [S1], circular wait is necessary.")):
        ask_res = client.post(
            "/api/v1/ask",
            json={
                "question": "What conditions are necessary for deadlock?",
                "session_id": session_id,
            },
        )
        assert ask_res.status_code == 200
        assert ask_res.json()["status"] == "answered"

    # 4. Verify messages are persisted in session
    msg_res = client.get(f"/api/v1/chat/sessions/{session_id}/messages")
    assert msg_res.status_code == 200
    messages = msg_res.json()
    assert len(messages) >= 2
    roles = [m["role"] for m in messages]
    assert "user" in roles
    assert "assistant" in roles


def test_check_understanding_workflow(client: TestClient):
    """Verify understanding question generation and rubric evaluation."""
    repo = get_academic_repository()
    # Create test course and topic
    course = repo.create_course(DEFAULT_DEMO_USER_ID, "Algorithms")
    topic = repo.create_topic(DEFAULT_DEMO_USER_ID, course["id"], "Binary Search Invariants")

    # 1. Generate Question
    with patch("app.services.understanding_service.chat_completion", new=AsyncMock(return_value='{"question": "Why does binary search require a sorted array?", "context_summary": "Invariants", "key_concepts": ["Monotonicity"]}')):
        gen_res = client.post(
            "/api/v1/understanding/generate",
            json={"topic_id": topic["id"], "difficulty": "intermediate"},
        )
        assert gen_res.status_code == 200
        assert "question" in gen_res.json()

    # 2. Evaluate Explanation
    with patch("app.services.understanding_service.chat_completion", new=AsyncMock(return_value='{"score": 3, "accurate_points": ["Monotonic property ensures elimination of half search space"], "missing_concepts": [], "improvement_guidance": "Excellent explanation", "feedback": "Flawless reasoning."}')):
        eval_res = client.post(
            "/api/v1/understanding/evaluate",
            json={
                "topic_id": topic["id"],
                "question": "Why does binary search require a sorted array?",
                "student_explanation": "Because sorting provides monotonicity, allowing us to safely eliminate half of the remaining elements at each step.",
            },
        )
        assert eval_res.status_code == 200
        data = eval_res.json()
        assert data["score"] == 3
        assert "rubric" in data

    # 3. List Attempts
    attempts_res = client.get(f"/api/v1/understanding/attempts?topic_id={topic['id']}")
    assert attempts_res.status_code == 200
    assert len(attempts_res.json()) >= 1


def test_misconceptions_lifecycle(client: TestClient):
    """Verify creating, listing, updating, and resolving misconceptions."""
    repo = get_academic_repository()
    course = repo.create_course(DEFAULT_DEMO_USER_ID, "Systems")
    topic = repo.create_topic(DEFAULT_DEMO_USER_ID, course["id"], "Deadlock vs Starvation")

    # 1. Create misconception
    create_res = client.post(
        "/api/v1/misconceptions",
        json={
            "topic_id": topic["id"],
            "student_quote": "Deadlock and starvation are identical.",
            "explanation": "Confusing starvation (indefinite wait) with circular deadlock.",
            "corrected_explanation": "Starvation is when high-priority processes monopolize resources; deadlock is circular blocking.",
        },
    )
    assert create_res.status_code == 201
    misc = create_res.json()
    misc_id = misc["id"]
    assert misc["status"] == "open"

    # 2. Update status to resolved
    patch_res = client.patch(
        f"/api/v1/misconceptions/{misc_id}",
        json={"status": "resolved"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "resolved"


def test_revision_planner_priority_engine(client: TestClient):
    """Verify revision task creation, priority calculation, and plan generation."""
    repo = get_academic_repository()
    course = repo.create_course(DEFAULT_DEMO_USER_ID, "Computer Architecture")
    topic = repo.create_topic(DEFAULT_DEMO_USER_ID, course["id"], "Pipelining Hazards", mastery_score=0.3)

    # 1. Create revision task
    task_res = client.post(
        "/api/v1/revision/tasks",
        json={
            "topic_id": topic["id"],
            "due_at": "2026-10-20T10:00:00Z",
            "priority": 4,
        },
    )
    assert task_res.status_code == 201
    task = task_res.json()
    task_id = task["id"]

    # 2. Update task completion
    upd_res = client.patch(
        f"/api/v1/revision/tasks/{task_id}",
        json={"status": "completed"},
    )
    assert upd_res.status_code == 200
    assert upd_res.json()["status"] == "completed"

    # 3. Generate revision plan
    gen_res = client.post(
        "/api/v1/revision/generate",
        json={"days_ahead": 5},
    )
    assert gen_res.status_code == 200
    assert isinstance(gen_res.json(), list)


def test_dashboard_summary_and_settings_export(client: TestClient):
    """Verify dashboard summary metrics aggregation and student data export."""
    # 1. Dashboard summary
    dash_res = client.get("/api/v1/dashboard/summary")
    assert dash_res.status_code == 200
    summary = dash_res.json()
    assert "total_materials" in summary
    assert "total_courses" in summary
    assert "syllabus_coverage_percent" in summary

    # 2. Settings preferences
    set_res = client.get("/api/v1/settings")
    assert set_res.status_code == 200
    assert "daily_study_minutes" in set_res.json()

    # Update preferences
    upd_set = client.put(
        "/api/v1/settings",
        json={"daily_study_minutes": 60, "exam_date": "2026-12-15"},
    )
    assert upd_set.status_code == 200
    assert upd_set.json()["daily_study_minutes"] == 60

    # 3. Export data
    exp_res = client.post("/api/v1/settings/export")
    assert exp_res.status_code == 200
    exp = exp_res.json()
    assert "profile" in exp
    assert "preferences" in exp
    assert "courses" in exp
    assert "topics" in exp
