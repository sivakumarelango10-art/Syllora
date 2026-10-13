"""AI-backed Check Understanding question generator and rubric evaluation engine."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from app.rag.search import search_passages
from app.repositories.academic_repository import get_academic_repository
from app.services.ollama_client import OLLAMA_MODEL, chat_completion, OllamaServiceError

logger = logging.getLogger(__name__)


class UnderstandingService:
    def __init__(self, repo=None):
        self.repo = repo or get_academic_repository()

    async def generate_question(
        self, user_id: str, topic_id: str, difficulty: str = "intermediate"
    ) -> dict[str, Any]:
        """Generate a conceptual self-explanation question grounded in study passages."""
        topic = self.repo.get_topic(user_id, topic_id)
        if not topic:
            raise ValueError("Topic not found.")

        # Search for evidence related to the topic title
        passages = await search_passages(
            query=topic["title"],
            mode="combined",
            limit=4,
            user_id=user_id,
        )

        context_text = "\n".join([f"- {p['text'][:400]}" for p in passages]) if passages else "No direct textbook excerpts found."

        system_prompt = (
            "You are Syllora, an academic evaluator for university computer science and engineering. "
            "Formulate a thought-provoking conceptual question that tests whether a student deeply understands "
            "the core mechanism, trade-offs, or invariants of the topic. Avoid trivial multiple-choice or definition queries. "
            "Output JSON with keys: 'question', 'context_summary', 'key_concepts' (array of strings)."
        )
        user_prompt = (
            f"TOPIC: {topic['title']}\n"
            f"DIFFICULTY: {difficulty}\n"
            f"SOURCE EVIDENCE:\n{context_text}\n\n"
            "Generate one academic question in valid JSON format."
        )

        try:
            raw_response = await chat_completion(
                OLLAMA_MODEL,
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                temperature=0.2,
                num_ctx=4096,
            )
            # Clean possible markdown fence from JSON
            cleaned = re.sub(r"^```(?:json)?|```$", "", raw_response.strip(), flags=re.MULTILINE).strip()
            data = json.loads(cleaned)
            question = data.get("question", f"Explain the fundamental mechanisms and trade-offs of {topic['title']}.")
            context_summary = data.get("context_summary", f"Core concepts for {topic['title']}")
            key_concepts = data.get("key_concepts", [topic["title"]])
        except Exception as exc:
            logger.warning("Falling back to deterministic question generation: %s", exc)
            question = f"In your own words, explain how {topic['title']} operates. What conditions or invariants are necessary, and why?"
            context_summary = f"Key mechanisms of {topic['title']}"
            key_concepts = [topic["title"], "Mechanisms", "Invariants"]

        return {
            "topic_id": topic_id,
            "topic_title": topic["title"],
            "question": question,
            "context_summary": context_summary,
            "key_concepts": key_concepts,
            "model": OLLAMA_MODEL,
        }

    async def evaluate_explanation(
        self, user_id: str, topic_id: str, question: str, student_explanation: str
    ) -> dict[str, Any]:
        """Evaluate student explanation against a structured 3-point rubric."""
        topic = self.repo.get_topic(user_id, topic_id)
        topic_title = topic["title"] if topic else "Topic"

        # Search supporting evidence
        passages = await search_passages(
            query=f"{topic_title} {question}",
            mode="combined",
            limit=3,
            user_id=user_id,
        )
        evidence_text = "\n".join([f"[Source: {p['filename']} p.{p['page_number']}] {p['text'][:500]}" for p in passages]) if passages else "Reference materials unavailable."

        system_prompt = (
            "You are Syllora's academic rubric evaluator. Evaluate the student's answer against a 3-point rubric:\n"
            "Score 3 = Thorough, accurate conceptual mastery with sound reasoning.\n"
            "Score 2 = Partially accurate or incomplete; missed secondary implications.\n"
            "Score 1 = Substantial misconceptions or incorrect fundamental premises.\n\n"
            "Respond in STRICT JSON with keys:\n"
            "- 'score': integer (1, 2, or 3)\n"
            "- 'accurate_points': list of strings identifying correct statements\n"
            "- 'missing_concepts': list of strings identifying omitted points\n"
            "- 'improvement_guidance': concise constructive feedback\n"
            "- 'feedback': comprehensive summary paragraph"
        )
        user_prompt = (
            f"TOPIC: {topic_title}\n"
            f"QUESTION: {question}\n"
            f"VERIFIED EVIDENCE:\n{evidence_text}\n\n"
            f"STUDENT EXPLANATION:\n{student_explanation}\n\n"
            "Evaluate and return JSON."
        )

        try:
            raw_response = await chat_completion(
                OLLAMA_MODEL,
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                temperature=0.1,
                num_ctx=4096,
            )
            cleaned = re.sub(r"^```(?:json)?|```$", "", raw_response.strip(), flags=re.MULTILINE).strip()
            data = json.loads(cleaned)
            score = max(1, min(3, int(data.get("score", 2))))
            accurate_points = data.get("accurate_points", ["Identified core subject"])
            missing_concepts = data.get("missing_concepts", [])
            improvement_guidance = data.get("improvement_guidance", "Focus on formal definitions and necessary conditions.")
            feedback = data.get("feedback", "Good effort. Review the verified study passages to sharpen precision.")
        except Exception as exc:
            logger.warning("Falling back to rubric evaluation: %s", exc)
            # Deterministic heuristic scoring
            word_count = len(student_explanation.split())
            if word_count > 30 and any(w in student_explanation.lower() for w in ["because", "condition", "process", "wait", "hold"]):
                score = 2
                accurate_points = ["Articulated process relationships"]
                missing_concepts = ["Formal invariants"]
                improvement_guidance = "Elaborate on specific requirements and edge cases."
                feedback = "Your explanation shows solid general intuition. Elaborating on edge conditions will make it complete."
            else:
                score = 1
                accurate_points = ["Addressed prompt"]
                missing_concepts = ["Core mechanism details", "Supporting conditions"]
                improvement_guidance = "Review the chapter notes before explaining."
                feedback = "Explanation is brief or lacks mechanical precision. Compare your thoughts against the textbook passages."

        rubric = {
            "score": score,
            "rubric_max": 3,
            "accurate_points": accurate_points,
            "missing_concepts": missing_concepts,
            "improvement_guidance": improvement_guidance,
        }

        # Persist attempt in database
        saved_attempt = self.repo.create_understanding_attempt(
            user_id=user_id,
            topic_id=topic_id,
            explanation=student_explanation,
            score=score,
            rubric=rubric,
            feedback=feedback,
            model=OLLAMA_MODEL,
        )

        return {
            "id": saved_attempt["id"],
            "topic_id": topic_id,
            "score": score,
            "rubric": rubric,
            "feedback": feedback,
            "accurate_points": accurate_points,
            "missing_concepts": missing_concepts,
            "improvement_guidance": improvement_guidance,
            "model": OLLAMA_MODEL,
            "created_at": saved_attempt["created_at"],
        }
