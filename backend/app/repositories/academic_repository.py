"""Unified academic repository supporting PostgreSQL and SQLite with tenant isolation."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.db import get_db_adapter
from app.db.base import DatabaseAdapter, DEFAULT_DEMO_USER_ID


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _to_uuid_str(val: Any) -> str:
    if val is None:
        return str(uuid.uuid4())
    try:
        return str(uuid.UUID(str(val)))
    except (ValueError, AttributeError):
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, str(val)))


class AcademicRepository:
    """Repository handling platform entities: courses, topics, chat, understanding, misconceptions, tasks."""

    def __init__(self, adapter: DatabaseAdapter | None = None) -> None:
        self.adapter = adapter or get_db_adapter()

    @property
    def is_postgres(self) -> bool:
        return self.adapter.provider_name == "postgres"

    def _execute_query(self, pg_sql: str, sqlite_sql: str, params: tuple = (), user_id: str | None = None) -> list[dict[str, Any]]:
        """Execute a read query on either PostgreSQL or SQLite and return list of dict rows."""
        if self.is_postgres:
            pg_adapter = self.adapter
            with pg_adapter._connect() as conn:
                with conn.cursor() as cur:
                    target_uid = user_id or (params[0] if params and len(params) > 0 and isinstance(params[0], str) else None)
                    if target_uid:
                        pg_adapter._set_auth_context(cur, _to_uuid_str(target_uid))
                    cur.execute(pg_sql, params)
                    return [dict(r) for r in cur.fetchall()]
        else:
            sqlite_adapter = self.adapter
            with sqlite_adapter._connect() as conn:
                cur = conn.execute(sqlite_sql, params)
                return [dict(r) for r in cur.fetchall()]

    def _execute_single(self, pg_sql: str, sqlite_sql: str, params: tuple = (), user_id: str | None = None) -> dict[str, Any] | None:
        rows = self._execute_query(pg_sql, sqlite_sql, params, user_id=user_id)
        return rows[0] if rows else None

    def _execute_mutate(self, pg_sql: str, sqlite_sql: str, params: tuple = (), user_id: str | None = None) -> None:
        """Execute insert/update/delete query on either PostgreSQL or SQLite."""
        if self.is_postgres:
            pg_adapter = self.adapter
            with pg_adapter._connect() as conn:
                with conn.cursor() as cur:
                    target_uid = user_id or (params[0] if params and len(params) > 0 and isinstance(params[0], str) else None)
                    if target_uid:
                        pg_adapter._set_auth_context(cur, _to_uuid_str(target_uid))
                    cur.execute(pg_sql, params)
                conn.commit()
        else:
            sqlite_adapter = self.adapter
            with sqlite_adapter._connect() as conn:
                conn.execute(sqlite_sql, params)
                conn.commit()

    # -----------------------------------------------------------------------
    # Courses
    # -----------------------------------------------------------------------
    def list_courses(self, user_id: str) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        pg_sql = """
            SELECT c.id, c.user_id, c.code, c.title, c.description, c.created_at, c.updated_at,
                   (SELECT count(*) FROM public.syllabus_topics t WHERE t.course_id = c.id AND t.user_id = c.user_id) as topic_count,
                   (SELECT count(*) FROM public.study_documents d WHERE d.course_id = c.id AND d.user_id = c.user_id) as document_count
            FROM public.courses c
            WHERE c.user_id = %s
            ORDER BY c.created_at DESC;
        """
        sqlite_sql = """
            SELECT c.id, c.user_id, c.code, c.title, c.description, c.created_at, c.updated_at,
                   (SELECT count(*) FROM syllabus_topics t WHERE t.course_id = c.id AND t.user_id = c.user_id) as topic_count,
                   0 as document_count
            FROM courses c
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC;
        """
        return self._execute_query(pg_sql, sqlite_sql, (uid,))

    def get_course(self, user_id: str, course_id: str) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        cid = _to_uuid_str(course_id)
        pg_sql = """
            SELECT c.id, c.user_id, c.code, c.title, c.description, c.created_at, c.updated_at,
                   (SELECT count(*) FROM public.syllabus_topics t WHERE t.course_id = c.id AND t.user_id = c.user_id) as topic_count
            FROM public.courses c
            WHERE c.user_id = %s AND c.id = %s;
        """
        sqlite_sql = """
            SELECT c.id, c.user_id, c.code, c.title, c.description, c.created_at, c.updated_at,
                   (SELECT count(*) FROM syllabus_topics t WHERE t.course_id = c.id AND t.user_id = c.user_id) as topic_count
            FROM courses c
            WHERE c.user_id = ? AND c.id = ?;
        """
        return self._execute_single(pg_sql, sqlite_sql, (uid, cid))

    def create_course(self, user_id: str, title: str, code: str = "", description: str = "") -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        cid = str(uuid.uuid4())
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.courses (id, user_id, code, title, description, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO courses (id, user_id, code, title, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (cid, uid, code, title, description, now, now), user_id=uid)
        return {
            "id": cid,
            "user_id": uid,
            "code": code,
            "title": title,
            "description": description,
            "created_at": now,
            "updated_at": now,
            "topic_count": 0,
            "document_count": 0,
        }

    def delete_course(self, user_id: str, course_id: str) -> bool:
        uid = _to_uuid_str(user_id)
        cid = _to_uuid_str(course_id)
        pg_sql = "DELETE FROM public.courses WHERE user_id = %s AND id = %s;"
        sqlite_sql = "DELETE FROM courses WHERE user_id = ? AND id = ?;"
        self._execute_mutate(pg_sql, sqlite_sql, (uid, cid))
        return True

    # -----------------------------------------------------------------------
    # Syllabus Topics
    # -----------------------------------------------------------------------
    def list_topics(self, user_id: str, course_id: str | None = None) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        if course_id:
            cid = _to_uuid_str(course_id)
            pg_sql = """
                SELECT t.id, t.user_id, t.course_id, t.parent_topic_id, t.title, t.description,
                       t.sort_order, t.mastery_score, t.created_at, t.updated_at,
                       (SELECT count(*) FROM public.topic_evidence e WHERE e.topic_id = t.id AND e.user_id = t.user_id) as evidence_count
                FROM public.syllabus_topics t
                WHERE t.user_id = %s AND t.course_id = %s
                ORDER BY t.sort_order ASC, t.created_at ASC;
            """
            sqlite_sql = """
                SELECT t.id, t.user_id, t.course_id, t.parent_topic_id, t.title, t.description,
                       t.sort_order, t.mastery_score, t.created_at, t.updated_at,
                       (SELECT count(*) FROM topic_evidence e WHERE e.topic_id = t.id AND e.user_id = t.user_id) as evidence_count
                FROM syllabus_topics t
                WHERE t.user_id = ? AND t.course_id = ?
                ORDER BY t.sort_order ASC, t.created_at ASC;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid, cid))
        else:
            pg_sql = """
                SELECT t.id, t.user_id, t.course_id, t.parent_topic_id, t.title, t.description,
                       t.sort_order, t.mastery_score, t.created_at, t.updated_at,
                       (SELECT count(*) FROM public.topic_evidence e WHERE e.topic_id = t.id AND e.user_id = t.user_id) as evidence_count
                FROM public.syllabus_topics t
                WHERE t.user_id = %s
                ORDER BY t.sort_order ASC, t.created_at ASC;
            """
            sqlite_sql = """
                SELECT t.id, t.user_id, t.course_id, t.parent_topic_id, t.title, t.description,
                       t.sort_order, t.mastery_score, t.created_at, t.updated_at,
                       (SELECT count(*) FROM topic_evidence e WHERE e.topic_id = t.id AND e.user_id = t.user_id) as evidence_count
                FROM syllabus_topics t
                WHERE t.user_id = ?
                ORDER BY t.sort_order ASC, t.created_at ASC;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid,))

    def get_topic(self, user_id: str, topic_id: str) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        tid = _to_uuid_str(topic_id)
        pg_sql = """
            SELECT t.id, t.user_id, t.course_id, t.parent_topic_id, t.title, t.description,
                   t.sort_order, t.mastery_score, t.created_at, t.updated_at,
                   (SELECT count(*) FROM public.topic_evidence e WHERE e.topic_id = t.id AND e.user_id = t.user_id) as evidence_count
            FROM public.syllabus_topics t
            WHERE t.user_id = %s AND t.id = %s;
        """
        sqlite_sql = """
            SELECT t.id, t.user_id, t.course_id, t.parent_topic_id, t.title, t.description,
                   t.sort_order, t.mastery_score, t.created_at, t.updated_at,
                   (SELECT count(*) FROM topic_evidence e WHERE e.topic_id = t.id AND e.user_id = t.user_id) as evidence_count
            FROM syllabus_topics t
            WHERE t.user_id = ? AND t.id = ?;
        """
        return self._execute_single(pg_sql, sqlite_sql, (uid, tid))

    def create_topic(
        self,
        user_id: str,
        course_id: str,
        title: str,
        description: str = "",
        parent_topic_id: str | None = None,
        sort_order: int = 0,
        mastery_score: float | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        cid = _to_uuid_str(course_id)
        ptid = _to_uuid_str(parent_topic_id) if parent_topic_id else None
        tid = str(uuid.uuid4())
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.syllabus_topics (id, user_id, course_id, parent_topic_id, title, description, sort_order, mastery_score, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO syllabus_topics (id, user_id, course_id, parent_topic_id, title, description, sort_order, mastery_score, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (tid, uid, cid, ptid, title, description, sort_order, mastery_score, now, now), user_id=uid)
        return {
            "id": tid,
            "user_id": uid,
            "course_id": cid,
            "parent_topic_id": ptid,
            "title": title,
            "description": description,
            "sort_order": sort_order,
            "mastery_score": mastery_score,
            "created_at": now,
            "updated_at": now,
            "evidence_count": 0,
        }

    def update_topic(self, user_id: str, topic_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        tid = _to_uuid_str(topic_id)
        existing = self.get_topic(uid, tid)
        if not existing:
            return None
        title = updates.get("title", existing["title"])
        description = updates.get("description", existing["description"])
        sort_order = updates.get("sort_order", existing["sort_order"])
        mastery_score = updates.get("mastery_score", existing["mastery_score"])
        now = _now_iso()
        pg_sql = """
            UPDATE public.syllabus_topics
            SET title = %s, description = %s, sort_order = %s, mastery_score = %s, updated_at = %s
            WHERE user_id = %s AND id = %s;
        """
        sqlite_sql = """
            UPDATE syllabus_topics
            SET title = ?, description = ?, sort_order = ?, mastery_score = ?, updated_at = ?
            WHERE user_id = ? AND id = ?;
        """
        self._execute_mutate(pg_sql, sqlite_sql, (title, description, sort_order, mastery_score, now, uid, tid), user_id=uid)
        return self.get_topic(uid, tid)

    def delete_topic(self, user_id: str, topic_id: str) -> bool:
        uid = _to_uuid_str(user_id)
        tid = _to_uuid_str(topic_id)
        pg_sql = "DELETE FROM public.syllabus_topics WHERE user_id = %s AND id = %s;"
        sqlite_sql = "DELETE FROM syllabus_topics WHERE user_id = ? AND id = ?;"
        self._execute_mutate(pg_sql, sqlite_sql, (uid, tid))
        return True

    def list_topic_evidence(self, user_id: str, topic_id: str) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        tid = _to_uuid_str(topic_id)
        if self.is_postgres:
            pg_sql = """
                SELECT e.id, e.topic_id, e.chunk_id, e.similarity,
                       d.id as document_id, d.title as document_title, c.page_number, c.content as excerpt
                FROM public.topic_evidence e
                JOIN public.document_chunks c ON c.id = e.chunk_id AND c.user_id = e.user_id
                JOIN public.study_documents d ON d.id = c.document_id AND d.user_id = e.user_id
                WHERE e.user_id = %s AND e.topic_id = %s
                ORDER BY e.similarity DESC;
            """
            return self._execute_query(pg_sql, "", (uid, tid))
        else:
            sqlite_sql = """
                SELECT e.id, e.topic_id, e.chunk_id, e.similarity,
                       d.id as document_id, d.title as document_title, c.page_number, c.text as excerpt
                FROM topic_evidence e
                JOIN chunks c ON c.id = e.chunk_id
                JOIN documents d ON d.id = c.document_id
                WHERE e.user_id = ? AND e.topic_id = ?
                ORDER BY e.similarity DESC;
            """
            return self._execute_query("", sqlite_sql, (uid, tid))

    def link_topic_evidence(self, user_id: str, topic_id: str, chunk_id: str, similarity: float = 0.8) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        tid = _to_uuid_str(topic_id)
        cid = _to_uuid_str(chunk_id)
        eid = str(uuid.uuid4())
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.topic_evidence (id, user_id, topic_id, chunk_id, similarity, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (topic_id, chunk_id) DO UPDATE SET similarity = EXCLUDED.similarity;
        """
        sqlite_sql = """
            INSERT INTO topic_evidence (id, user_id, topic_id, chunk_id, similarity, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (topic_id, chunk_id) DO UPDATE SET similarity = excluded.similarity;
        """
        self._execute_mutate(pg_sql, sqlite_sql, (eid, uid, tid, cid, similarity, now), user_id=uid)
        return {"id": eid, "topic_id": tid, "chunk_id": cid, "similarity": similarity, "created_at": now}

    # -----------------------------------------------------------------------
    # Chat & Conversations
    # -----------------------------------------------------------------------
    def list_chat_sessions(self, user_id: str, course_id: str | None = None) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        if course_id:
            cid = _to_uuid_str(course_id)
            pg_sql = """
                SELECT s.id, s.user_id, s.course_id, s.title, s.created_at, s.updated_at,
                       (SELECT count(*) FROM public.chat_messages m WHERE m.session_id = s.id AND m.user_id = s.user_id) as message_count
                FROM public.chat_sessions s
                WHERE s.user_id = %s AND s.course_id = %s
                ORDER BY s.updated_at DESC;
            """
            sqlite_sql = """
                SELECT s.id, s.user_id, s.course_id, s.title, s.created_at, s.updated_at,
                       (SELECT count(*) FROM chat_messages m WHERE m.session_id = s.id AND m.user_id = s.user_id) as message_count
                FROM chat_sessions s
                WHERE s.user_id = ? AND s.course_id = ?
                ORDER BY s.updated_at DESC;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid, cid))
        else:
            pg_sql = """
                SELECT s.id, s.user_id, s.course_id, s.title, s.created_at, s.updated_at,
                       (SELECT count(*) FROM public.chat_messages m WHERE m.session_id = s.id AND m.user_id = s.user_id) as message_count
                FROM public.chat_sessions s
                WHERE s.user_id = %s
                ORDER BY s.updated_at DESC;
            """
            sqlite_sql = """
                SELECT s.id, s.user_id, s.course_id, s.title, s.created_at, s.updated_at,
                       (SELECT count(*) FROM chat_messages m WHERE m.session_id = s.id AND m.user_id = s.user_id) as message_count
                FROM chat_sessions s
                WHERE s.user_id = ?
                ORDER BY s.updated_at DESC;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid,))

    def get_chat_session(self, user_id: str, session_id: str) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        sid = _to_uuid_str(session_id)
        pg_sql = """
            SELECT s.id, s.user_id, s.course_id, s.title, s.created_at, s.updated_at,
                   (SELECT count(*) FROM public.chat_messages m WHERE m.session_id = s.id AND m.user_id = s.user_id) as message_count
            FROM public.chat_sessions s
            WHERE s.user_id = %s AND s.id = %s;
        """
        sqlite_sql = """
            SELECT s.id, s.user_id, s.course_id, s.title, s.created_at, s.updated_at,
                   (SELECT count(*) FROM chat_messages m WHERE m.session_id = s.id AND m.user_id = s.user_id) as message_count
            FROM chat_sessions s
            WHERE s.user_id = ? AND s.id = ?;
        """
        return self._execute_single(pg_sql, sqlite_sql, (uid, sid))

    def create_chat_session(self, user_id: str, title: str = "New study session", course_id: str | None = None) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        cid = _to_uuid_str(course_id) if course_id else None
        sid = str(uuid.uuid4())
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.chat_sessions (id, user_id, course_id, title, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO chat_sessions (id, user_id, course_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (sid, uid, cid, title, now, now), user_id=uid)
        return {
            "id": sid,
            "user_id": uid,
            "course_id": cid,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "message_count": 0,
        }

    def delete_chat_session(self, user_id: str, session_id: str) -> bool:
        uid = _to_uuid_str(user_id)
        sid = _to_uuid_str(session_id)
        pg_sql = "DELETE FROM public.chat_sessions WHERE user_id = %s AND id = %s;"
        sqlite_sql = "DELETE FROM chat_sessions WHERE user_id = ? AND id = ?;"
        self._execute_mutate(pg_sql, sqlite_sql, (uid, sid))
        return True

    def list_chat_messages(self, user_id: str, session_id: str) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        sid = _to_uuid_str(session_id)
        pg_sql = """
            SELECT m.id, m.session_id, m.role, m.content, m.model, m.evidence_status, m.created_at
            FROM public.chat_messages m
            WHERE m.user_id = %s AND m.session_id = %s
            ORDER BY m.created_at ASC;
        """
        sqlite_sql = """
            SELECT m.id, m.session_id, m.role, m.content, m.model, m.evidence_status, m.created_at
            FROM chat_messages m
            WHERE m.user_id = ? AND m.session_id = ?
            ORDER BY m.created_at ASC;
        """
        messages = self._execute_query(pg_sql, sqlite_sql, (uid, sid))
        # Fetch citations for assistant messages
        for msg in messages:
            msg["citations"] = self._list_message_citations(uid, msg["id"])
        return messages

    def _list_message_citations(self, user_id: str, message_id: str) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        mid = _to_uuid_str(message_id)
        if self.is_postgres:
            pg_sql = """
                SELECT c.id, c.message_id, c.chunk_id, c.source_label,
                       d.id as document_id, d.filename, d.title, ch.page_number, ch.content as excerpt
                FROM public.answer_citations c
                LEFT JOIN public.document_chunks ch ON ch.id = c.chunk_id AND ch.user_id = c.user_id
                LEFT JOIN public.study_documents d ON d.id = ch.document_id AND d.user_id = c.user_id
                WHERE c.user_id = %s AND c.message_id = %s;
            """
            return self._execute_query(pg_sql, "", (uid, mid))
        else:
            sqlite_sql = """
                SELECT c.id, c.message_id, c.chunk_id, c.source_label,
                       d.id as document_id, d.filename, d.title, ch.page_number, ch.text as excerpt
                FROM answer_citations c
                LEFT JOIN chunks ch ON ch.id = c.chunk_id
                LEFT JOIN documents d ON d.id = ch.document_id
                WHERE c.user_id = ? AND c.message_id = ?;
            """
            return self._execute_query("", sqlite_sql, (uid, mid))

    def add_chat_message(
        self,
        user_id: str,
        session_id: str,
        role: str,
        content: str,
        model: str | None = None,
        evidence_status: str | None = None,
        citations: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        sid = _to_uuid_str(session_id)
        mid = str(uuid.uuid4())
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.chat_messages (id, user_id, session_id, role, content, model, evidence_status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO chat_messages (id, user_id, session_id, role, content, model, evidence_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (mid, uid, sid, role, content, model, evidence_status, now), user_id=uid)

        # Insert citations if provided
        saved_citations: list[dict[str, Any]] = []
        if citations:
            for cit in citations:
                chunk_id = cit.get("chunk_id") or cit.get("document_id")
                if not chunk_id:
                    continue
                cid = _to_uuid_str(chunk_id)
                cit_id = str(uuid.uuid4())
                source_label = cit.get("source_id") or cit.get("source_label", "S1")
                cit_pg = """
                    INSERT INTO public.answer_citations (id, user_id, message_id, chunk_id, source_label, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (message_id, chunk_id) DO NOTHING;
                """
                cit_sqlite = """
                    INSERT INTO answer_citations (id, user_id, message_id, chunk_id, source_label, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT (message_id, chunk_id) DO NOTHING;
                """
                try:
                    self._execute_mutate(cit_pg, cit_sqlite, (cit_id, uid, mid, cid, source_label, now), user_id=uid)
                    saved_citations.append(cit)
                except Exception:
                    pass

        # Update session updated_at
        upd_pg = "UPDATE public.chat_sessions SET updated_at = %s WHERE user_id = %s AND id = %s;"
        upd_sqlite = "UPDATE chat_sessions SET updated_at = ? WHERE user_id = ? AND id = ?;"
        self._execute_mutate(upd_pg, upd_sqlite, (now, uid, sid), user_id=uid)

        return {
            "id": mid,
            "session_id": sid,
            "role": role,
            "content": content,
            "model": model,
            "evidence_status": evidence_status,
            "created_at": now,
            "citations": saved_citations,
        }

    # -----------------------------------------------------------------------
    # Understanding Attempts
    # -----------------------------------------------------------------------
    def create_understanding_attempt(
        self,
        user_id: str,
        topic_id: str,
        explanation: str,
        score: int,
        rubric: dict[str, Any],
        feedback: str,
        model: str = "syllora-qwen",
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        tid = _to_uuid_str(topic_id)
        aid = str(uuid.uuid4())
        now = _now_iso()
        rubric_str = json.dumps(rubric)
        pg_sql = """
            INSERT INTO public.understanding_attempts (id, user_id, topic_id, explanation, score, rubric, feedback, model, created_at)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO understanding_attempts (id, user_id, topic_id, explanation, score, rubric, feedback, model, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (aid, uid, tid, explanation, score, rubric_str, feedback, model, now), user_id=uid)

        # Update topic mastery score as running average
        mastery = round(score / 3.0, 3)
        upd_pg = "UPDATE public.syllabus_topics SET mastery_score = %s, updated_at = %s WHERE user_id = %s AND id = %s;"
        upd_sqlite = "UPDATE syllabus_topics SET mastery_score = ?, updated_at = ? WHERE user_id = ? AND id = ?;"
        self._execute_mutate(upd_pg, upd_sqlite, (mastery, now, uid, tid), user_id=uid)

        return {
            "id": aid,
            "topic_id": tid,
            "score": score,
            "rubric": rubric,
            "feedback": feedback,
            "model": model,
            "created_at": now,
        }

    def list_understanding_attempts(self, user_id: str, topic_id: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        if topic_id:
            tid = _to_uuid_str(topic_id)
            pg_sql = """
                SELECT a.id, a.topic_id, t.title as topic_title, a.explanation, a.score, a.rubric, a.feedback, a.model, a.created_at
                FROM public.understanding_attempts a
                JOIN public.syllabus_topics t ON t.id = a.topic_id AND t.user_id = a.user_id
                WHERE a.user_id = %s AND a.topic_id = %s
                ORDER BY a.created_at DESC LIMIT %s;
            """
            sqlite_sql = """
                SELECT a.id, a.topic_id, t.title as topic_title, a.explanation, a.score, a.rubric, a.feedback, a.model, a.created_at
                FROM understanding_attempts a
                JOIN syllabus_topics t ON t.id = a.topic_id AND t.user_id = a.user_id
                WHERE a.user_id = ? AND a.topic_id = ?
                ORDER BY a.created_at DESC LIMIT ?;
            """
            rows = self._execute_query(pg_sql, sqlite_sql, (uid, tid, limit))
        else:
            pg_sql = """
                SELECT a.id, a.topic_id, t.title as topic_title, a.explanation, a.score, a.rubric, a.feedback, a.model, a.created_at
                FROM public.understanding_attempts a
                JOIN public.syllabus_topics t ON t.id = a.topic_id AND t.user_id = a.user_id
                WHERE a.user_id = %s
                ORDER BY a.created_at DESC LIMIT %s;
            """
            sqlite_sql = """
                SELECT a.id, a.topic_id, t.title as topic_title, a.explanation, a.score, a.rubric, a.feedback, a.model, a.created_at
                FROM understanding_attempts a
                JOIN syllabus_topics t ON t.id = a.topic_id AND t.user_id = a.user_id
                WHERE a.user_id = ?
                ORDER BY a.created_at DESC LIMIT ?;
            """
            rows = self._execute_query(pg_sql, sqlite_sql, (uid, limit))

        for r in rows:
            if isinstance(r.get("rubric"), str):
                try:
                    r["rubric"] = json.loads(r["rubric"])
                except Exception:
                    r["rubric"] = {}
        return rows

    # -----------------------------------------------------------------------
    # Misconceptions
    # -----------------------------------------------------------------------
    def list_misconceptions(self, user_id: str, status: str | None = None) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        if status:
            pg_sql = """
                SELECT m.id, m.user_id, m.topic_id, t.title as topic_title, m.attempt_id,
                       m.student_quote, m.explanation, m.corrected_explanation, m.status, m.created_at, m.resolved_at
                FROM public.misconceptions m
                JOIN public.syllabus_topics t ON t.id = m.topic_id AND t.user_id = m.user_id
                WHERE m.user_id = %s AND m.status = %s
                ORDER BY m.created_at DESC;
            """
            sqlite_sql = """
                SELECT m.id, m.user_id, m.topic_id, t.title as topic_title, m.attempt_id,
                       m.student_quote, m.explanation, m.corrected_explanation, m.status, m.created_at, m.resolved_at
                FROM misconceptions m
                JOIN syllabus_topics t ON t.id = m.topic_id AND t.user_id = m.user_id
                WHERE m.user_id = ? AND m.status = ?
                ORDER BY m.created_at DESC;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid, status))
        else:
            pg_sql = """
                SELECT m.id, m.user_id, m.topic_id, t.title as topic_title, m.attempt_id,
                       m.student_quote, m.explanation, m.corrected_explanation, m.status, m.created_at, m.resolved_at
                FROM public.misconceptions m
                JOIN public.syllabus_topics t ON t.id = m.topic_id AND t.user_id = m.user_id
                WHERE m.user_id = %s
                ORDER BY m.created_at DESC;
            """
            sqlite_sql = """
                SELECT m.id, m.user_id, m.topic_id, t.title as topic_title, m.attempt_id,
                       m.student_quote, m.explanation, m.corrected_explanation, m.status, m.created_at, m.resolved_at
                FROM misconceptions m
                JOIN syllabus_topics t ON t.id = m.topic_id AND t.user_id = m.user_id
                WHERE m.user_id = ?
                ORDER BY m.created_at DESC;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid,))

    def create_misconception(
        self,
        user_id: str,
        topic_id: str,
        explanation: str,
        student_quote: str = "",
        corrected_explanation: str = "",
        attempt_id: str | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        tid = _to_uuid_str(topic_id)
        aid = _to_uuid_str(attempt_id) if attempt_id else None
        mid = str(uuid.uuid4())
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.misconceptions (id, user_id, topic_id, attempt_id, student_quote, explanation, corrected_explanation, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'open', %s);
        """
        sqlite_sql = """
            INSERT INTO misconceptions (id, user_id, topic_id, attempt_id, student_quote, explanation, corrected_explanation, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (mid, uid, tid, aid, student_quote, explanation, corrected_explanation, now), user_id=uid)
        return {
            "id": mid,
            "user_id": uid,
            "topic_id": tid,
            "attempt_id": aid,
            "student_quote": student_quote,
            "explanation": explanation,
            "corrected_explanation": corrected_explanation,
            "status": "open",
            "created_at": now,
            "resolved_at": None,
        }

    def update_misconception(self, user_id: str, misconception_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        mid = _to_uuid_str(misconception_id)
        status = updates.get("status")
        corrected_explanation = updates.get("corrected_explanation")
        now = _now_iso()
        resolved_at = now if status == "resolved" else None

        if status and corrected_explanation is not None:
            pg_sql = "UPDATE public.misconceptions SET status = %s, corrected_explanation = %s, resolved_at = %s WHERE user_id = %s AND id = %s;"
            sqlite_sql = "UPDATE misconceptions SET status = ?, corrected_explanation = ?, resolved_at = ? WHERE user_id = ? AND id = ?;"
            self._execute_mutate(pg_sql, sqlite_sql, (status, corrected_explanation, resolved_at, uid, mid), user_id=uid)
        elif status:
            pg_sql = "UPDATE public.misconceptions SET status = %s, resolved_at = %s WHERE user_id = %s AND id = %s;"
            sqlite_sql = "UPDATE misconceptions SET status = ?, resolved_at = ? WHERE user_id = ? AND id = ?;"
            self._execute_mutate(pg_sql, sqlite_sql, (status, resolved_at, uid, mid), user_id=uid)
        elif corrected_explanation is not None:
            pg_sql = "UPDATE public.misconceptions SET corrected_explanation = %s WHERE user_id = %s AND id = %s;"
            sqlite_sql = "UPDATE misconceptions SET corrected_explanation = ? WHERE user_id = ? AND id = ?;"
            self._execute_mutate(pg_sql, sqlite_sql, (corrected_explanation, uid, mid), user_id=uid)

        rows = self.list_misconceptions(uid)
        for r in rows:
            if r["id"] == mid:
                return r
        return None

    def delete_misconception(self, user_id: str, misconception_id: str) -> bool:
        uid = _to_uuid_str(user_id)
        mid = _to_uuid_str(misconception_id)
        pg_sql = "DELETE FROM public.misconceptions WHERE user_id = %s AND id = %s;"
        sqlite_sql = "DELETE FROM misconceptions WHERE user_id = ? AND id = ?;"
        self._execute_mutate(pg_sql, sqlite_sql, (uid, mid))
        return True

    # -----------------------------------------------------------------------
    # Revision Tasks
    # -----------------------------------------------------------------------
    def list_revision_tasks(self, user_id: str, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        if status:
            pg_sql = """
                SELECT r.id, r.user_id, r.topic_id, t.title as topic_title, r.misconception_id,
                       r.due_at, r.priority, r.status, r.completed_at, r.created_at
                FROM public.revision_tasks r
                JOIN public.syllabus_topics t ON t.id = r.topic_id AND t.user_id = r.user_id
                WHERE r.user_id = %s AND r.status = %s
                ORDER BY r.due_at ASC, r.priority DESC LIMIT %s;
            """
            sqlite_sql = """
                SELECT r.id, r.user_id, r.topic_id, t.title as topic_title, r.misconception_id,
                       r.due_at, r.priority, r.status, r.completed_at, r.created_at
                FROM revision_tasks r
                JOIN syllabus_topics t ON t.id = r.topic_id AND t.user_id = r.user_id
                WHERE r.user_id = ? AND r.status = ?
                ORDER BY r.due_at ASC, r.priority DESC LIMIT ?;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid, status, limit))
        else:
            pg_sql = """
                SELECT r.id, r.user_id, r.topic_id, t.title as topic_title, r.misconception_id,
                       r.due_at, r.priority, r.status, r.completed_at, r.created_at
                FROM public.revision_tasks r
                JOIN public.syllabus_topics t ON t.id = r.topic_id AND t.user_id = r.user_id
                WHERE r.user_id = %s
                ORDER BY r.due_at ASC, r.priority DESC LIMIT %s;
            """
            sqlite_sql = """
                SELECT r.id, r.user_id, r.topic_id, t.title as topic_title, r.misconception_id,
                       r.due_at, r.priority, r.status, r.completed_at, r.created_at
                FROM revision_tasks r
                JOIN syllabus_topics t ON t.id = r.topic_id AND t.user_id = r.user_id
                WHERE r.user_id = ?
                ORDER BY r.due_at ASC, r.priority DESC LIMIT ?;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid, limit))

    def create_revision_task(
        self,
        user_id: str,
        topic_id: str,
        due_at: str,
        priority: int = 3,
        misconception_id: str | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        tid = _to_uuid_str(topic_id)
        mid = _to_uuid_str(misconception_id) if misconception_id else None
        rid = str(uuid.uuid4())
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.revision_tasks (id, user_id, topic_id, misconception_id, due_at, priority, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, 'scheduled', %s);
        """
        sqlite_sql = """
            INSERT INTO revision_tasks (id, user_id, topic_id, misconception_id, due_at, priority, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (rid, uid, tid, mid, due_at, priority, now), user_id=uid)
        topic = self.get_topic(uid, tid)
        return {
            "id": rid,
            "user_id": uid,
            "topic_id": tid,
            "topic_title": topic["title"] if topic else None,
            "misconception_id": mid,
            "due_at": due_at,
            "priority": priority,
            "status": "scheduled",
            "completed_at": None,
            "created_at": now,
        }

    def update_revision_task(self, user_id: str, task_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        rid = _to_uuid_str(task_id)
        status = updates.get("status")
        priority = updates.get("priority")
        due_at = updates.get("due_at")
        now = _now_iso()
        completed_at = now if status == "completed" else None

        if status:
            pg_sql = "UPDATE public.revision_tasks SET status = %s, completed_at = %s WHERE user_id = %s AND id = %s;"
            sqlite_sql = "UPDATE revision_tasks SET status = ?, completed_at = ? WHERE user_id = ? AND id = ?;"
            self._execute_mutate(pg_sql, sqlite_sql, (status, completed_at, uid, rid), user_id=uid)
        if priority is not None:
            pg_sql = "UPDATE public.revision_tasks SET priority = %s WHERE user_id = %s AND id = %s;"
            sqlite_sql = "UPDATE revision_tasks SET priority = ? WHERE user_id = ? AND id = ?;"
            self._execute_mutate(pg_sql, sqlite_sql, (priority, uid, rid), user_id=uid)
        if due_at:
            pg_sql = "UPDATE public.revision_tasks SET due_at = %s WHERE user_id = %s AND id = %s;"
            sqlite_sql = "UPDATE revision_tasks SET due_at = ? WHERE user_id = ? AND id = ?;"
            self._execute_mutate(pg_sql, sqlite_sql, (due_at, uid, rid), user_id=uid)

        tasks = self.list_revision_tasks(uid)
        for t in tasks:
            if t["id"] == rid:
                return t
        return None

    def delete_revision_task(self, user_id: str, task_id: str) -> bool:
        uid = _to_uuid_str(user_id)
        rid = _to_uuid_str(task_id)
        pg_sql = "DELETE FROM public.revision_tasks WHERE user_id = %s AND id = %s;"
        sqlite_sql = "DELETE FROM revision_tasks WHERE user_id = ? AND id = ?;"
        self._execute_mutate(pg_sql, sqlite_sql, (uid, rid))
        return True

    # -----------------------------------------------------------------------
    # Preferences & Profile
    # -----------------------------------------------------------------------
    def get_study_preferences(self, user_id: str) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        pg_sql = "SELECT user_id, daily_study_minutes, exam_date, preferences, updated_at FROM public.study_preferences WHERE user_id = %s;"
        sqlite_sql = "SELECT user_id, daily_study_minutes, exam_date, preferences, updated_at FROM study_preferences WHERE user_id = ?;"
        row = self._execute_single(pg_sql, sqlite_sql, (uid,))
        if not row:
            return {
                "user_id": uid,
                "daily_study_minutes": 45,
                "exam_date": None,
                "preferences": {},
                "updated_at": _now_iso(),
            }
        prefs = row.get("preferences", {})
        if isinstance(prefs, str):
            try:
                prefs = json.loads(prefs)
            except Exception:
                prefs = {}
        row["preferences"] = prefs
        return row

    def update_study_preferences(
        self,
        user_id: str,
        daily_study_minutes: int | None = None,
        exam_date: str | None = None,
        preferences: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        curr = self.get_study_preferences(uid)
        daily_mins = daily_study_minutes if daily_study_minutes is not None else curr["daily_study_minutes"]
        exam = exam_date if exam_date is not None else curr["exam_date"]
        pref_obj = preferences if preferences is not None else curr["preferences"]
        pref_str = json.dumps(pref_obj)
        now = _now_iso()

        pg_sql = """
            INSERT INTO public.study_preferences (user_id, daily_study_minutes, exam_date, preferences, updated_at)
            VALUES (%s, %s, %s, %s::jsonb, %s)
            ON CONFLICT (user_id) DO UPDATE
            SET daily_study_minutes = EXCLUDED.daily_study_minutes,
                exam_date = EXCLUDED.exam_date,
                preferences = EXCLUDED.preferences,
                updated_at = EXCLUDED.updated_at;
        """
        sqlite_sql = """
            INSERT INTO study_preferences (user_id, daily_study_minutes, exam_date, preferences, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE
            SET daily_study_minutes = excluded.daily_study_minutes,
                exam_date = excluded.exam_date,
                preferences = excluded.preferences,
                updated_at = excluded.updated_at;
        """
        self._execute_mutate(pg_sql, sqlite_sql, (uid, daily_mins, exam, pref_str, now), user_id=uid)
        return self.get_study_preferences(uid)

    def get_profile(self, user_id: str) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        pg_sql = "SELECT user_id, display_name, avatar_path, created_at, updated_at FROM public.profiles WHERE user_id = %s;"
        sqlite_sql = "SELECT user_id, display_name, avatar_path, created_at, updated_at FROM profiles WHERE user_id = ?;"
        row = self._execute_single(pg_sql, sqlite_sql, (uid,), user_id=uid)
        if not row:
            return {
                "user_id": uid,
                "display_name": "Student",
                "avatar_path": None,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }
        return row

    def update_profile(self, user_id: str, display_name: str | None = None, avatar_path: str | None = None) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        curr = self.get_profile(uid)
        dname = display_name if display_name is not None else curr["display_name"]
        avatar = avatar_path if avatar_path is not None else curr["avatar_path"]
        now = _now_iso()

        pg_sql = """
            INSERT INTO public.profiles (user_id, display_name, avatar_path, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                avatar_path = EXCLUDED.avatar_path,
                updated_at = EXCLUDED.updated_at;
        """
        sqlite_sql = """
            INSERT INTO profiles (user_id, display_name, avatar_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE
            SET display_name = excluded.display_name,
                avatar_path = excluded.avatar_path,
                updated_at = excluded.updated_at;
        """
        self._execute_mutate(pg_sql, sqlite_sql, (uid, dname, avatar, now, now), user_id=uid)
        return self.get_profile(uid)

    # -----------------------------------------------------------------------
    # F1: Exam Papers & Past-Paper Intelligence
    # -----------------------------------------------------------------------
    def list_exam_papers(self, user_id: str, course_id: str | None = None) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        cid = _to_uuid_str(course_id) if course_id else None
        if cid:
            pg_sql = """
                SELECT p.id, p.user_id, p.course_id, p.title, p.filename, p.storage_path,
                       p.exam_year, p.semester, p.exam_type, p.page_count, p.created_at, p.updated_at,
                       (SELECT count(*) FROM public.exam_questions q WHERE q.exam_paper_id = p.id AND q.user_id = p.user_id) as question_count
                FROM public.exam_papers p
                WHERE p.user_id = %s AND p.course_id = %s
                ORDER BY p.exam_year DESC, p.created_at DESC;
            """
            sqlite_sql = """
                SELECT p.id, p.user_id, p.course_id, p.title, p.filename, p.storage_path,
                       p.exam_year, p.semester, p.exam_type, p.page_count, p.created_at, p.updated_at,
                       (SELECT count(*) FROM exam_questions q WHERE q.exam_paper_id = p.id AND q.user_id = p.user_id) as question_count
                FROM exam_papers p
                WHERE p.user_id = ? AND p.course_id = ?
                ORDER BY p.exam_year DESC, p.created_at DESC;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid, cid), user_id=uid)
        else:
            pg_sql = """
                SELECT p.id, p.user_id, p.course_id, p.title, p.filename, p.storage_path,
                       p.exam_year, p.semester, p.exam_type, p.page_count, p.created_at, p.updated_at,
                       (SELECT count(*) FROM public.exam_questions q WHERE q.exam_paper_id = p.id AND q.user_id = p.user_id) as question_count
                FROM public.exam_papers p
                WHERE p.user_id = %s
                ORDER BY p.exam_year DESC, p.created_at DESC;
            """
            sqlite_sql = """
                SELECT p.id, p.user_id, p.course_id, p.title, p.filename, p.storage_path,
                       p.exam_year, p.semester, p.exam_type, p.page_count, p.created_at, p.updated_at,
                       (SELECT count(*) FROM exam_questions q WHERE q.exam_paper_id = p.id AND q.user_id = p.user_id) as question_count
                FROM exam_papers p
                WHERE p.user_id = ?
                ORDER BY p.exam_year DESC, p.created_at DESC;
            """
            return self._execute_query(pg_sql, sqlite_sql, (uid,), user_id=uid)

    def get_exam_paper(self, user_id: str, paper_id: str) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        pid = _to_uuid_str(paper_id)
        pg_sql = """
            SELECT id, user_id, course_id, title, filename, storage_path,
                   exam_year, semester, exam_type, page_count, created_at, updated_at
            FROM public.exam_papers WHERE user_id = %s AND id = %s;
        """
        sqlite_sql = """
            SELECT id, user_id, course_id, title, filename, storage_path,
                   exam_year, semester, exam_type, page_count, created_at, updated_at
            FROM exam_papers WHERE user_id = ? AND id = ?;
        """
        return self._execute_single(pg_sql, sqlite_sql, (uid, pid), user_id=uid)

    def create_exam_paper(
        self,
        user_id: str,
        title: str,
        filename: str,
        storage_path: str,
        exam_year: int,
        semester: str = "Spring",
        exam_type: str = "End-Semester",
        page_count: int = 1,
        course_id: str | None = None,
        paper_id: str | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        pid = _to_uuid_str(paper_id)
        cid = _to_uuid_str(course_id) if course_id else None
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.exam_papers (id, user_id, course_id, title, filename, storage_path, exam_year, semester, exam_type, page_count, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """
        sqlite_sql = """
            INSERT INTO exam_papers (id, user_id, course_id, title, filename, storage_path, exam_year, semester, exam_type, page_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (pid, uid, cid, title, filename, storage_path, exam_year, semester, exam_type, page_count, now, now), user_id=uid)
        return self.get_exam_paper(uid, pid)

    def delete_exam_paper(self, user_id: str, paper_id: str) -> None:
        uid = _to_uuid_str(user_id)
        pid = _to_uuid_str(paper_id)
        pg_sql = "DELETE FROM public.exam_papers WHERE user_id = %s AND id = %s;"
        sqlite_sql = "DELETE FROM exam_papers WHERE user_id = ? AND id = ?;"
        self._execute_mutate(pg_sql, sqlite_sql, (uid, pid), user_id=uid)

    def list_exam_questions(
        self,
        user_id: str,
        paper_id: str | None = None,
        course_id: str | None = None,
        unit_number: int | None = None,
    ) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        pid = _to_uuid_str(paper_id) if paper_id else None
        params: list[Any] = [uid]
        pg_where = ["q.user_id = %s"]
        sqlite_where = ["q.user_id = ?"]

        if pid:
            pg_where.append("q.exam_paper_id = %s")
            sqlite_where.append("q.exam_paper_id = ?")
            params.append(pid)
        if unit_number is not None:
            pg_where.append("q.unit_number = %s")
            sqlite_where.append("q.unit_number = ?")
            params.append(unit_number)

        pg_sql = f"""
            SELECT q.id, q.user_id, q.exam_paper_id, q.question_number, q.question_text,
                   q.marks, q.unit_number, q.topic_hint, q.repetition_group_id, q.repeat_count,
                   q.extraction_confidence, q.evidence_status, q.created_at, q.updated_at,
                   p.title as paper_title, p.exam_year, p.exam_type
            FROM public.exam_questions q
            JOIN public.exam_papers p ON p.id = q.exam_paper_id AND p.user_id = q.user_id
            WHERE {" AND ".join(pg_where)}
            ORDER BY q.created_at ASC;
        """
        sqlite_sql = f"""
            SELECT q.id, q.user_id, q.exam_paper_id, q.question_number, q.question_text,
                   q.marks, q.unit_number, q.topic_hint, q.repetition_group_id, q.repeat_count,
                   q.extraction_confidence, q.evidence_status, q.created_at, q.updated_at,
                   p.title as paper_title, p.exam_year, p.exam_type
            FROM exam_questions q
            JOIN exam_papers p ON p.id = q.exam_paper_id AND p.user_id = q.user_id
            WHERE {" AND ".join(sqlite_where)}
            ORDER BY q.created_at ASC;
        """
        return self._execute_query(pg_sql, sqlite_sql, tuple(params), user_id=uid)

    def get_exam_question(self, user_id: str, question_id: str) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        qid = _to_uuid_str(question_id)
        pg_sql = """
            SELECT q.id, q.user_id, q.exam_paper_id, q.question_number, q.question_text,
                   q.marks, q.unit_number, q.topic_hint, q.repetition_group_id, q.repeat_count,
                   q.extraction_confidence, q.evidence_status, q.created_at, q.updated_at,
                   p.title as paper_title, p.exam_year, p.exam_type
            FROM public.exam_questions q
            JOIN public.exam_papers p ON p.id = q.exam_paper_id AND p.user_id = q.user_id
            WHERE q.user_id = %s AND q.id = %s;
        """
        sqlite_sql = """
            SELECT q.id, q.user_id, q.exam_paper_id, q.question_number, q.question_text,
                   q.marks, q.unit_number, q.topic_hint, q.repetition_group_id, q.repeat_count,
                   q.extraction_confidence, q.evidence_status, q.created_at, q.updated_at,
                   p.title as paper_title, p.exam_year, p.exam_type
            FROM exam_questions q
            JOIN exam_papers p ON p.id = q.exam_paper_id AND p.user_id = q.user_id
            WHERE q.user_id = ? AND q.id = ?;
        """
        return self._execute_single(pg_sql, sqlite_sql, (uid, qid), user_id=uid)

    def create_exam_question(
        self,
        user_id: str,
        exam_paper_id: str,
        question_number: str,
        question_text: str,
        marks: int = 5,
        unit_number: int | None = None,
        topic_hint: str = "",
        repetition_group_id: str | None = None,
        repeat_count: int = 1,
        extraction_confidence: float = 0.95,
        question_id: str | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        qid = _to_uuid_str(question_id)
        pid = _to_uuid_str(exam_paper_id)
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.exam_questions (id, user_id, exam_paper_id, question_number, question_text, marks, unit_number, topic_hint, repetition_group_id, repeat_count, extraction_confidence, evidence_status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s);
        """
        sqlite_sql = """
            INSERT INTO exam_questions (id, user_id, exam_paper_id, question_number, question_text, marks, unit_number, topic_hint, repetition_group_id, repeat_count, extraction_confidence, evidence_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (qid, uid, pid, question_number, question_text, marks, unit_number, topic_hint, repetition_group_id, repeat_count, extraction_confidence, now, now), user_id=uid)
        return self.get_exam_question(uid, qid)

    def update_exam_question(
        self,
        user_id: str,
        question_id: str,
        question_text: str | None = None,
        marks: int | None = None,
        unit_number: int | None = None,
        topic_hint: str | None = None,
        evidence_status: str | None = None,
        repeat_count: int | None = None,
    ) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        qid = _to_uuid_str(question_id)
        curr = self.get_exam_question(uid, qid)
        if not curr:
            return None
        q_text = question_text if question_text is not None else curr["question_text"]
        q_marks = marks if marks is not None else curr["marks"]
        q_unit = unit_number if unit_number is not None else curr["unit_number"]
        q_hint = topic_hint if topic_hint is not None else curr["topic_hint"]
        q_status = evidence_status if evidence_status is not None else curr["evidence_status"]
        q_repeat = repeat_count if repeat_count is not None else curr["repeat_count"]
        now = _now_iso()

        pg_sql = """
            UPDATE public.exam_questions
            SET question_text = %s, marks = %s, unit_number = %s, topic_hint = %s, evidence_status = %s, repeat_count = %s, updated_at = %s
            WHERE user_id = %s AND id = %s;
        """
        sqlite_sql = """
            UPDATE exam_questions
            SET question_text = ?, marks = ?, unit_number = ?, topic_hint = ?, evidence_status = ?, repeat_count = ?, updated_at = ?
            WHERE user_id = ? AND id = ?;
        """
        self._execute_mutate(pg_sql, sqlite_sql, (q_text, q_marks, q_unit, q_hint, q_status, q_repeat, now, uid, qid), user_id=uid)
        return self.get_exam_question(uid, qid)

    def link_question_evidence(self, user_id: str, question_id: str, chunk_id: str, similarity: float) -> None:
        uid = _to_uuid_str(user_id)
        qid = _to_uuid_str(question_id)
        cid = _to_uuid_str(chunk_id)
        eid = str(uuid.uuid4())
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.exam_question_evidence (id, user_id, question_id, chunk_id, similarity, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (question_id, chunk_id) DO UPDATE SET similarity = EXCLUDED.similarity;
        """
        sqlite_sql = """
            INSERT INTO exam_question_evidence (id, user_id, question_id, chunk_id, similarity, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (question_id, chunk_id) DO UPDATE SET similarity = excluded.similarity;
        """
        self._execute_mutate(pg_sql, sqlite_sql, (eid, uid, qid, cid, similarity, now), user_id=uid)

    def get_question_evidence(self, user_id: str, question_id: str) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        qid = _to_uuid_str(question_id)
        pg_sql = """
            SELECT e.chunk_id, e.similarity, c.page_number, c.chunk_index, c.content, d.title as document_title, d.filename
            FROM public.exam_question_evidence e
            JOIN public.document_chunks c ON c.id = e.chunk_id AND c.user_id = e.user_id
            JOIN public.study_documents d ON d.id = c.document_id AND d.user_id = e.user_id
            WHERE e.user_id = %s AND e.question_id = %s
            ORDER BY e.similarity DESC;
        """
        sqlite_sql = """
            SELECT e.chunk_id, e.similarity, c.page_number, c.chunk_index, c.text as content, d.title as document_title, d.filename
            FROM exam_question_evidence e
            JOIN chunks c ON c.id = e.chunk_id
            JOIN documents d ON d.id = c.document_id
            WHERE e.user_id = ? AND e.question_id = ?
            ORDER BY e.similarity DESC;
        """
        return self._execute_query(pg_sql, sqlite_sql, (uid, qid), user_id=uid)

    def get_exam_analytics(self, user_id: str, course_id: str | None = None) -> dict[str, Any]:
        """Calculates repetition trends, topic heatmap, and marks breakdown across uploaded PYQs."""
        questions = self.list_exam_questions(user_id, course_id=course_id)
        papers = self.list_exam_papers(user_id, course_id=course_id)

        total_papers = len(papers)
        total_questions = len(questions)

        # Repetition breakdown
        repeated_questions = [q for q in questions if q.get("repeat_count", 1) > 1]
        repeated_questions.sort(key=lambda x: x.get("repeat_count", 1), reverse=True)

        # Unit Heatmap
        unit_counts: dict[int, int] = {}
        marks_distribution: dict[str, int] = {"1-3 Marks": 0, "5 Marks": 0, "10 Marks": 0, "15+ Marks": 0}
        topics_frequency: dict[str, int] = {}

        for q in questions:
            unit = q.get("unit_number") or 1
            unit_counts[unit] = unit_counts.get(unit, 0) + 1

            m = q.get("marks", 5)
            if m <= 3:
                marks_distribution["1-3 Marks"] += 1
            elif m <= 8:
                marks_distribution["5 Marks"] += 1
            elif m <= 12:
                marks_distribution["10 Marks"] += 1
            else:
                marks_distribution["15+ Marks"] += 1

            thint = (q.get("topic_hint") or "").strip()
            if thint:
                topics_frequency[thint] = topics_frequency.get(thint, 0) + 1

        top_topics = sorted(
            [{"topic": k, "frequency": v} for k, v in topics_frequency.items()],
            key=lambda x: x["frequency"],
            reverse=True,
        )[:8]

        unit_breakdown = [
            {"unit": u, "count": unit_counts[u], "percentage": round((unit_counts[u] / total_questions * 100), 1) if total_questions else 0}
            for u in sorted(unit_counts.keys())
        ]

        supported_count = len([q for q in questions if q.get("evidence_status") in ("supported", "partial")])
        notes_coverage = round((supported_count / total_questions * 100), 1) if total_questions else 0.0

        return {
            "total_papers": total_papers,
            "total_questions": total_questions,
            "repeated_questions_count": len(repeated_questions),
            "notes_coverage_percentage": notes_coverage,
            "unit_heatmap": unit_breakdown,
            "marks_distribution": marks_distribution,
            "top_recurring_topics": top_topics,
            "high_frequency_questions": repeated_questions[:5],
        }

    # -----------------------------------------------------------------------
    # F3: Answer Evaluations
    # -----------------------------------------------------------------------
    def save_answer_evaluation(
        self,
        user_id: str,
        question_text: str,
        student_answer: str,
        marks_allocated: int,
        score_awarded: float,
        percentage: float,
        rubric_breakdown: dict[str, Any],
        covered_points: list[str],
        missing_points: list[str],
        inaccuracies: list[str],
        feedback: str,
        question_id: str | None = None,
        topic_id: str | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        eid = str(uuid.uuid4())
        qid = _to_uuid_str(question_id) if question_id else None
        tid = _to_uuid_str(topic_id) if topic_id else None
        now = _now_iso()

        rubric_json = json.dumps(rubric_breakdown)
        cov_json = json.dumps(covered_points)
        mis_json = json.dumps(missing_points)
        inac_json = json.dumps(inaccuracies)

        pg_sql = """
            INSERT INTO public.answer_evaluations (id, user_id, question_id, topic_id, question_text, student_answer, marks_allocated, score_awarded, percentage, rubric_breakdown, covered_points, missing_points, inaccuracies, feedback, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO answer_evaluations (id, user_id, question_id, topic_id, question_text, student_answer, marks_allocated, score_awarded, percentage, rubric_breakdown, covered_points, missing_points, inaccuracies, feedback, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (eid, uid, qid, tid, question_text, student_answer, marks_allocated, score_awarded, percentage, rubric_json, cov_json, mis_json, inac_json, feedback, now), user_id=uid)
        return {
            "id": eid,
            "user_id": uid,
            "question_id": qid,
            "topic_id": tid,
            "question_text": question_text,
            "student_answer": student_answer,
            "marks_allocated": marks_allocated,
            "score_awarded": score_awarded,
            "percentage": percentage,
            "rubric_breakdown": rubric_breakdown,
            "covered_points": covered_points,
            "missing_points": missing_points,
            "inaccuracies": inaccuracies,
            "feedback": feedback,
            "created_at": now,
        }

    def list_answer_evaluations(self, user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        pg_sql = """
            SELECT id, user_id, question_id, topic_id, question_text, student_answer, marks_allocated,
                   score_awarded, percentage, rubric_breakdown, covered_points, missing_points, inaccuracies, feedback, created_at
            FROM public.answer_evaluations
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s;
        """
        sqlite_sql = """
            SELECT id, user_id, question_id, topic_id, question_text, student_answer, marks_allocated,
                   score_awarded, percentage, rubric_breakdown, covered_points, missing_points, inaccuracies, feedback, created_at
            FROM answer_evaluations
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?;
        """
        rows = self._execute_query(pg_sql, sqlite_sql, (uid, limit), user_id=uid)
        for r in rows:
            for key in ("rubric_breakdown", "covered_points", "missing_points", "inaccuracies"):
                if isinstance(r.get(key), str):
                    try:
                        r[key] = json.loads(r[key])
                    except Exception:
                        pass
        return rows

    # -----------------------------------------------------------------------
    # F4: Claim Verifications (Proof Mode)
    # -----------------------------------------------------------------------
    def save_claim_verification(
        self,
        user_id: str,
        claim_text: str,
        status: str,
        source_id: str = "S1",
        message_id: str | None = None,
        document_id: str | None = None,
        page_number: int | None = None,
        evidence_quote: str = "",
        confidence: float = 0.9,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        cid = str(uuid.uuid4())
        mid = _to_uuid_str(message_id) if message_id else None
        did = _to_uuid_str(document_id) if document_id else None
        now = _now_iso()

        pg_sql = """
            INSERT INTO public.claim_verifications (id, user_id, message_id, claim_text, status, source_id, document_id, page_number, evidence_quote, confidence, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO claim_verifications (id, user_id, message_id, claim_text, status, source_id, document_id, page_number, evidence_quote, confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (cid, uid, mid, claim_text, status, source_id, did, page_number, evidence_quote, confidence, now), user_id=uid)
        return {
            "id": cid,
            "claim_text": claim_text,
            "status": status,
            "source_id": source_id,
            "document_id": did,
            "page_number": page_number,
            "evidence_quote": evidence_quote,
            "confidence": confidence,
            "created_at": now,
        }

    # -----------------------------------------------------------------------
    # F5: Practice Attempts
    # -----------------------------------------------------------------------
    def save_practice_attempt(
        self,
        user_id: str,
        question_id: str,
        student_attempt: str,
        hints_used: int = 0,
        score: float = 0.0,
        status: str = "completed",
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        aid = str(uuid.uuid4())
        qid = _to_uuid_str(question_id)
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.practice_attempts (id, user_id, question_id, student_attempt, hints_used, score, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO practice_attempts (id, user_id, question_id, student_attempt, hints_used, score, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (aid, uid, qid, student_attempt, hints_used, score, status, now), user_id=uid)
        return {"id": aid, "question_id": qid, "score": score, "status": status, "created_at": now}

    # -----------------------------------------------------------------------
    # F11: Figure Assets (Diagram Retrieval)
    # -----------------------------------------------------------------------
    def save_figure_asset(
        self,
        user_id: str,
        document_id: str,
        page_number: int,
        caption: str,
        storage_path: str,
        relevance_tags: str = "",
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        fid = str(uuid.uuid4())
        did = _to_uuid_str(document_id)
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.figure_assets (id, user_id, document_id, page_number, caption, storage_path, relevance_tags, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO figure_assets (id, user_id, document_id, page_number, caption, storage_path, relevance_tags, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (fid, uid, did, page_number, caption, storage_path, relevance_tags, now), user_id=uid)
        return {"id": fid, "document_id": did, "page_number": page_number, "caption": caption, "storage_path": storage_path, "created_at": now}

    def list_figure_assets(self, user_id: str, document_id: str | None = None) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        if document_id:
            did = _to_uuid_str(document_id)
            pg_sql = "SELECT id, user_id, document_id, page_number, caption, storage_path, relevance_tags, created_at FROM public.figure_assets WHERE user_id = %s AND document_id = %s ORDER BY page_number ASC;"
            sqlite_sql = "SELECT id, user_id, document_id, page_number, caption, storage_path, relevance_tags, created_at FROM figure_assets WHERE user_id = ? AND document_id = ? ORDER BY page_number ASC;"
            return self._execute_query(pg_sql, sqlite_sql, (uid, did), user_id=uid)
        else:
            pg_sql = "SELECT id, user_id, document_id, page_number, caption, storage_path, relevance_tags, created_at FROM public.figure_assets WHERE user_id = %s ORDER BY created_at DESC;"
            sqlite_sql = "SELECT id, user_id, document_id, page_number, caption, storage_path, relevance_tags, created_at FROM figure_assets WHERE user_id = ? ORDER BY created_at DESC;"
            return self._execute_query(pg_sql, sqlite_sql, (uid,), user_id=uid)

    # -----------------------------------------------------------------------
    # F12: Source Conflicts
    # -----------------------------------------------------------------------
    def list_conflicts(self, user_id: str, course_id: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        cid = _to_uuid_str(course_id) if course_id else None
        params: list[Any] = [uid]
        pg_where = ["user_id = %s"]
        sqlite_where = ["user_id = ?"]
        if cid:
            pg_where.append("course_id = %s")
            sqlite_where.append("course_id = ?")
            params.append(cid)
        if status:
            pg_where.append("status = %s")
            sqlite_where.append("status = ?")
            params.append(status)

        pg_sql = f"SELECT id, user_id, course_id, concept_title, doc_a_id, doc_a_page, doc_a_quote, doc_b_id, doc_b_page, doc_b_quote, explanation, status, created_at, updated_at FROM public.source_conflicts WHERE {' AND '.join(pg_where)} ORDER BY created_at DESC;"
        sqlite_sql = f"SELECT id, user_id, course_id, concept_title, doc_a_id, doc_a_page, doc_a_quote, doc_b_id, doc_b_page, doc_b_quote, explanation, status, created_at, updated_at FROM source_conflicts WHERE {' AND '.join(sqlite_where)} ORDER BY created_at DESC;"
        return self._execute_query(pg_sql, sqlite_sql, tuple(params), user_id=uid)

    def create_conflict(
        self,
        user_id: str,
        concept_title: str,
        doc_a_id: str,
        doc_a_page: int,
        doc_a_quote: str,
        doc_b_id: str,
        doc_b_page: int,
        doc_b_quote: str,
        explanation: str = "",
        course_id: str | None = None,
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        cid = str(uuid.uuid4())
        course = _to_uuid_str(course_id) if course_id else None
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.source_conflicts (id, user_id, course_id, concept_title, doc_a_id, doc_a_page, doc_a_quote, doc_b_id, doc_b_page, doc_b_quote, explanation, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'detected', %s, %s);
        """
        sqlite_sql = """
            INSERT INTO source_conflicts (id, user_id, course_id, concept_title, doc_a_id, doc_a_page, doc_a_quote, doc_b_id, doc_b_page, doc_b_quote, explanation, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'detected', ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (cid, uid, course, concept_title, doc_a_id, doc_a_page, doc_a_quote, doc_b_id, doc_b_page, doc_b_quote, explanation, now, now), user_id=uid)
        return {"id": cid, "concept_title": concept_title, "status": "detected", "explanation": explanation}

    def update_conflict_status(self, user_id: str, conflict_id: str, status: str) -> None:
        uid = _to_uuid_str(user_id)
        cid = _to_uuid_str(conflict_id)
        now = _now_iso()
        pg_sql = "UPDATE public.source_conflicts SET status = %s, updated_at = %s WHERE user_id = %s AND id = %s;"
        sqlite_sql = "UPDATE source_conflicts SET status = ?, updated_at = ? WHERE user_id = ? AND id = ?;"
        self._execute_mutate(pg_sql, sqlite_sql, (status, now, uid, cid), user_id=uid)

    # -----------------------------------------------------------------------
    # F13: Viva Simulator
    # -----------------------------------------------------------------------
    def create_viva_session(self, user_id: str, topic_title: str, course_id: str | None = None, topic_id: str | None = None) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        sid = str(uuid.uuid4())
        cid = _to_uuid_str(course_id) if course_id else None
        tid = _to_uuid_str(topic_id) if topic_id else None
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.viva_sessions (id, user_id, course_id, topic_id, topic_title, status, transcript, overall_score, feedback, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, 'in_progress', '[]', 0.0, '', %s, %s);
        """
        sqlite_sql = """
            INSERT INTO viva_sessions (id, user_id, course_id, topic_id, topic_title, status, transcript, overall_score, feedback, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'in_progress', '[]', 0.0, '', ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (sid, uid, cid, tid, topic_title, now, now), user_id=uid)
        return {"id": sid, "topic_title": topic_title, "status": "in_progress", "transcript": [], "created_at": now}

    def update_viva_session(
        self,
        user_id: str,
        session_id: str,
        transcript: list[dict[str, Any]],
        overall_score: float = 0.0,
        feedback: str = "",
        status: str = "completed",
    ) -> None:
        uid = _to_uuid_str(user_id)
        sid = _to_uuid_str(session_id)
        now = _now_iso()
        t_json = json.dumps(transcript)
        pg_sql = """
            UPDATE public.viva_sessions
            SET transcript = %s, overall_score = %s, feedback = %s, status = %s, updated_at = %s
            WHERE user_id = %s AND id = %s;
        """
        sqlite_sql = """
            UPDATE viva_sessions
            SET transcript = ?, overall_score = ?, feedback = ?, status = ?, updated_at = ?
            WHERE user_id = ? AND id = ?;
        """
        self._execute_mutate(pg_sql, sqlite_sql, (t_json, overall_score, feedback, status, now, uid, sid), user_id=uid)

    def list_viva_sessions(self, user_id: str, limit: int = 10) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        pg_sql = "SELECT id, user_id, course_id, topic_id, topic_title, status, transcript, overall_score, feedback, created_at, updated_at FROM public.viva_sessions WHERE user_id = %s ORDER BY created_at DESC LIMIT %s;"
        sqlite_sql = "SELECT id, user_id, course_id, topic_id, topic_title, status, transcript, overall_score, feedback, created_at, updated_at FROM viva_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?;"
        rows = self._execute_query(pg_sql, sqlite_sql, (uid, limit), user_id=uid)
        for r in rows:
            if isinstance(r.get("transcript"), str):
                try:
                    r["transcript"] = json.loads(r["transcript"])
                except Exception:
                    pass
        return rows

    def get_viva_session(self, user_id: str, session_id: str) -> dict[str, Any] | None:
        uid = _to_uuid_str(user_id)
        sid = _to_uuid_str(session_id)
        pg_sql = "SELECT id, user_id, course_id, topic_id, topic_title, status, transcript, overall_score, feedback, created_at, updated_at FROM public.viva_sessions WHERE user_id = %s AND id = %s;"
        sqlite_sql = "SELECT id, user_id, course_id, topic_id, topic_title, status, transcript, overall_score, feedback, created_at, updated_at FROM viva_sessions WHERE user_id = ? AND id = ?;"
        row = self._execute_single(pg_sql, sqlite_sql, (uid, sid), user_id=uid)
        if row and isinstance(row.get("transcript"), str):
            try:
                row["transcript"] = json.loads(row["transcript"])
            except Exception:
                pass
        return row

    # -----------------------------------------------------------------------
    # F14: Faculty Questions & Blueprints
    # -----------------------------------------------------------------------
    def list_faculty_questions(self, user_id: str, course_id: str | None = None) -> list[dict[str, Any]]:
        uid = _to_uuid_str(user_id)
        if course_id:
            cid = _to_uuid_str(course_id)
            pg_sql = "SELECT id, user_id, course_id, question_text, marks, unit_number, bloom_level, difficulty, created_at, updated_at FROM public.faculty_questions WHERE user_id = %s AND course_id = %s ORDER BY unit_number, marks;"
            sqlite_sql = "SELECT id, user_id, course_id, question_text, marks, unit_number, bloom_level, difficulty, created_at, updated_at FROM faculty_questions WHERE user_id = ? AND course_id = ? ORDER BY unit_number, marks;"
            return self._execute_query(pg_sql, sqlite_sql, (uid, cid), user_id=uid)
        else:
            pg_sql = "SELECT id, user_id, course_id, question_text, marks, unit_number, bloom_level, difficulty, created_at, updated_at FROM public.faculty_questions WHERE user_id = %s ORDER BY created_at DESC;"
            sqlite_sql = "SELECT id, user_id, course_id, question_text, marks, unit_number, bloom_level, difficulty, created_at, updated_at FROM faculty_questions WHERE user_id = ? ORDER BY created_at DESC;"
            return self._execute_query(pg_sql, sqlite_sql, (uid,), user_id=uid)

    def create_faculty_question(
        self,
        user_id: str,
        course_id: str,
        question_text: str,
        marks: int = 5,
        unit_number: int = 1,
        bloom_level: str = "Understand",
        difficulty: str = "Medium",
    ) -> dict[str, Any]:
        uid = _to_uuid_str(user_id)
        qid = str(uuid.uuid4())
        cid = _to_uuid_str(course_id)
        now = _now_iso()
        pg_sql = """
            INSERT INTO public.faculty_questions (id, user_id, course_id, question_text, marks, unit_number, bloom_level, difficulty, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
        """
        sqlite_sql = """
            INSERT INTO faculty_questions (id, user_id, course_id, question_text, marks, unit_number, bloom_level, difficulty, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        self._execute_mutate(pg_sql, sqlite_sql, (qid, uid, cid, question_text, marks, unit_number, bloom_level, difficulty, now, now), user_id=uid)
        return {
            "id": qid,
            "course_id": cid,
            "question_text": question_text,
            "marks": marks,
            "unit_number": unit_number,
            "bloom_level": bloom_level,
            "difficulty": difficulty,
            "created_at": now,
        }

    def get_faculty_course_analytics(self, user_id: str, course_id: str) -> dict[str, Any]:
        """Provides aggregate misconception counts and topic performance without leaking individual student records."""
        uid = _to_uuid_str(user_id)
        cid = _to_uuid_str(course_id)
        pg_sql = """
            SELECT t.id as topic_id, t.title as topic_title, t.sort_order as unit_number,
                   count(m.id) as misconception_count,
                   count(a.id) as total_attempts
            FROM public.syllabus_topics t
            LEFT JOIN public.misconceptions m ON m.topic_id = t.id
            LEFT JOIN public.understanding_attempts a ON a.topic_id = t.id
            WHERE t.course_id = %s
            GROUP BY t.id, t.title, t.sort_order
            ORDER BY misconception_count DESC;
        """
        sqlite_sql = """
            SELECT t.id as topic_id, t.title as topic_title, t.sort_order as unit_number,
                   count(m.id) as misconception_count,
                   count(a.id) as total_attempts
            FROM syllabus_topics t
            LEFT JOIN misconceptions m ON m.topic_id = t.id
            LEFT JOIN understanding_attempts a ON a.topic_id = t.id
            WHERE t.course_id = ?
            GROUP BY t.id, t.title, t.sort_order
            ORDER BY misconception_count DESC;
        """
        topics_data = self._execute_query(pg_sql, sqlite_sql, (cid,), user_id=uid)
        return {
            "course_id": cid,
            "topic_analytics": topics_data,
            "total_topics": len(topics_data),
            "high_struggle_topics": [t for t in topics_data if t.get("misconception_count", 0) > 0],
        }


_ACADEMIC_REPO = None


def get_academic_repository() -> AcademicRepository:
    global _ACADEMIC_REPO
    if _ACADEMIC_REPO is None:
        _ACADEMIC_REPO = AcademicRepository()
    return _ACADEMIC_REPO
