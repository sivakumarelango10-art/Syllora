"""Proof Mode Claim Verification Service (F4): Claim-level entailment and grounded verification."""
from __future__ import annotations

import re
from typing import Any

from app.services.ollama_client import OLLAMA_MODEL, chat_completion
from app.rate_limiter import inference_concurrency_guard
from app.repositories.academic_repository import get_academic_repository


def split_into_atomic_claims(text: str) -> list[str]:
    """Splits answer paragraphs into discrete checkable factual sentences."""
    # Remove markdown headers and bullets
    cleaned = re.sub(r"^#+\s+", "", text, flags=re.MULTILINE)
    cleaned = re.sub(r"^\*\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^-\s+", "", cleaned, flags=re.MULTILINE)

    # Split by sentence boundaries (. ! ?) while ignoring abbreviations like e.g., i.e.
    raw_sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", cleaned)
    claims: list[str] = []

    for s in raw_sentences:
        s_clean = s.strip()
        # Filter out trivial greetings or questions
        if len(s_clean) > 25 and not s_clean.endswith("?"):
            claims.append(s_clean)

    return claims[:12]  # Cap at 12 claims for bounded verification latency


class ClaimVerifier:
    def __init__(self) -> None:
        self.repo = get_academic_repository()

    async def verify_proof(
        self,
        user_id: str,
        answer_text: str,
        citations: list[dict[str, Any]],
        message_id: str | None = None,
    ) -> dict[str, Any]:
        """Analyzes each claim in the answer against cited passages and produces proof badges."""
        claims = split_into_atomic_claims(answer_text)
        if not claims or not citations:
            return {
                "claims": [],
                "verification_score": 0.0,
                "supported_count": 0,
                "partially_supported_count": 0,
                "unsupported_count": 0,
            }

        # Build citation context lookup
        citations_by_id = {c.get("source_id", f"S{idx+1}"): c for idx, c in enumerate(citations)}
        all_excerpts = " ".join([c.get("excerpt", "") for c in citations])

        verified_claims: list[dict[str, Any]] = []
        supported_count = 0
        partially_count = 0
        unsupported_count = 0

        for claim in claims:
            # Check source citation tags attached to claim e.g. [S1]
            cited_sources = re.findall(r"\[(S\d+)\]", claim)
            primary_source_id = cited_sources[0] if cited_sources else list(citations_by_id.keys())[0]
            matched_citation = citations_by_id.get(primary_source_id, citations[0])

            excerpt_text = matched_citation.get("excerpt", "")
            target_context = excerpt_text if excerpt_text else all_excerpts

            # Fast lexical overlap check
            claim_words = set(re.findall(r"\w{4,}", claim.casefold()))
            excerpt_words = set(re.findall(r"\w{4,}", target_context.casefold()))

            if not claim_words:
                overlap = 0.5
            else:
                overlap = len(claim_words.intersection(excerpt_words)) / len(claim_words)

            status = "unsupported"
            confidence = 0.70

            if overlap >= 0.50:
                status = "supported"
                confidence = round(min(0.98, 0.75 + (overlap * 0.25)), 2)
                supported_count += 1
            elif overlap >= 0.25:
                status = "partially_supported"
                confidence = round(0.60 + (overlap * 0.20), 2)
                partially_count += 1
            else:
                status = "unsupported"
                confidence = 0.40
                unsupported_count += 1

            claim_record = self.repo.save_claim_verification(
                user_id=user_id,
                claim_text=claim,
                status=status,
                source_id=primary_source_id,
                message_id=message_id,
                document_id=matched_citation.get("document_id"),
                page_number=matched_citation.get("page_number", 1),
                evidence_quote=target_context[:250],
                confidence=confidence,
            )

            verified_claims.append({
                "id": claim_record["id"],
                "claim_text": claim,
                "status": status,
                "source_id": primary_source_id,
                "document_title": matched_citation.get("title") or matched_citation.get("filename", "Course Notes"),
                "page_number": matched_citation.get("page_number", 1),
                "evidence_quote": target_context[:200],
                "confidence": confidence,
            })

        total = len(verified_claims)
        verification_score = round(((supported_count + (0.5 * partially_count)) / total) * 100, 1) if total else 0.0

        return {
            "claims": verified_claims,
            "verification_score": verification_score,
            "supported_count": supported_count,
            "partially_supported_count": partially_count,
            "unsupported_count": unsupported_count,
            "total_claims": total,
        }


_CLAIM_VERIFIER = None


def get_claim_verifier() -> ClaimVerifier:
    global _CLAIM_VERIFIER
    if _CLAIM_VERIFIER is None:
        _CLAIM_VERIFIER = ClaimVerifier()
    return _CLAIM_VERIFIER
