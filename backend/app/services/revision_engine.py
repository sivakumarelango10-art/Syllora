"""Exam-Date Revision Engine & Advanced Syllabus Coverage (F9 & F10): Spaced-repetition scheduling and PYQ priority mapping."""
from __future__ import annotations

from datetime import datetime, date, timedelta, timezone
from typing import Any

from app.repositories.academic_repository import get_academic_repository


class RevisionEngine:
    def __init__(self) -> None:
        self.repo = get_academic_repository()

    def get_advanced_syllabus_coverage(self, user_id: str, course_id: str) -> dict[str, Any]:
        """Combines notes evidence coverage, past-paper PYQ frequency, and mastery scores for course topics."""
        topics = self.repo.list_topics(user_id=user_id, course_id=course_id)
        questions = self.repo.list_exam_questions(user_id=user_id, course_id=course_id)

        # Count questions mapped to each unit
        unit_pyq_map: dict[int, int] = {}
        for q in questions:
            u = q.get("unit_number", 1) or 1
            unit_pyq_map[u] = unit_pyq_map.get(u, 0) + 1

        topic_coverage_list: list[dict[str, Any]] = []
        critical_blindspots: list[dict[str, Any]] = []

        for t in topics:
            tid = t["id"]
            evidence = self.repo.list_topic_evidence(user_id=user_id, topic_id=tid)
            notes_chunks_count = len(evidence)

            # Simulated or actual mastery from understanding attempts
            attempts = self.repo.list_understanding_attempts(user_id=user_id, topic_id=tid)
            mastery = 0.0
            if attempts:
                mastery = round(sum([a.get("score", 1) for a in attempts]) / (len(attempts) * 3.0), 2)
            elif t.get("mastery_score") is not None:
                mastery = float(t["mastery_score"])

            sort_order = t.get("sort_order", 1) or 1
            pyq_count = unit_pyq_map.get(sort_order, 0)

            # Coverage score: has evidence in notes
            has_notes = notes_chunks_count > 0
            coverage_score = 1.0 if has_notes else 0.0

            # Priority calculation: high PYQ + low notes or low mastery = high priority
            priority_score = (0.5 * min(1.0, pyq_count / 3.0)) + (0.3 * (1.0 - coverage_score)) + (0.2 * (1.0 - mastery))

            priority_level = "low"
            if priority_score >= 0.65:
                priority_level = "critical"
            elif priority_score >= 0.45:
                priority_level = "high"
            elif priority_score >= 0.25:
                priority_level = "medium"

            item = {
                "id": tid,
                "title": t["title"],
                "unit_number": sort_order,
                "has_notes": has_notes,
                "notes_chunks_count": notes_chunks_count,
                "pyq_count": pyq_count,
                "mastery_score": mastery,
                "priority_score": round(priority_score, 2),
                "priority_level": priority_level,
            }
            topic_coverage_list.append(item)

            if pyq_count >= 2 and not has_notes:
                critical_blindspots.append(item)

        return {
            "course_id": course_id,
            "topics_count": len(topics),
            "topics": topic_coverage_list,
            "critical_blindspots": critical_blindspots,
        }

    def generate_exam_revision_plan(
        self,
        user_id: str,
        exam_date_str: str,
        daily_minutes: int = 45,
        course_id: str | None = None,
    ) -> dict[str, Any]:
        """Generates deterministic spaced-repetition plan fitted to daily time budget before exam date."""
        try:
            target_date = datetime.strptime(exam_date_str, "%Y-%m-%d").date()
        except ValueError:
            target_date = date.today() + timedelta(days=14)

        today = date.today()
        days_remaining = max(1, (target_date - today).days)

        # Update user study preferences
        self.repo.update_study_preferences(user_id=user_id, daily_study_minutes=daily_minutes, exam_date=exam_date_str)

        # Fetch courses and topics
        courses = self.repo.list_courses(user_id=user_id)
        if course_id:
            courses = [c for c in courses if c["id"] == course_id]

        all_topics: list[dict[str, Any]] = []
        for c in courses:
            cov = self.get_advanced_syllabus_coverage(user_id=user_id, course_id=c["id"])
            all_topics.extend(cov["topics"])

        # Fetch open misconceptions to prioritize
        misconceptions = self.repo.list_misconceptions(user_id=user_id, status="open")
        misc_topic_ids = {m["topic_id"] for m in misconceptions}

        # Sort topics by priority (critical first)
        all_topics.sort(
            key=lambda x: (
                1 if x["id"] in misc_topic_ids else 0,
                x["priority_score"],
            ),
            reverse=True,
        )

        # Allocate daily schedule
        minutes_per_task = 25  # standard revision block
        tasks_per_day = max(1, daily_minutes // minutes_per_task)
        total_capacity = days_remaining * tasks_per_day

        overload_warning = len(all_topics) > total_capacity

        daily_schedule: list[dict[str, Any]] = []
        topic_idx = 0

        for day_offset in range(days_remaining):
            sched_date = today + timedelta(days=day_offset)
            date_str = sched_date.isoformat()

            day_tasks: list[dict[str, Any]] = []
            for _ in range(tasks_per_day):
                if topic_idx < len(all_topics):
                    t = all_topics[topic_idx]
                    has_misc = t["id"] in misc_topic_ids
                    task = {
                        "topic_id": t["id"],
                        "topic_title": t["title"],
                        "unit_number": t["unit_number"],
                        "estimated_minutes": minutes_per_task,
                        "priority": 5 if (has_misc or t["priority_level"] == "critical") else 3,
                        "reason": "Open Misconception Review" if has_misc else f"PYQ Weight: {t['pyq_count']} questions",
                    }
                    day_tasks.append(task)
                    topic_idx += 1

            if day_tasks:
                daily_schedule.append({
                    "date": date_str,
                    "day_number": day_offset + 1,
                    "allocated_minutes": len(day_tasks) * minutes_per_task,
                    "tasks": day_tasks,
                })

        return {
            "exam_date": target_date.isoformat(),
            "days_remaining": days_remaining,
            "daily_study_minutes": daily_minutes,
            "total_planned_tasks": topic_idx,
            "total_topics": len(all_topics),
            "overload_warning": overload_warning,
            "daily_schedule": daily_schedule,
        }


_REVISION_ENGINE = None


def get_revision_engine() -> RevisionEngine:
    global _REVISION_ENGINE
    if _REVISION_ENGINE is None:
        _REVISION_ENGINE = RevisionEngine()
    return _REVISION_ENGINE
