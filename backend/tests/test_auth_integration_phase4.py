"""Comprehensive Phase 4.1 regression tests: Supabase Auth, token verification,
RLS identity, tenant isolation, and unauthorized access rejection.
"""
from __future__ import annotations

import os
import time
import uuid
import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import get_current_user_id, verify_supabase_jwt
from app.db.base import DEFAULT_DEMO_USER_ID
from app.main import app
from app.repositories.academic_repository import AcademicRepository, get_academic_repository


TEST_JWT_SECRET = "test-secret-key-at-least-32-chars-long-12345"


@pytest.fixture
def client():
    return TestClient(app)


def _generate_test_token(
    user_id: str,
    secret: str = TEST_JWT_SECRET,
    expired: bool = False,
    aud: str = "authenticated",
) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "aud": aud,
        "role": "authenticated",
        "email": f"student-{user_id[:8]}@syllora.edu",
        "iat": now - 100,
        "exp": now - 10 if expired else now + 3600,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


# ===========================================================================
# 1. TOKEN VERIFICATION & EXPIRY TESTS
# ===========================================================================

def test_verified_session_identity_and_valid_claims(monkeypatch):
    """Ensure a properly signed Supabase JWT extracts the correct UUID sub claim."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    user_id = str(uuid.uuid4())
    token = _generate_test_token(user_id)

    payload = verify_supabase_jwt(token)
    assert payload["sub"] == user_id
    assert payload["role"] == "authenticated"
    assert payload["aud"] == "authenticated"


def test_token_expiry_rejection(monkeypatch):
    """Ensure expired tokens are strictly rejected with HTTP 401."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    user_id = str(uuid.uuid4())
    token = _generate_test_token(user_id, expired=True)

    with pytest.raises(HTTPException) as exc_info:
        verify_supabase_jwt(token)
    assert exc_info.value.status_code == 401
    assert "Invalid or unverified authentication token" in exc_info.value.detail


def test_rejected_forged_and_invalid_tokens(monkeypatch):
    """Ensure forged tokens with wrong secrets or invalid formats are rejected."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    user_id = str(uuid.uuid4())

    # 1. Wrong signing secret
    forged_token = _generate_test_token(user_id, secret="wrong-unauthorized-secret-key-12345")
    with pytest.raises(HTTPException) as exc_info:
        verify_supabase_jwt(forged_token)
    assert exc_info.value.status_code == 401

    # 2. Malformed token string
    with pytest.raises(HTTPException) as exc_info:
        verify_supabase_jwt("not.a.valid.jwt.token")
    assert exc_info.value.status_code == 401

    # 3. Invalid non-UUID sub claim
    now = int(time.time())
    non_uuid_token = jwt.encode(
        {"sub": "not-a-uuid", "aud": "authenticated", "exp": now + 3600},
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        verify_supabase_jwt(non_uuid_token)
    assert exc_info.value.status_code == 401
    assert "UUID" in exc_info.value.detail


# ===========================================================================
# 2. HOSTED MODE ENFORCEMENT & API REJECTION TESTS
# ===========================================================================

def test_unauthorized_api_rejection_in_hosted_mode(client: TestClient, monkeypatch):
    """In hosted mode (SYLLORA_DB_PROVIDER=postgres), any request without a token must return 401."""
    monkeypatch.setenv("SYLLORA_DB_PROVIDER", "postgres")

    # Protected endpoints across modules
    protected_paths = [
        ("GET", "/api/v1/auth/me"),
        ("GET", "/api/v1/courses"),
        ("POST", "/api/v1/courses", {"title": "Test"}),
        ("GET", "/api/v1/documents"),
        ("GET", "/api/v1/chat/sessions"),
        ("GET", "/api/v1/misconceptions"),
        ("GET", "/api/v1/revision/tasks"),
        ("GET", "/api/v1/llm/status"),
        ("POST", "/api/v1/llm/test", {"message": "Test"}),
        ("POST", "/api/v1/search", {"query": "Test"}),
        ("POST", "/api/v1/ask", {"question": "Test"}),
    ]

    for item in protected_paths:
        method = item[0]
        path = item[1]
        payload = item[2] if len(item) > 2 else None
        if method == "GET":
            res = client.get(path)
        else:
            res = client.post(path, json=payload or {})
        assert res.status_code == 401, f"Expected 401 for {method} {path}, got {res.status_code}"
        assert "Authentication required in hosted database mode" in res.json()["detail"]


def test_prevent_spoofing_headers_in_hosted_mode(client: TestClient, monkeypatch):
    """Ensure spoofed headers like X-User-Id cannot bypass authentication."""
    monkeypatch.setenv("SYLLORA_DB_PROVIDER", "postgres")

    res = client.get(
        "/api/v1/auth/me",
        headers={"X-User-Id": "00000000-0000-0000-0000-000000000001", "X-Remote-User": "admin"},
    )
    assert res.status_code == 401


def test_authorized_api_access_with_valid_token(client: TestClient, monkeypatch):
    """With a valid Bearer token, protected endpoints authenticate and identify the user."""
    monkeypatch.setenv("SYLLORA_DB_PROVIDER", "postgres")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)

    user_id = str(uuid.uuid4())
    token = _generate_test_token(user_id)

    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["user_id"] == user_id


# ===========================================================================
# 3. REPOSITORY TWO-USER TENANT ISOLATION TESTS
# ===========================================================================

def test_two_user_isolation_in_repository():
    """Verify complete data isolation between User A and User B across repository operations."""
    repo = get_academic_repository()
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())

    # User A creates entities
    course_a = repo.create_course(user_a, title="Operating Systems A", code="CS301A")
    topic_a = repo.create_topic(user_a, course_a["id"], title="Virtual Memory A")
    chat_a = repo.create_chat_session(user_a, title="Paging Study Session")
    msg_a = repo.add_chat_message(user_a, chat_a["id"], role="user", content="Explain TLB")
    att_a = repo.create_understanding_attempt(
        user_a, topic_a["id"], explanation="TLB is cache", score=3,
        rubric={"accuracy": 1}, feedback="Good"
    )
    misc_a = repo.create_misconception(
        user_a, topic_a["id"], explanation="TLB misses cause page faults",
        student_quote="TLB miss always causes page fault"
    )
    task_a = repo.create_revision_task(user_a, topic_a["id"], due_at="2026-11-01T10:00:00Z")

    # User B queries: MUST NOT see User A's data
    courses_b = repo.list_courses(user_b)
    assert not any(c["id"] == course_a["id"] for c in courses_b)

    topics_b = repo.list_topics(user_b)
    assert not any(t["id"] == topic_a["id"] for t in topics_b)

    chats_b = repo.list_chat_sessions(user_b)
    assert not any(s["id"] == chat_a["id"] for s in chats_b)

    miscs_b = repo.list_misconceptions(user_b)
    assert not any(m["id"] == misc_a["id"] for m in miscs_b)

    tasks_b = repo.list_revision_tasks(user_b)
    assert not any(t["id"] == task_a["id"] for t in tasks_b)

    # User B attempts to fetch User A's single items: MUST return None
    assert repo.get_course(user_b, course_a["id"]) is None
    assert repo.get_topic(user_b, topic_a["id"]) is None
    assert repo.get_chat_session(user_b, chat_a["id"]) is None

    # User B attempts to update User A's topic: MUST return None
    assert repo.update_topic(user_b, topic_a["id"], {"title": "Hacked Title"}) is None

    # User B attempts to delete User A's course: User A's course must remain intact
    repo.delete_course(user_b, course_a["id"])
    assert repo.get_course(user_a, course_a["id"]) is not None


def test_rate_limiter_protection():
    """Verify that rate limiter raises HTTP 429 when max requests exceeded within window."""
    from app.rate_limiter import RateLimiter

    limiter = RateLimiter(max_requests=3, window_seconds=60)
    key = "student-test-key"

    # First 3 requests succeed
    limiter.check(key)
    limiter.check(key)
    limiter.check(key)

    # 4th request must raise 429
    with pytest.raises(HTTPException) as exc_info:
        limiter.check(key)
    assert exc_info.value.status_code == 429
    assert "Rate limit exceeded" in exc_info.value.detail
    assert "Retry-After" in exc_info.value.headers

