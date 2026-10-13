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


_ACADEMIC_REPO = None


def get_academic_repository() -> AcademicRepository:
    global _ACADEMIC_REPO
    if _ACADEMIC_REPO is None:
        _ACADEMIC_REPO = AcademicRepository()
    return _ACADEMIC_REPO
