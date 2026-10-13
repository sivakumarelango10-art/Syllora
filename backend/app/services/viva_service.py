"""Viva Simulator Service (F13): Oral exam simulator with voice transcripts and dynamic follow-ups."""
from __future__ import annotations

import json
from typing import Any

from app.rag.search import search_passages
from app.services.ollama_client import OLLAMA_MODEL, chat_completion
from app.rate_limiter import inference_concurrency_guard
from app.repositories.academic_repository import get_academic_repository
from app.services.evaluation_service import get_evaluation_service


class VivaService:
    def __init__(self) -> None:
        self.repo = get_academic_repository()
        self.evaluator = get_evaluation_service()

    async def start_viva_session(
        self,
        user_id: str,
        topic_title: str,
        course_id: str | None = None,
        topic_id: str | None = None,
    ) -> dict[str, Any]:
        """Initiates a viva oral examination session and generates the opening question."""
        # Retrieve topic notes for grounding
        results = await search_passages(
            query=topic_title,
            mode="combined",
            limit=4,
            user_id=user_id,
        )
        context = "\n".join([r["text"][:600] for r in results]) if results else "Fundamental course concepts."

        prompt_system = (
            "You are an academic viva examiner conducting an oral exam for university students. "
            "Generate ONE crisp, thought-provoking oral viva question focused on core principles. "
            "The question must be conversational, direct, and suitable for verbal response. "
            "Do not output greetings or extra commentary; output ONLY the question."
        )
        prompt_user = f"TOPIC: {topic_title}\nREFERENCE MATERIAL:\n{context}\n\nAsk opening viva question:"

        try:
            async with inference_concurrency_guard():
                question = await chat_completion(
                    OLLAMA_MODEL,
                    [{"role": "system", "content": prompt_system}, {"role": "user", "content": prompt_user}],
                    temperature=0.2,
                    num_ctx=2048,
                )
            question = question.strip().strip('"')
        except Exception:
            question = f"Can you explain the fundamental principle behind {topic_title} and why it is critical in practical systems?"

        session = self.repo.create_viva_session(
            user_id=user_id,
            topic_title=topic_title,
            course_id=course_id,
            topic_id=topic_id,
        )

        initial_transcript = [
            {"speaker": "examiner", "text": question, "turn": 1}
        ]
        self.repo.update_viva_session(
            user_id=user_id,
            session_id=session["id"],
            transcript=initial_transcript,
            status="in_progress",
        )

        return {
            "session_id": session["id"],
            "topic_title": topic_title,
            "opening_question": question,
            "turn": 1,
        }

    async def submit_viva_response(
        self,
        user_id: str,
        session_id: str,
        student_transcript: str,
    ) -> dict[str, Any]:
        """Evaluates student's verbal response and generates a probing follow-up or completion verdict."""
        session = self.repo.get_viva_session(user_id=user_id, session_id=session_id)
        if not session:
            raise ValueError("Viva session not found.")

        transcript: list[dict[str, Any]] = session.get("transcript", [])
        last_question = "Explain the core concept."
        for item in reversed(transcript):
            if item.get("speaker") == "examiner":
                last_question = item.get("text", "")
                break

        # Record student verbal answer
        transcript.append({
            "speaker": "student",
            "text": student_transcript,
            "turn": len(transcript) + 1,
        })

        # Evaluate verbal answer using Source-Grounded Answer Evaluator
        eval_result = await self.evaluator.evaluate_student_answer(
            user_id=user_id,
            question=last_question,
            student_answer=student_transcript,
            marks=5,
            topic_id=session.get("topic_id"),
        )

        turn_count = len([t for t in transcript if t.get("speaker") == "examiner"])
        is_complete = turn_count >= 3

        follow_up_question = None
        if not is_complete:
            # Generate adaptive follow-up
            prompt_system = (
                "You are an academic viva examiner. The student just answered your previous question verbally.\n"
                "Ask ONE probing follow-up question that challenges them on an edge-case or mechanism they missed.\n"
                "Keep it conversational, direct, and under 2 sentences. Output ONLY the question."
            )
            prompt_user = (
                f"PREVIOUS QUESTION: {last_question}\n"
                f"STUDENT ANSWER: {student_transcript}\n"
                f"EXAMINER EVALUATION: {eval_result['feedback']}\n\n"
                "Ask follow-up viva question:"
            )
            try:
                async with inference_concurrency_guard():
                    follow_up = await chat_completion(
                        OLLAMA_MODEL,
                        [{"role": "system", "content": prompt_system}, {"role": "user", "content": prompt_user}],
                        temperature=0.25,
                        num_ctx=2048,
                    )
                follow_up_question = follow_up.strip().strip('"')
            except Exception:
                follow_up_question = "What are the key trade-offs or constraints associated with that approach?"

            transcript.append({
                "speaker": "examiner",
                "text": follow_up_question,
                "turn": len(transcript) + 1,
            })

        overall_score = eval_result["score_awarded"]
        feedback_summary = eval_result["feedback"]

        self.repo.update_viva_session(
            user_id=user_id,
            session_id=session_id,
            transcript=transcript,
            overall_score=overall_score,
            feedback=feedback_summary,
            status="completed" if is_complete else "in_progress",
        )

        return {
            "session_id": session_id,
            "evaluation": eval_result,
            "follow_up_question": follow_up_question,
            "is_complete": is_complete,
            "transcript": transcript,
        }


_VIVA_SERVICE = None


def get_viva_service() -> VivaService:
    global _VIVA_SERVICE
    if _VIVA_SERVICE is None:
        _VIVA_SERVICE = VivaService()
    return _VIVA_SERVICE
