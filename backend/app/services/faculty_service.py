"""Faculty Mode Service (F14): Educator question banks, Bloom's categorization, and exam blueprints."""
from __future__ import annotations

from typing import Any

from app.repositories.academic_repository import get_academic_repository


class FacultyService:
    def __init__(self) -> None:
        self.repo = get_academic_repository()

    def generate_exam_blueprint(
        self,
        user_id: str,
        course_id: str,
        total_marks: int = 100,
        units_count: int = 5,
    ) -> dict[str, Any]:
        """Generates a balanced question paper blueprint matching Bloom's taxonomy and marks distributions."""
        questions = self.repo.list_faculty_questions(user_id=user_id, course_id=course_id)

        # Standard university distribution: 20% Short (2-mark), 40% Medium (8-mark), 40% Long (16-mark)
        blueprint_structure = [
            {"section": "Part A", "title": "Short Answer Questions", "marks_per_q": 2, "count": 10, "total_marks": 20, "bloom_target": "Remember & Understand"},
            {"section": "Part B", "title": "Analytical & Conceptual", "marks_per_q": 8, "count": 5, "total_marks": 40, "bloom_target": "Apply & Analyze"},
            {"section": "Part C", "title": "Comprehensive Design / Case Study", "marks_per_q": 16, "count": 2, "total_marks": 32, "bloom_target": "Evaluate & Create"},
        ]

        # Calculate unit distribution
        unit_map: dict[int, list[dict[str, Any]]] = {}
        for q in questions:
            u = q.get("unit_number", 1)
            unit_map.setdefault(u, []).append(q)

        return {
            "course_id": course_id,
            "total_marks": total_marks,
            "blueprint_structure": blueprint_structure,
            "bank_available_questions": len(questions),
            "unit_coverage": {u: len(qs) for u, qs in unit_map.items()},
        }


_FACULTY_SERVICE = None


def get_faculty_service() -> FacultyService:
    global _FACULTY_SERVICE
    if _FACULTY_SERVICE is None:
        _FACULTY_SERVICE = FacultyService()
    return _FACULTY_SERVICE
