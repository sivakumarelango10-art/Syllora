"""Revision planner scheduling and priority engine."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.repositories.academic_repository import get_academic_repository


class RevisionService:
    def __init__(self, repo=None):
        self._repo = repo

    @property
    def repo(self):
        return self._repo or get_academic_repository()

    def generate_revision_plan(
        self, user_id: str, days_ahead: int = 7, daily_study_minutes: int | None = None
    ) -> list[dict[str, Any]]:
        """
        Generate intelligent revision tasks using an algorithmic priority engine:
        - Evaluates:
            1. Open misconceptions (highest priority boost: +2)
            2. Low mastery scores (< 0.50 score: priority 5; < 0.75: priority 4)
            3. Exam date proximity (< 14 days increases daily task frequency)
        """
        topics = self.repo.list_topics(user_id=user_id)
        if not topics:
            return []

        misconceptions = self.repo.list_misconceptions(user_id=user_id, status="open")
        misc_topic_ids = {m["topic_id"]: m["id"] for m in misconceptions}

        existing_tasks = self.repo.list_revision_tasks(user_id=user_id, status="scheduled")
        existing_scheduled_topics = {t["topic_id"] for t in existing_tasks}

        prefs = self.repo.get_study_preferences(user_id=user_id)
        exam_date_str = prefs.get("exam_date")

        exam_urgency_boost = 0
        if exam_date_str:
            try:
                exam_dt = datetime.fromisoformat(exam_date_str.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                days_to_exam = (exam_dt - now).days
                if days_to_exam <= 7:
                    exam_urgency_boost = 2
                elif days_to_exam <= 14:
                    exam_urgency_boost = 1
            except Exception:
                pass

        now = datetime.now(timezone.utc)
        generated_tasks = []

        # Sort topics: first topics with misconceptions, then lowest mastery
        def sort_key(t):
            has_misc = 1 if t["id"] in misc_topic_ids else 0
            mastery = t.get("mastery_score") if t.get("mastery_score") is not None else 0.5
            return (-has_misc, mastery)

        sorted_topics = sorted(topics, key=sort_key)

        day_offset = 0
        for topic in sorted_topics:
            tid = topic["id"]
            if tid in existing_scheduled_topics:
                continue

            mastery = topic.get("mastery_score") if topic.get("mastery_score") is not None else 0.5
            has_misc = tid in misc_topic_ids

            # Compute priority 1-5
            if has_misc:
                base_priority = 5
            elif mastery < 0.4:
                base_priority = 4
            elif mastery < 0.7:
                base_priority = 3
            else:
                base_priority = 2

            final_priority = min(5, base_priority + exam_urgency_boost)

            # Schedule date: distribute tasks across the requested days_ahead
            due_date = now + timedelta(days=day_offset % days_ahead, hours=10)
            due_at_iso = due_date.isoformat(timespec="seconds")

            task = self.repo.create_revision_task(
                user_id=user_id,
                topic_id=tid,
                due_at=due_at_iso,
                priority=final_priority,
                misconception_id=misc_topic_ids.get(tid),
            )
            generated_tasks.append(task)
            day_offset += 1

        return generated_tasks
