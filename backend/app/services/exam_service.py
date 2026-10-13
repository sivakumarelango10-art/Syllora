"""Past-Paper Intelligence Service: PYQ parsing, question extraction, repetition clustering, and note-evidence mapping."""
from __future__ import annotations

import fitz  # PyMuPDF
import re
import uuid
from typing import Any

from app.rag.search import search_passages
from app.services.ollama_client import OLLAMA_MODEL, OLLAMA_EMBED_MODEL, chat_completion, OllamaServiceError
from app.rate_limiter import inference_concurrency_guard
from app.repositories.academic_repository import get_academic_repository


def extract_questions_from_text(raw_text: str) -> list[dict[str, Any]]:
    """Deterministic regex extraction of exam questions and allocated marks."""
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    extracted: list[dict[str, Any]] = []

    # Question patterns e.g. "Q1.", "Question 2:", "1(a)", "1.", "Part A"
    q_pattern = re.compile(
        r"^(?:(?:Q|Question)\s*(\d+[a-z]?)|(\d+)\s*[\.\)]|([1-9]\s*\([a-z]\)))\s*[:\.\-]?\s*(.+)",
        re.IGNORECASE,
    )
    # Mark patterns e.g. "[10 marks]", "(5 Marks)", "[15m]", "(10)"
    mark_pattern = re.compile(
        r"(?:\[|\()(\d+)\s*(?:marks?|m)?(?:\)|\])",
        re.IGNORECASE,
    )
    # Unit hint pattern e.g. "Unit - II", "Unit 3", "Module 1"
    unit_pattern = re.compile(r"(?:Unit|Module)\s*[-:]?\s*([IVXLCDM\d]+)", re.IGNORECASE)

    current_q: dict[str, Any] | None = None
    current_unit: int | None = None

    for line in lines:
        u_match = unit_pattern.search(line)
        if u_match:
            u_str = u_match.group(1).upper()
            roman_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}
            current_unit = roman_map.get(u_str, int(u_str) if u_str.isdigit() else 1)

        match = q_pattern.match(line)
        if match:
            if current_q:
                extracted.append(current_q)

            q_num = match.group(1) or match.group(2) or match.group(3) or str(len(extracted) + 1)
            rest_of_line = match.group(4)

            # Check for marks in the line
            marks = 5
            m_match = mark_pattern.search(line)
            if m_match:
                try:
                    marks = int(m_match.group(1))
                except ValueError:
                    marks = 5

            current_q = {
                "question_number": q_num.strip(),
                "question_text": rest_of_line.strip(),
                "marks": marks,
                "unit_number": current_unit or 1,
            }
        else:
            if current_q:
                # Append line to active question
                m_match = mark_pattern.search(line)
                if m_match and current_q["marks"] == 5:
                    try:
                        current_q["marks"] = int(m_match.group(1))
                    except ValueError:
                        pass
                current_q["question_text"] += " " + line

    if current_q:
        extracted.append(current_q)

    # Clean question text
    for item in extracted:
        item["question_text"] = re.sub(mark_pattern, "", item["question_text"]).strip()
        if len(item["question_text"]) > 1000:
            item["question_text"] = item["question_text"][:1000]

    return extracted


def compute_text_jaccard(str1: str, str2: str) -> float:
    """Fast lexical similarity for repetition clustering."""
    words1 = set(re.findall(r"\w+", str1.casefold()))
    words2 = set(re.findall(r"\w+", str2.casefold()))
    if not words1 or not words2:
        return 0.0
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))
    return intersection / union if union > 0 else 0.0


class ExamService:
    def __init__(self) -> None:
        self.repo = get_academic_repository()

    def process_pyq_pdf(
        self,
        user_id: str,
        pdf_bytes: bytes,
        filename: str,
        title: str,
        exam_year: int,
        semester: str = "Spring",
        exam_type: str = "End-Semester",
        course_id: str | None = None,
        storage_path: str = "",
    ) -> dict[str, Any]:
        """Extracts text from PYQ PDF and parses structured examination questions."""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)
        full_text_pages: list[str] = []

        for page in doc:
            full_text_pages.append(page.get_text("text"))

        doc.close()
        combined_text = "\n\n".join(full_text_pages)

        # Create paper record
        paper = self.repo.create_exam_paper(
            user_id=user_id,
            title=title,
            filename=filename,
            storage_path=storage_path or f"{user_id}/exams/{uuid.uuid4()}.pdf",
            exam_year=exam_year,
            semester=semester,
            exam_type=exam_type,
            page_count=page_count,
            course_id=course_id,
        )

        # Extract structured questions
        raw_questions = extract_questions_from_text(combined_text)

        # Fallback if no questions detected: split by paragraphs
        if not raw_questions and combined_text.strip():
            paras = [p.strip() for p in combined_text.split("\n\n") if len(p.strip()) > 30]
            for idx, p in enumerate(paras[:10], start=1):
                raw_questions.append({
                    "question_number": str(idx),
                    "question_text": p[:400],
                    "marks": 10 if idx % 2 == 0 else 5,
                    "unit_number": 1 + (idx // 3),
                })

        # Fetch existing questions to cluster repetitions
        existing_questions = self.repo.list_exam_questions(user_id=user_id, course_id=course_id)

        created_questions: list[dict[str, Any]] = []
        for q_data in raw_questions:
            q_text = q_data["question_text"]
            rep_group = str(uuid.uuid4())
            repeat_count = 1

            # Match against existing questions for recurrence
            for eq in existing_questions:
                sim = compute_text_jaccard(q_text, eq["question_text"])
                if sim > 0.45:
                    rep_group = eq.get("repetition_group_id") or eq["id"]
                    repeat_count = eq.get("repeat_count", 1) + 1
                    # Update previous question's repeat counter
                    self.repo.update_exam_question(user_id, eq["id"], repeat_count=repeat_count)
                    break

            created_q = self.repo.create_exam_question(
                user_id=user_id,
                exam_paper_id=paper["id"],
                question_number=q_data["question_number"],
                question_text=q_text,
                marks=q_data["marks"],
                unit_number=q_data.get("unit_number", 1),
                topic_hint=q_text.split()[:4][0] if q_text else "",
                repetition_group_id=rep_group,
                repeat_count=repeat_count,
                extraction_confidence=0.92,
            )
            created_questions.append(created_q)

        return {
            "paper": paper,
            "questions_extracted": len(created_questions),
            "questions": created_questions,
        }

    async def link_question_evidence_async(self, user_id: str, question_id: str) -> list[dict[str, Any]]:
        """Searches student's notes for matching passages and stores evidence links."""
        question = self.repo.get_exam_question(user_id, question_id)
        if not question:
            return []

        search_results = await search_passages(
            query=question["question_text"],
            mode="combined",
            limit=5,
            embedding_model=OLLAMA_EMBED_MODEL,
            user_id=user_id,
        )

        linked: list[dict[str, Any]] = []
        best_score = 0.0

        for res in search_results:
            chunk_id = res["chunk_id"]
            score = float(res.get("score", 0.0))
            if score > best_score:
                best_score = score
            self.repo.link_question_evidence(user_id, question_id, chunk_id, score)
            linked.append({
                "chunk_id": chunk_id,
                "document_title": res["title"],
                "filename": res["filename"],
                "page_number": res["page_number"],
                "excerpt": res["text"][:300],
                "similarity": score,
            })

        status = "unsupported"
        if best_score >= 0.70:
            status = "supported"
        elif best_score >= 0.45:
            status = "partial"

        self.repo.update_exam_question(user_id, question_id, evidence_status=status)
        return linked


_EXAM_SERVICE = None


def get_exam_service() -> ExamService:
    global _EXAM_SERVICE
    if _EXAM_SERVICE is None:
        _EXAM_SERVICE = ExamService()
    return _EXAM_SERVICE
