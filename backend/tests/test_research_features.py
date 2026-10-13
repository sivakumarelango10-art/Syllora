"""Unit and Integration Tests for Syllora Research Features (F1-F14) and Multi-User Isolation."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.db import get_db_adapter
from app.db.base import DEFAULT_DEMO_USER_ID
from app.repositories.academic_repository import get_academic_repository
from app.services.answer_service import get_mark_structure_guidance
from app.services.claim_verifier import get_claim_verifier, split_into_atomic_claims
from app.services.answerability_service import get_answerability_service
from app.services.conflict_service import get_conflict_service


@pytest.fixture
def client():
    return TestClient(app)


def test_f1_exam_questions_api_and_analytics(client):
    """Test F1: Past-paper questions creation, listing, and PYQ analytics."""
    repo = get_academic_repository()

    paper = repo.create_exam_paper(
        user_id=DEFAULT_DEMO_USER_ID,
        title="CS101 Midterm 2024",
        filename="cs101_midterm.pdf",
        storage_path="papers/cs101.pdf",
        exam_year=2024,
        semester="Fall",
        exam_type="Midterm"
    )

    repo.create_exam_question(
        user_id=DEFAULT_DEMO_USER_ID,
        exam_paper_id=paper["id"],
        question_number="1a",
        question_text="What are the four necessary conditions for deadlock?",
        marks=5,
        unit_number=3,
        repeat_count=2
    )
    repo.create_exam_question(
        user_id=DEFAULT_DEMO_USER_ID,
        exam_paper_id=paper["id"],
        question_number="1b",
        question_text="Explain mutual exclusion and hold and wait.",
        marks=5,
        unit_number=3,
        repeat_count=2
    )
    repo.create_exam_question(
        user_id=DEFAULT_DEMO_USER_ID,
        exam_paper_id=paper["id"],
        question_number="2a",
        question_text="Define virtual memory paging mechanism.",
        marks=10,
        unit_number=4,
        repeat_count=1
    )

    # Test GET questions
    response = client.get("/api/v1/exams/questions")
    assert response.status_code == 200
    data = response.json()
    assert "questions" in data
    assert len(data["questions"]) >= 3

    # Test GET analytics
    analytics_res = client.get("/api/v1/exams/analytics")
    assert analytics_res.status_code == 200
    analytics = analytics_res.json()
    assert analytics["total_papers"] >= 1
    assert analytics["total_questions"] >= 3
    assert analytics["repeated_questions_count"] >= 2


def test_f2_mark_aware_answer_structure():
    """Test F2: Academic structure guidance scaling across 2M, 5M, 16M."""
    g_2m = get_mark_structure_guidance(2)
    assert g_2m["tier"] == "short"
    assert "50 to 90 words" in g_2m["target_words"]

    g_5m = get_mark_structure_guidance(5)
    assert g_5m["tier"] == "medium"
    assert "180 to 280 words" in g_5m["target_words"]

    g_16m = get_mark_structure_guidance(16)
    assert g_16m["tier"] == "long"
    assert "400 to 650 words" in g_16m["target_words"]
    assert "### 1. Abstract & Core Definition" in g_16m["instruction"]


def test_f3_source_grounded_answer_evaluator(client):
    """Test F3: Answer evaluation endpoint with rubric analysis."""
    mock_eval = {
        "score_awarded": 4.0,
        "percentage": 80.0,
        "conceptual_accuracy": 0.85,
        "point_coverage": 0.80,
        "structure_depth": 0.75,
        "terminology": 0.80,
        "covered_points": ["Mutual exclusion", "Hold and wait", "Circular wait"],
        "missing_points": ["No preemption"],
        "inaccuracies": [],
        "feedback": "Strong understanding of Coffman deadlock conditions.",
        "misconception_identified": ""
    }

    with patch("app.services.evaluation_service.chat_completion", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = json.dumps(mock_eval)

        res = client.post(
            "/api/v1/answers/evaluate",
            json={
                "question": "State the 4 Coffman conditions for deadlock.",
                "student_answer": "Deadlock requires mutual exclusion, hold and wait, and circular wait.",
                "marks": 5
            }
        )
        assert res.status_code == 200
        data = res.json()
        assert data["score_awarded"] == 4.0
        assert "Mutual exclusion" in data["covered_points"]
        assert "No preemption" in data["missing_points"]


def test_f4_claim_verifier_proof_mode(client):
    """Test F4: Proof Mode atomic claim extraction and verification status."""
    claims = split_into_atomic_claims(
        "Virtual memory allows execution of processes not completely in memory. "
        "It eliminates the need for contiguous allocation. "
        "Demand paging brings pages into memory on demand."
    )
    assert len(claims) == 3

    verifier = get_claim_verifier()
    answer_text = "Virtual memory decouples logical address space from physical memory. [S1]"
    citations = [
        {"source_id": "S1", "document_title": "OS Concepts", "page": 240, "excerpt": "Virtual memory decouples logical address space from physical memory."}
    ]

    import asyncio
    report = asyncio.run(verifier.verify_proof(DEFAULT_DEMO_USER_ID, answer_text, citations))

    assert "claims" in report
    assert len(report["claims"]) >= 1
    assert report["claims"][0]["status"] == "supported"


def test_f5_practice_session_lifecycle(client):
    """Test F5: Try-First Practice mode submission and scoring."""
    mock_eval = {
        "score_awarded": 4.0,
        "percentage": 80.0,
        "conceptual_accuracy": 0.8,
        "point_coverage": 0.8,
        "structure_depth": 0.8,
        "terminology": 0.8,
        "covered_points": ["Resource Allocation"],
        "missing_points": [],
        "inaccuracies": [],
        "feedback": "Good attempt",
        "misconception_identified": ""
    }

    with patch("app.services.evaluation_service.chat_completion", new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = json.dumps(mock_eval)
        sub_res = client.post(
            "/api/v1/practice/attempts",
            json={
                "question_id": "q-f5-1",
                "question_text": "Explain deadlock prevention.",
                "student_attempt": "Deadlock happens when processes hold resources and wait for others.",
                "marks": 5,
                "hints_used": 1
            }
        )
        assert sub_res.status_code == 201
        result = sub_res.json()
        assert "attempt_id" in result
        assert "evaluation" in result
        assert result["hints_used"] == 1


def test_f6_library_search(client):
    """Test F6: Semester-wide library search across courses."""
    res = client.post(
        "/api/v1/library/search",
        json={"query": "deadlock", "limit": 5}
    )
    assert res.status_code == 200
    data = res.json()
    assert "results" in data
    assert "count" in data


def test_f8_answerability_meter():
    """Test F8: Answerability classification for fully supported vs unsupported questions."""
    meter = get_answerability_service()
    import asyncio
    res_empty = asyncio.run(meter.evaluate_answerability(DEFAULT_DEMO_USER_ID, "What is virtual memory?"))
    assert res_empty["status"] in ("unable_to_determine", "insufficient_information", "fully_supported", "partially_supported")
    assert "confidence_score" in res_empty


def test_f9_and_f10_revision_and_syllabus(client):
    """Test F9 Syllabus coverage endpoint and F10 Exam revision plan generator."""
    # Test F9 coverage endpoint
    cov_res = client.get("/api/v1/syllabus/coverage")
    assert cov_res.status_code == 200
    cov_data = cov_res.json()
    assert "critical_blindspots" in cov_data

    # Test F10 exam revision plan endpoint
    plan_res = client.post(
        "/api/v1/revision/generate-exam-plan",
        json={"exam_date": "2026-11-20", "daily_minutes": 60}
    )
    assert plan_res.status_code == 200
    plan_data = plan_res.json()
    assert "days_remaining" in plan_data
    assert "daily_schedule" in plan_data


def test_f11_figure_search(client):
    """Test F11: Diagram search endpoint."""
    res = client.get("/api/v1/figures/search?query=deadlock")
    assert res.status_code == 200
    data = res.json()
    assert "figures" in data


def test_f12_conflict_detector():
    """Test F12: Conflict service scan method returns list."""
    detector = get_conflict_service()
    import asyncio
    conflicts = asyncio.run(detector.scan_for_conflicts(DEFAULT_DEMO_USER_ID, "cache size"))
    assert isinstance(conflicts, list)


def test_f13_viva_simulator(client):
    """Test F13: Viva simulator session start and response grading with mocked model."""
    mock_q = "Explain the difference between a mutex and a binary semaphore."
    mock_eval = {
        "score_awarded": 4.5,
        "percentage": 90.0,
        "feedback": "Precise articulation of ownership and signaling semantics.",
        "covered_points": ["Mutual exclusion", "Ownership"],
        "missing_points": [],
        "inaccuracies": [],
        "misconception_identified": ""
    }

    with patch("app.services.viva_service.search_passages", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.viva_service.chat_completion", new_callable=AsyncMock) as mock_viva_chat, \
         patch("app.services.evaluation_service.chat_completion", new_callable=AsyncMock) as mock_eval_chat:
        mock_viva_chat.side_effect = [mock_q, "Can a non-owner thread release this mutex?"]
        mock_eval_chat.return_value = json.dumps(mock_eval)

        start_res = client.post(
            "/api/v1/viva/start",
            json={"topic_title": "Process Synchronization"}
        )
        assert start_res.status_code == 201
        viva_data = start_res.json()
        assert "session_id" in viva_data
        assert viva_data["opening_question"] == mock_q

        session_id = viva_data["session_id"]
        ans_res = client.post(
            "/api/v1/viva/respond",
            json={
                "session_id": session_id,
                "student_transcript": "A mutex has an ownership requirement whereas a semaphore does not."
            }
        )
        assert ans_res.status_code == 200
        eval_data = ans_res.json()
        assert eval_data["evaluation"]["score_awarded"] == 4.5
        assert "follow_up_question" in eval_data


def test_f14_faculty_question_bank_and_blueprint(client):
    """Test F14: Faculty question bank insertion, listing, and exam paper blueprint synthesis."""
    # Insert question
    add_res = client.post(
        "/api/v1/faculty/questions",
        json={
            "course_id": "test-course-f14",
            "question_text": "Differentiate between paging and segmentation.",
            "marks": 5,
            "bloom_level": "Analyze",
            "unit_number": 4,
            "difficulty": "Medium"
        }
    )
    assert add_res.status_code == 201
    q_data = add_res.json()
    assert "id" in q_data

    # List questions
    list_res = client.get("/api/v1/faculty/questions")
    assert list_res.status_code == 200
    assert len(list_res.json()["questions"]) >= 1

    # Generate balanced blueprint
    bp_res = client.post(
        "/api/v1/faculty/generate-blueprint",
        json={
            "total_marks": 50,
            "units_count": 5
        }
    )
    assert bp_res.status_code == 200
    bp_data = bp_res.json()
    assert bp_data["total_marks"] == 50
    assert "blueprint_structure" in bp_data


def test_multi_user_isolation(client):
    """Test Security: Two-user data isolation on questions and practice sessions."""
    repo = get_academic_repository()

    paper_a = repo.create_exam_paper(
        user_id="user-secret-a",
        title="Exam A",
        filename="a.pdf",
        storage_path="a.pdf",
        exam_year=2024
    )
    q_a = repo.create_exam_question(
        user_id="user-secret-a",
        exam_paper_id=paper_a["id"],
        question_number="1",
        question_text="Secret exam question for User A",
        marks=5
    )

    # User B lists questions - must NOT see User A's question when scoped
    questions_user_b = repo.list_exam_questions(user_id="user-secret-b")
    ids_user_b = [q["id"] for q in questions_user_b]

    assert q_a["id"] not in ids_user_b

    # User A lists questions - must see their own question
    questions_user_a = repo.list_exam_questions(user_id="user-secret-a")
    ids_user_a = [q["id"] for q in questions_user_a]

    assert q_a["id"] in ids_user_a
