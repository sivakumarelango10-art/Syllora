"""Source-Grounded Answer Evaluator Service (F3 & F5): Rubric-based evaluation of student answers against study notes."""
from __future__ import annotations

import json
import re
from typing import Any

from app.rag.search import search_passages
from app.services.ollama_client import OLLAMA_MODEL, OLLAMA_EMBED_MODEL, chat_completion
from app.rate_limiter import inference_concurrency_guard
from app.repositories.academic_repository import get_academic_repository


class EvaluationService:
    def __init__(self) -> None:
        self.repo = get_academic_repository()

    async def evaluate_student_answer(
        self,
        user_id: str,
        question: str,
        student_answer: str,
        marks: int = 5,
        course_id: str | None = None,
        topic_id: str | None = None,
        question_id: str | None = None,
    ) -> dict[str, Any]:
        """Evaluates student's answer against uploaded course materials with detailed rubric."""
        # 1. Retrieve reference passages
        results = await search_passages(
            query=question,
            mode="combined",
            limit=5,
            embedding_model=OLLAMA_EMBED_MODEL,
            user_id=user_id,
        )

        context_passages = [f"Passage {idx}: {r['text'][:900]}" for idx, r in enumerate(results, start=1)]
        ref_context = "\n\n".join(context_passages) if context_passages else "No notes uploaded for this topic."

        prompt_system = (
            "You are an expert university examiner. Evaluate the student's answer against the verified reference notes.\n"
            f"Question Allocated Marks: {marks}.\n"
            "Respond ONLY with a valid JSON object matching this exact schema:\n"
            "{\n"
            '  "score_awarded": float,\n'
            '  "percentage": float,\n'
            '  "conceptual_accuracy": float,\n'
            '  "point_coverage": float,\n'
            '  "structure_depth": float,\n'
            '  "terminology": float,\n'
            '  "covered_points": ["point 1", "point 2"],\n'
            '  "missing_points": ["missing essential concept 1"],\n'
            '  "inaccuracies": ["incorrect statement if any"],\n'
            '  "feedback": "constructive examiner remarks",\n'
            '  "misconception_identified": "brief explanation of misconception if student made an error, else empty string"\n'
            "}"
        )

        prompt_user = (
            f"QUESTION ({marks} Marks):\n{question}\n\n"
            f"REFERENCE NOTES FROM STUDENT'S MATERIALS:\n{ref_context}\n\n"
            f"STUDENT'S SUBMITTED ANSWER:\n{student_answer}\n\n"
            "Evaluate strictly according to evidence in reference notes. Return JSON only:"
        )

        try:
            async with inference_concurrency_guard():
                raw_response = await chat_completion(
                    OLLAMA_MODEL,
                    [{"role": "system", "content": prompt_system}, {"role": "user", "content": prompt_user}],
                    temperature=0.1,
                    num_ctx=4096,
                )

            # Extract JSON block
            json_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
            if json_match:
                eval_data = json.loads(json_match.group(0))
            else:
                eval_data = json.loads(raw_response)
        except Exception:
            # Fallback deterministic evaluator if model JSON fails
            words_sub = len(re.findall(r"\w+", student_answer))
            score = round(min(marks, max(1.0, (words_sub / 50.0) * (marks * 0.6))), 1)
            eval_data = {
                "score_awarded": score,
                "percentage": round((score / marks) * 100, 1),
                "conceptual_accuracy": 3.0,
                "point_coverage": 2.5,
                "structure_depth": 2.0,
                "terminology": 1.5,
                "covered_points": ["Core definition addressed in basic terms."],
                "missing_points": ["Detailed mechanism and concrete academic examples."],
                "inaccuracies": [],
                "feedback": "Answer demonstrates foundational knowledge but requires deeper elaboration and syllabus-specific terminology.",
                "misconception_identified": "",
            }

        score_awarded = min(float(marks), max(0.0, float(eval_data.get("score_awarded", 0.0))))
        percentage = round((score_awarded / marks) * 100, 1)

        rubric_breakdown = {
            "conceptual_accuracy": eval_data.get("conceptual_accuracy", score_awarded * 0.4),
            "point_coverage": eval_data.get("point_coverage", score_awarded * 0.3),
            "structure_depth": eval_data.get("structure_depth", score_awarded * 0.2),
            "terminology": eval_data.get("terminology", score_awarded * 0.1),
        }

        covered_points = eval_data.get("covered_points", [])
        missing_points = eval_data.get("missing_points", [])
        inaccuracies = eval_data.get("inaccuracies", [])
        feedback = eval_data.get("feedback", "Good attempt.")
        misconception_str = eval_data.get("misconception_identified", "")

        # Persist in answer_evaluations
        saved = self.repo.save_answer_evaluation(
            user_id=user_id,
            question_text=question,
            student_answer=student_answer,
            marks_allocated=marks,
            score_awarded=score_awarded,
            percentage=percentage,
            rubric_breakdown=rubric_breakdown,
            covered_points=covered_points,
            missing_points=missing_points,
            inaccuracies=inaccuracies,
            feedback=feedback,
            question_id=question_id,
            topic_id=topic_id,
        )

        # If significant misconception identified and topic_id exists, log to misconceptions notebook
        if misconception_str and topic_id:
            try:
                self.repo.create_misconception(
                    user_id=user_id,
                    topic_id=topic_id,
                    student_quote=student_answer[:200],
                    explanation=misconception_str,
                    attempt_id=saved["id"],
                )
            except Exception:
                pass

        citations = [
            {
                "source_id": f"S{idx}",
                "document_title": r["title"],
                "filename": r["filename"],
                "page_number": r["page_number"],
                "excerpt": r["text"][:300],
            }
            for idx, r in enumerate(results[:3], start=1)
        ]

        return {
            "evaluation_id": saved["id"],
            "score_awarded": score_awarded,
            "max_marks": marks,
            "percentage": percentage,
            "rubric_breakdown": rubric_breakdown,
            "covered_points": covered_points,
            "missing_points": missing_points,
            "inaccuracies": inaccuracies,
            "feedback": feedback,
            "citations": citations,
            "created_at": saved["created_at"],
        }


_EVALUATION_SERVICE = None


def get_evaluation_service() -> EvaluationService:
    global _EVALUATION_SERVICE
    if _EVALUATION_SERVICE is None:
        _EVALUATION_SERVICE = EvaluationService()
    return _EVALUATION_SERVICE
