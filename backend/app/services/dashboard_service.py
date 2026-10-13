"""Dashboard metrics and aggregate summary service."""
from __future__ import annotations

from typing import Any
from app.rag.store import list_documents
from app.repositories.academic_repository import get_academic_repository


class DashboardService:
    def __init__(self, repo=None):
        self.repo = repo or get_academic_repository()

    def get_summary(self, user_id: str) -> dict[str, Any]:
        """Aggregate real database numbers for the overview dashboard."""
        docs = list_documents(user_id=user_id)
        courses = self.repo.list_courses(user_id=user_id)
        topics = self.repo.list_topics(user_id=user_id)
        misconceptions = self.repo.list_misconceptions(user_id=user_id)
        tasks = self.repo.list_revision_tasks(user_id=user_id)

        total_materials = len(docs)
        indexed_materials = sum(1 for d in docs if d.get("page_count", 0) > 0)
        total_courses = len(courses)
        total_topics = len(topics)

        # Calculate syllabus coverage / mastery percentage
        if total_topics > 0:
            covered_topics = sum(1 for t in topics if (t.get("mastery_score") or 0.0) >= 0.6 or (t.get("evidence_count") or 0) > 0)
            coverage_pct = round((covered_topics / total_topics) * 100.0, 1)
        else:
            coverage_pct = 0.0

        active_misconceptions = sum(1 for m in misconceptions if m.get("status") in ("open", "in_progress"))
        pending_tasks = sum(1 for t in tasks if t.get("status") == "scheduled")

        # Compile recent activity
        activity = []
        for d in docs[:2]:
            activity.append({
                "type": "upload",
                "title": f"Uploaded {d.get('title')}",
                "timestamp": d.get("created_at", ""),
                "detail": f"{d.get('page_count', 0)} pages indexed",
            })
        for m in misconceptions[:2]:
            activity.append({
                "type": "misconception",
                "title": f"Misconception on {m.get('topic_title') or 'Topic'}",
                "timestamp": m.get("created_at", ""),
                "detail": m.get("explanation", "")[:80],
            })
        for t in tasks[:2]:
            activity.append({
                "type": "revision",
                "title": f"Scheduled review: {t.get('topic_title') or 'Topic'}",
                "timestamp": t.get("created_at", ""),
                "detail": f"Priority {t.get('priority', 3)}",
            })

        # Continue learning suggestion
        continue_learning = None
        open_misc = next((m for m in misconceptions if m.get("status") != "resolved"), None)
        if open_misc:
            continue_learning = {
                "topic_id": open_misc.get("topic_id"),
                "topic_title": open_misc.get("topic_title"),
                "prompt": f"Resolve misunderstanding: {open_misc.get('explanation', '')[:100]}",
                "source_doc": docs[0].get("title") if docs else "Study Materials",
            }
        elif topics:
            low_mastery = next((t for t in topics if (t.get("mastery_score") or 0) < 0.6), topics[0])
            continue_learning = {
                "topic_id": low_mastery.get("id"),
                "topic_title": low_mastery.get("title"),
                "prompt": f"Practice self-explanation for {low_mastery.get('title')}",
                "source_doc": docs[0].get("title") if docs else "Course Syllabus",
            }

        return {
            "total_materials": total_materials,
            "indexed_materials": indexed_materials,
            "total_courses": total_courses,
            "total_topics": total_topics,
            "syllabus_coverage_percent": coverage_pct,
            "active_misconceptions": active_misconceptions,
            "pending_revision_tasks": pending_tasks,
            "recent_activity": activity,
            "continue_learning": continue_learning,
        }
