"""SQLite persistence adapter for Syllora."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import numpy as np

from app.db.base import DatabaseAdapter, DEFAULT_DEMO_USER_ID


class SQLiteAdapter(DatabaseAdapter):
    """SQLite implementation matching the existing file-based persistence."""

    def __init__(self, db_path: Path | str) -> None:
        self.db_path = Path(db_path)

    @property
    def provider_name(self) -> str:
        return "sqlite"

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(self.db_path), timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def init_db(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL DEFAULT 'local_user',
                    filename TEXT NOT NULL,
                    title TEXT NOT NULL,
                    storage_filename TEXT NOT NULL,
                    sha256 TEXT NOT NULL UNIQUE,
                    size_bytes INTEGER NOT NULL,
                    page_count INTEGER NOT NULL,
                    chunk_count INTEGER NOT NULL,
                    index_status TEXT NOT NULL DEFAULT 'completed',
                    index_error TEXT,
                    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS document_pages (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    page_number INTEGER NOT NULL,
                    extracted_text TEXT NOT NULL,
                    page_metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    UNIQUE (document_id, page_number)
                );
                CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    page_number INTEGER NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    embedding BLOB NOT NULL,
                    embedding_dim INTEGER NOT NULL,
                    embedding_model TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
                CREATE INDEX IF NOT EXISTS idx_chunks_embedding_model ON chunks(embedding_model);
                CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

                CREATE TABLE IF NOT EXISTS profiles (
                    user_id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL DEFAULT '',
                    phone_number TEXT,
                    avatar_path TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS courses (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    code TEXT NOT NULL DEFAULT '',
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);

                CREATE TABLE IF NOT EXISTS syllabus_topics (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                    parent_topic_id TEXT,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    mastery_score REAL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_topics_course ON syllabus_topics(user_id, course_id);

                CREATE TABLE IF NOT EXISTS topic_evidence (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    topic_id TEXT NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
                    chunk_id TEXT NOT NULL,
                    similarity REAL NOT NULL DEFAULT 0.0,
                    created_at TEXT NOT NULL,
                    UNIQUE (topic_id, chunk_id)
                );
                CREATE INDEX IF NOT EXISTS idx_evidence_topic ON topic_evidence(topic_id);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_evidence_unique ON topic_evidence(topic_id, chunk_id);

                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    course_id TEXT,
                    title TEXT NOT NULL DEFAULT 'New study session',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    model TEXT,
                    evidence_status TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

                CREATE TABLE IF NOT EXISTS answer_citations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
                    chunk_id TEXT NOT NULL,
                    source_label TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS understanding_attempts (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    topic_id TEXT NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
                    explanation TEXT NOT NULL,
                    score INTEGER,
                    rubric TEXT NOT NULL DEFAULT '{}',
                    feedback TEXT NOT NULL DEFAULT '',
                    model TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_attempts_topic ON understanding_attempts(user_id, topic_id);

                CREATE TABLE IF NOT EXISTS misconceptions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    topic_id TEXT NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
                    attempt_id TEXT,
                    student_quote TEXT NOT NULL DEFAULT '',
                    explanation TEXT NOT NULL,
                    corrected_explanation TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'open',
                    created_at TEXT NOT NULL,
                    resolved_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_misconceptions_status ON misconceptions(user_id, status);

                CREATE TABLE IF NOT EXISTS revision_tasks (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    topic_id TEXT NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
                    misconception_id TEXT,
                    due_at TEXT NOT NULL,
                    priority INTEGER NOT NULL DEFAULT 3,
                    status TEXT NOT NULL DEFAULT 'scheduled',
                    completed_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_revision_due ON revision_tasks(user_id, status, due_at);

                CREATE TABLE IF NOT EXISTS study_preferences (
                    user_id TEXT PRIMARY KEY,
                    daily_study_minutes INTEGER NOT NULL DEFAULT 45,
                    exam_date TEXT,
                    preferences TEXT NOT NULL DEFAULT '{}',
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS exam_papers (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    course_id TEXT,
                    title TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    storage_path TEXT NOT NULL,
                    exam_year INTEGER NOT NULL,
                    semester TEXT NOT NULL DEFAULT 'Spring',
                    exam_type TEXT NOT NULL DEFAULT 'End-Semester',
                    page_count INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_exam_papers_user ON exam_papers(user_id);

                CREATE TABLE IF NOT EXISTS exam_questions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    exam_paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
                    question_number TEXT NOT NULL DEFAULT '1',
                    question_text TEXT NOT NULL,
                    marks INTEGER NOT NULL DEFAULT 5,
                    unit_number INTEGER,
                    topic_hint TEXT NOT NULL DEFAULT '',
                    repetition_group_id TEXT,
                    repeat_count INTEGER NOT NULL DEFAULT 1,
                    extraction_confidence REAL NOT NULL DEFAULT 0.95,
                    evidence_status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_exam_questions_user ON exam_questions(user_id, exam_paper_id);

                CREATE TABLE IF NOT EXISTS exam_question_evidence (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
                    chunk_id TEXT NOT NULL,
                    similarity REAL NOT NULL DEFAULT 0.0,
                    created_at TEXT NOT NULL,
                    UNIQUE(question_id, chunk_id)
                );

                CREATE TABLE IF NOT EXISTS answer_evaluations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    question_id TEXT,
                    topic_id TEXT,
                    question_text TEXT NOT NULL,
                    student_answer TEXT NOT NULL,
                    marks_allocated INTEGER NOT NULL DEFAULT 5,
                    score_awarded REAL NOT NULL DEFAULT 0.0,
                    percentage REAL NOT NULL DEFAULT 0.0,
                    rubric_breakdown TEXT NOT NULL DEFAULT '{}',
                    covered_points TEXT NOT NULL DEFAULT '[]',
                    missing_points TEXT NOT NULL DEFAULT '[]',
                    inaccuracies TEXT NOT NULL DEFAULT '[]',
                    feedback TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_answer_evals_user ON answer_evaluations(user_id, created_at);

                CREATE TABLE IF NOT EXISTS claim_verifications (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    message_id TEXT,
                    claim_text TEXT NOT NULL,
                    status TEXT NOT NULL,
                    source_id TEXT NOT NULL DEFAULT 'S1',
                    document_id TEXT,
                    page_number INTEGER,
                    evidence_quote TEXT NOT NULL DEFAULT '',
                    confidence REAL NOT NULL DEFAULT 0.9,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_claim_verif_user ON claim_verifications(user_id);

                CREATE TABLE IF NOT EXISTS practice_attempts (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    question_id TEXT NOT NULL,
                    student_attempt TEXT NOT NULL,
                    hints_used INTEGER NOT NULL DEFAULT 0,
                    score REAL NOT NULL DEFAULT 0.0,
                    status TEXT NOT NULL DEFAULT 'completed',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS figure_assets (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    document_id TEXT NOT NULL,
                    page_number INTEGER NOT NULL,
                    caption TEXT NOT NULL DEFAULT '',
                    storage_path TEXT NOT NULL,
                    relevance_tags TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_figure_assets_user ON figure_assets(user_id, document_id);

                CREATE TABLE IF NOT EXISTS source_conflicts (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    course_id TEXT,
                    concept_title TEXT NOT NULL,
                    doc_a_id TEXT NOT NULL,
                    doc_a_page INTEGER NOT NULL,
                    doc_a_quote TEXT NOT NULL,
                    doc_b_id TEXT NOT NULL,
                    doc_b_page INTEGER NOT NULL,
                    doc_b_quote TEXT NOT NULL,
                    explanation TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'detected',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_source_conflicts_user ON source_conflicts(user_id, status);

                CREATE TABLE IF NOT EXISTS viva_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    course_id TEXT,
                    topic_id TEXT,
                    topic_title TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'in_progress',
                    transcript TEXT NOT NULL DEFAULT '[]',
                    overall_score REAL NOT NULL DEFAULT 0.0,
                    feedback TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_viva_sessions_user ON viva_sessions(user_id);

                CREATE TABLE IF NOT EXISTS course_enrollments (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    course_id TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'student',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE (user_id, course_id)
                );
                CREATE INDEX IF NOT EXISTS idx_course_enrollments_user ON course_enrollments(user_id);
                CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON course_enrollments(course_id, role);

                CREATE TABLE IF NOT EXISTS faculty_questions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    course_id TEXT NOT NULL,
                    question_text TEXT NOT NULL,
                    marks INTEGER NOT NULL DEFAULT 5,
                    unit_number INTEGER NOT NULL DEFAULT 1,
                    bloom_level TEXT NOT NULL DEFAULT 'Understand',
                    difficulty TEXT NOT NULL DEFAULT 'Medium',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_faculty_q_user ON faculty_questions(user_id, course_id);
                """
            )
            # Idempotently ensure phone_number column exists if table was created previously
            try:
                connection.execute("ALTER TABLE profiles ADD COLUMN phone_number TEXT;")
            except Exception:
                pass
            try:
                connection.execute("ALTER TABLE documents ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local_user';")
            except Exception:
                pass

    def document_hash_exists(self, sha256: str, user_id: str | None = None) -> bool:
        with self._connect() as connection:
            if user_id:
                row = connection.execute(
                    "SELECT 1 FROM documents WHERE sha256 = ? AND user_id = ?",
                    (sha256, user_id),
                ).fetchone()
            else:
                row = connection.execute("SELECT 1 FROM documents WHERE sha256 = ?", (sha256,)).fetchone()
            return row is not None

    def insert_document(
        self,
        document: dict[str, Any],
        chunks: list[dict[str, Any]],
        pages: list[dict[str, Any]] | None = None,
        user_id: str | None = None,
    ) -> None:
        status = document.get("index_status") or document.get("status") or "completed"
        error = document.get("index_error") or document.get("error")
        mime_type = document.get("mime_type") or "application/pdf"
        uid = user_id or document.get("user_id") or "local_user"
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO documents
                   (id, user_id, filename, title, storage_filename, sha256, size_bytes, page_count, chunk_count, index_status, index_error, mime_type, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                   user_id=excluded.user_id, filename=excluded.filename, title=excluded.title, storage_filename=excluded.storage_filename,
                   chunk_count=excluded.chunk_count, page_count=excluded.page_count,
                   index_status=excluded.index_status, index_error=excluded.index_error, mime_type=excluded.mime_type""",
                (
                    document["id"],
                    uid,
                    document["filename"],
                    document["title"],
                    document["storage_filename"],
                    document["sha256"],
                    document["size_bytes"],
                    document.get("page_count", 0),
                    len(chunks),
                    status,
                    error,
                    mime_type,
                    document["created_at"],
                ),
            )
            if pages:
                connection.executemany(
                    """INSERT INTO document_pages
                       (id, document_id, page_number, extracted_text, page_metadata, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(document_id, page_number) DO UPDATE SET
                       extracted_text=excluded.extracted_text, page_metadata=excluded.page_metadata""",
                    [
                        (
                            f"{document['id']}_p{p['page_number']}",
                            document["id"],
                            p["page_number"],
                            p.get("extracted_text") or p.get("text", ""),
                            str(p.get("page_metadata") or p.get("metadata") or {}),
                            document["created_at"],
                        )
                        for p in pages
                    ],
                )
            if chunks:
                connection.executemany(
                    """INSERT INTO chunks
                       (id, document_id, page_number, chunk_index, text, embedding, embedding_dim, embedding_model, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET text=excluded.text, embedding=excluded.embedding""",
                    [
                        (
                            chunk["id"],
                            document["id"],
                            chunk["page_number"],
                            chunk["chunk_index"],
                            chunk.get("text") or chunk.get("content", ""),
                            np.asarray(chunk["embedding"], dtype=np.float32).tobytes() if chunk.get("embedding") is not None else b"",
                            len(chunk["embedding"]) if chunk.get("embedding") is not None else 0,
                            chunk.get("embedding_model", "nomic-embed-text"),
                            document["created_at"],
                        )
                        for chunk in chunks
                    ],
                )

    def update_document_status(
        self,
        document_id: str,
        status: str,
        error: str | None = None,
        user_id: str | None = None,
    ) -> None:
        with self._connect() as connection:
            if user_id:
                connection.execute(
                    "UPDATE documents SET index_status = ?, index_error = ? WHERE id = ? AND user_id = ?",
                    (status, error, document_id, user_id),
                )
            else:
                connection.execute(
                    "UPDATE documents SET index_status = ?, index_error = ? WHERE id = ?",
                    (status, error, document_id),
                )

    def get_document_pages(
        self, document_id: str, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        if user_id and self.get_document(document_id, user_id=user_id) is None:
            return []
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT id, document_id, page_number, extracted_text, page_metadata, created_at
                   FROM document_pages WHERE document_id = ? ORDER BY page_number ASC""",
                (document_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_documents(self, user_id: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as connection:
            if user_id:
                rows = connection.execute(
                    """SELECT id, user_id, filename, title, storage_filename, sha256, size_bytes, page_count, chunk_count,
                              index_status, index_error, mime_type, created_at
                       FROM documents WHERE user_id = ? ORDER BY created_at DESC""",
                    (user_id,),
                ).fetchall()
            else:
                rows = connection.execute(
                    """SELECT id, user_id, filename, title, storage_filename, sha256, size_bytes, page_count, chunk_count,
                              index_status, index_error, mime_type, created_at
                       FROM documents ORDER BY created_at DESC"""
                ).fetchall()
        res = []
        for r in rows:
            d = dict(r)
            d["status"] = d.get("index_status", "completed")
            res.append(d)
        return res

    def get_document(self, document_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        with self._connect() as connection:
            if user_id:
                row = connection.execute(
                    """SELECT id, user_id, filename, title, storage_filename, sha256, size_bytes, page_count, chunk_count,
                              index_status, index_error, mime_type, created_at
                       FROM documents WHERE id = ? AND user_id = ?""",
                    (document_id, user_id),
                ).fetchone()
            else:
                row = connection.execute(
                    """SELECT id, user_id, filename, title, storage_filename, sha256, size_bytes, page_count, chunk_count,
                              index_status, index_error, mime_type, created_at
                       FROM documents WHERE id = ?""",
                    (document_id,),
                ).fetchone()
        if not row:
            return None
        res = dict(row)
        res["status"] = res.get("index_status", "completed")
        return res


    def delete_document(self, document_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        with self._connect() as connection:
            if user_id:
                row = connection.execute(
                    "SELECT id, storage_filename FROM documents WHERE id = ? AND user_id = ?",
                    (document_id, user_id),
                ).fetchone()
                if row is None:
                    return None
                storage_filename = row["storage_filename"]
                connection.execute("DELETE FROM documents WHERE id = ? AND user_id = ?", (document_id, user_id))
            else:
                row = connection.execute(
                    "SELECT id, storage_filename FROM documents WHERE id = ?", (document_id,)
                ).fetchone()
                if row is None:
                    return None
                storage_filename = row["storage_filename"]
                connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        return {"id": document_id, "storage_filename": storage_filename}

    def load_search_chunks(
        self, embedding_model: str, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        with self._connect() as connection:
            if user_id:
                rows = connection.execute(
                    """SELECT c.id, c.document_id, c.page_number, c.chunk_index, c.text,
                              c.embedding, c.embedding_dim, c.embedding_model,
                              d.filename, d.title
                       FROM chunks c JOIN documents d ON d.id = c.document_id
                       WHERE c.embedding_model = ? AND d.user_id = ?
                       ORDER BY d.created_at, c.page_number, c.chunk_index""",
                    (embedding_model, user_id),
                ).fetchall()
            else:
                rows = connection.execute(
                    """SELECT c.id, c.document_id, c.page_number, c.chunk_index, c.text,
                              c.embedding, c.embedding_dim, c.embedding_model,
                              d.filename, d.title
                       FROM chunks c JOIN documents d ON d.id = c.document_id
                       WHERE c.embedding_model = ?
                       ORDER BY d.created_at, c.page_number, c.chunk_index""",
                    (embedding_model,),
                ).fetchall()
        return [dict(row) for row in rows]

    def count_chunks(self, user_id: str | None = None) -> int:
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS count FROM chunks").fetchone()
        return int(row["count"]) if row else 0

    def match_chunks_vector(
        self,
        query_embedding: list[float],
        match_count: int = 5,
        user_id: str | None = None,
        course_id: str | None = None,
        document_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        # Compute cosine similarity across loaded chunks in SQLite mode
        chunks = self.load_search_chunks(embedding_model="nomic-embed-text", user_id=user_id)
        if not chunks:
            return []

        doc_set = set(document_ids) if document_ids else None
        q_vec = np.asarray(query_embedding, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 0:
            q_vec /= q_norm

        scored: list[dict[str, Any]] = []
        for c in chunks:
            if doc_set and c["document_id"] not in doc_set:
                continue
            c_vec = np.frombuffer(c["embedding"], dtype=np.float32)
            c_norm = np.linalg.norm(c_vec)
            if c_norm > 0:
                c_vec = c_vec / c_norm
            similarity = float(np.dot(q_vec, c_vec))
            scored.append({
                "chunk_id": c["id"],
                "document_id": c["document_id"],
                "page_number": c["page_number"],
                "chunk_index": c["chunk_index"],
                "content": c["text"],
                "filename": c["filename"],
                "title": c["title"],
                "similarity": similarity,
            })

        scored.sort(key=lambda x: x["similarity"], reverse=True)
        return scored[:match_count]
