"""Mark-Aware Answer Generation Service (F2): Short, Medium, and Comprehensive University-Format Answers."""
from __future__ import annotations

import re
from typing import Any

from app.rag.search import search_passages, has_sufficient_evidence
from app.services.ollama_client import OLLAMA_MODEL, OLLAMA_EMBED_MODEL, chat_completion, OllamaServiceError
from app.rate_limiter import inference_concurrency_guard


def get_mark_structure_guidance(marks: int) -> dict[str, Any]:
    """Returns academic structure guidelines based on exam mark allocation."""
    if marks <= 3:
        return {
            "tier": "short",
            "target_words": "50 to 90 words",
            "instruction": (
                "Format as a concise, precise short-answer response. "
                "Provide an exact definition followed by 2-3 essential technical facts or relevant formula. "
                "Avoid unnecessary filler or lengthy introductions."
            ),
        }
    elif marks <= 8:
        return {
            "tier": "medium",
            "target_words": "180 to 280 words",
            "instruction": (
                "Format as a structured medium-length university exam answer. "
                "Include: (1) Brief concept introduction, (2) 3-5 structured bullet points explaining core mechanism/principles, "
                "(3) A concrete practical example, (4) A brief one-sentence conclusion."
            ),
        }
    else:
        return {
            "tier": "long",
            "target_words": "400 to 650 words",
            "instruction": (
                "Format as an in-depth, high-scoring university examination answer suited for 10-16 marks. "
                "Structure with clear markdown headings:\n"
                "### 1. Abstract & Core Definition\n"
                "### 2. Theoretical Principles & Architecture\n"
                "### 3. Key Mechanism / Mathematical Formulation or Algorithm\n"
                "### 4. Worked Example / Practical Use Case\n"
                "### 5. Architectural Diagram Overview (Describe flow visually)\n"
                "### 6. Comparative Evaluation (Advantages, Trade-offs)\n"
                "### 7. Summary & Academic Key Points"
            ),
        }


class AnswerService:
    async def generate_mark_aware_answer(
        self,
        user_id: str,
        question: str,
        marks: int = 5,
        document_ids: list[str] | None = None,
        top_k: int = 5,
    ) -> dict[str, Any]:
        """Generates evidence-grounded answer structured specifically for the requested marks."""
        # 1. Retrieve supporting passages
        results = await search_passages(
            query=question,
            mode="combined",
            document_ids=document_ids,
            limit=top_k,
            embedding_model=OLLAMA_EMBED_MODEL,
            user_id=user_id,
        )

        if not results or not has_sufficient_evidence(question, results):
            return {
                "status": "insufficient_evidence",
                "question": question,
                "marks": marks,
                "answer": (
                    f"Uploaded study materials do not contain sufficient evidence to formulate a complete {marks}-mark answer. "
                    "Upload the relevant lecture notes or textbook chapters to generate a grounded response."
                ),
                "citations": [],
                "tier": get_mark_structure_guidance(marks)["tier"],
                "model": OLLAMA_MODEL,
            }

        # Format retrieved context with [S1] labels
        context_parts = []
        for idx, item in enumerate(results, start=1):
            context_parts.append(
                f"[S{idx}] Document: {item['filename']} (Page {item['page_number']})\n"
                f"{item['text'][:1200]}"
            )
        context_str = "\n\n".join(context_parts)

        guidance = get_mark_structure_guidance(marks)

        system_prompt = (
            f"You are Syllora, an academic exam assistant. The student requested an answer formatted for {marks} MARKS.\n"
            f"Structure Requirement: {guidance['instruction']}\n"
            f"Target length: approximately {guidance['target_words']}.\n"
            "STRICT RULES:\n"
            "1. Ground every technical claim in the provided study passages. Do not invent outside facts.\n"
            "2. Cite sources using [S1], [S2] matching the supplied passage numbers.\n"
            "3. If any aspect is not covered in the passages, note: '(Note: detailed proof not in uploaded notes)'.\n"
            "4. Keep formatting clean, legible, and academically rigorous."
        )

        user_prompt = f"EXAM QUESTION ({marks} Marks):\n{question}\n\nRETRIEVED STUDY PASSAGES:\n{context_str}\n\nProduce the {marks}-mark answer now:"

        async with inference_concurrency_guard():
            raw_answer = await chat_completion(
                OLLAMA_MODEL,
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                temperature=0.15,
                num_ctx=4096,
            )

        # Extract citations
        cited_numbers = {int(n) for n in re.findall(r"\[S(\d+)\]", raw_answer)}
        citations = []
        for idx, item in enumerate(results, start=1):
            if cited_numbers and idx not in cited_numbers:
                continue
            citations.append({
                "source_id": f"S{idx}",
                "document_id": item["document_id"],
                "filename": item["filename"],
                "title": item["title"],
                "page_number": item["page_number"],
                "excerpt": item["text"][:400],
                "relevance_score": round(float(item["score"]), 4),
            })

        word_count = len(re.findall(r"\w+", raw_answer))

        return {
            "status": "answered",
            "question": question,
            "marks": marks,
            "tier": guidance["tier"],
            "word_count": word_count,
            "answer": raw_answer,
            "citations": citations,
            "model": OLLAMA_MODEL,
        }


_ANSWER_SERVICE = None


def get_answer_service() -> AnswerService:
    global _ANSWER_SERVICE
    if _ANSWER_SERVICE is None:
        _ANSWER_SERVICE = AnswerService()
    return _ANSWER_SERVICE
