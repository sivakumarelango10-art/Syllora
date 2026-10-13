"""Source Conflict Detector Service (F12): Discrepancy and contradiction detection across student notes."""
from __future__ import annotations

import re
from typing import Any

from app.rag.search import search_passages
from app.services.ollama_client import OLLAMA_MODEL, chat_completion
from app.rate_limiter import inference_concurrency_guard
from app.repositories.academic_repository import get_academic_repository


class ConflictService:
    def __init__(self) -> None:
        self.repo = get_academic_repository()

    async def scan_for_conflicts(
        self,
        user_id: str,
        concept: str,
        course_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Scans multiple documents for contradictory definitions or divergent formulas on a topic."""
        # Retrieve candidate passages from across the user's corpus
        passages = await search_passages(
            query=concept,
            mode="combined",
            limit=6,
            user_id=user_id,
        )

        # Require passages from at least 2 distinct documents to detect a conflict
        doc_groups: dict[str, list[dict[str, Any]]] = {}
        for p in passages:
            doc_id = p["document_id"]
            doc_groups.setdefault(doc_id, []).append(p)

        if len(doc_groups) < 2:
            return self.repo.list_conflicts(user_id=user_id, course_id=course_id)

        doc_keys = list(doc_groups.keys())
        p_a = doc_groups[doc_keys[0]][0]
        p_b = doc_groups[doc_keys[1]][0]

        # Scan for conflicting numbers or contrasting terminology
        text_a = p_a["text"][:600]
        text_b = p_b["text"][:600]

        # Detect potential contradiction candidates
        nums_a = set(re.findall(r"\b\d+(?:\.\d+)?\b", text_a))
        nums_b = set(re.findall(r"\b\d+(?:\.\d+)?\b", text_b))

        discrepancy_found = False
        desc = ""

        if nums_a and nums_b and not nums_a.intersection(nums_b) and len(nums_a) > 2 and len(nums_b) > 2:
            discrepancy_found = True
            desc = f"Different numerical constants or quantitative figures mentioned across '{p_a['filename']}' and '{p_b['filename']}'."
        elif "not" in text_a.lower() and "always" in text_b.lower():
            discrepancy_found = True
            desc = f"Potential qualification divergence regarding '{concept}' between uploaded materials."

        if discrepancy_found:
            self.repo.create_conflict(
                user_id=user_id,
                concept_title=concept,
                doc_a_id=p_a["document_id"],
                doc_a_page=p_a["page_number"],
                doc_a_quote=text_a[:200],
                doc_b_id=p_b["document_id"],
                doc_b_page=p_b["page_number"],
                doc_b_quote=text_b[:200],
                explanation=desc,
                course_id=course_id,
            )

        return self.repo.list_conflicts(user_id=user_id, course_id=course_id)


_CONFLICT_SERVICE = None


def get_conflict_service() -> ConflictService:
    global _CONFLICT_SERVICE
    if _CONFLICT_SERVICE is None:
        _CONFLICT_SERVICE = ConflictService()
    return _CONFLICT_SERVICE
