"""Answerability Meter Service (F8): Retrieval sufficiency and corpus coverage assessment."""
from __future__ import annotations

import re
from typing import Any

from app.rag.search import search_passages
from app.services.ollama_client import OLLAMA_EMBED_MODEL


class AnswerabilityService:
    async def evaluate_answerability(
        self,
        user_id: str,
        question: str,
        course_id: str | None = None,
        document_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Calculates evidence sufficiency score and detects missing concept coverage."""
        results = await search_passages(
            query=question,
            mode="combined",
            document_ids=document_ids,
            limit=5,
            embedding_model=OLLAMA_EMBED_MODEL,
            user_id=user_id,
        )

        if not results:
            return {
                "status": "unable_to_determine",
                "label": "No Study Notes Uploaded",
                "confidence_score": 0.0,
                "percentage": 0,
                "missing_concepts": [question],
                "suggestion": "Upload course lecture notes or textbooks in Study Materials to enable AI answers.",
                "retrieved_passages_count": 0,
            }

        # Extract top score
        top_score = float(results[0].get("score", 0.0))
        all_text = " ".join([r.get("text", "") for r in results]).casefold()

        # Extract key terms from question (words > 4 chars, ignoring stopwords)
        stopwords = {"what", "when", "where", "which", "explain", "describe", "discuss", "between", "their", "about", "state", "define"}
        question_words = [
            w for w in re.findall(r"\b[a-zA-Z]{4,}\b", question.casefold())
            if w not in stopwords
        ]

        missing_terms: list[str] = []
        for word in question_words:
            if word not in all_text:
                missing_terms.append(word)

        term_coverage = (
            (len(question_words) - len(missing_terms)) / len(question_words)
            if question_words else 1.0
        )

        # Combined composite confidence
        composite_score = (top_score * 0.6) + (term_coverage * 0.4)
        pct = round(min(100.0, max(0.0, composite_score * 100)), 1)

        if composite_score >= 0.70 and term_coverage >= 0.65:
            status = "fully_supported"
            label = "Fully Supported by Study Materials"
            suggestion = "High evidence coverage found across your course notes."
        elif composite_score >= 0.48:
            status = "partially_supported"
            label = "Partially Supported (Incomplete Coverage)"
            suggestion = f"Some concepts like '{', '.join(missing_terms[:3])}' may not be thoroughly detailed in your notes." if missing_terms else "Partial notes found."
        else:
            status = "insufficient_evidence"
            label = "Insufficient Evidence in Notes"
            suggestion = "Key topics are missing from your uploaded documents. Upload lecture slides covering this topic."

        return {
            "status": status,
            "label": label,
            "confidence_score": round(composite_score, 3),
            "percentage": pct,
            "missing_concepts": missing_terms[:5],
            "suggestion": suggestion,
            "retrieved_passages_count": len(results),
            "top_relevance_score": round(top_score, 3),
        }


_ANSWERABILITY_SERVICE = None


def get_answerability_service() -> AnswerabilityService:
    global _ANSWERABILITY_SERVICE
    if _ANSWERABILITY_SERVICE is None:
        _ANSWERABILITY_SERVICE = AnswerabilityService()
    return _ANSWERABILITY_SERVICE
