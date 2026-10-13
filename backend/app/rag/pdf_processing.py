"""PDF text extraction and page-aware chunking for Syllora."""
from __future__ import annotations

import re
from dataclasses import dataclass

import fitz


@dataclass(frozen=True)
class TextChunk:
    page_number: int
    chunk_index: int
    text: str


class PdfProcessingError(ValueError):
    """Raised when a PDF cannot be processed into searchable text."""


def _normalise_text(text: str) -> str:
    text = text.replace("\x00", " ").replace("\u00a0", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_page_text(
    text: str,
    page_number: int,
    max_chars: int = 1100,
    overlap_chars: int = 160,
) -> list[TextChunk]:
    """Split one page into overlapping chunks; never cross a page boundary."""
    text = _normalise_text(text)
    if not text:
        return []
    if max_chars < 100 or overlap_chars < 0 or overlap_chars >= max_chars:
        raise ValueError("Chunk settings are invalid.")

    chunks: list[TextChunk] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            # Prefer stopping on a sentence/paragraph boundary when that does not
            # create a very short chunk.
            candidates = [
                text.rfind("\n", start + int(max_chars * 0.65), end),
                text.rfind(". ", start + int(max_chars * 0.65), end),
                text.rfind("; ", start + int(max_chars * 0.65), end),
                text.rfind(" ", start + int(max_chars * 0.65), end),
            ]
            boundary = max(candidates)
            if boundary > start:
                end = boundary + (2 if text[boundary:boundary + 2] in {". ", "; "} else 1)

        piece = text[start:end].strip()
        if piece:
            chunks.append(TextChunk(page_number, len(chunks), piece))
        if end >= len(text):
            break
        next_start = max(start + 1, end - overlap_chars)
        start = next_start
    return chunks


def extract_pdf_chunks(
    pdf_bytes: bytes,
    *,
    max_pages: int = 500,
    max_chunks: int = 1200,
) -> tuple[int, list[TextChunk]]:
    """Extract text with 1-based PDF page numbers, then chunk each page."""
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF-"):
        raise PdfProcessingError("The uploaded file does not look like a valid PDF.")

    try:
        with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
            if document.is_encrypted:
                raise PdfProcessingError("Password-protected PDFs are not supported yet.")
            page_count = len(document)
            if page_count == 0:
                raise PdfProcessingError("The PDF contains no pages.")
            if page_count > max_pages:
                raise PdfProcessingError(
                    f"This PDF has {page_count} pages. The current limit is {max_pages} pages."
                )

            chunks: list[TextChunk] = []
            has_text = False
            for page_number, page in enumerate(document, start=1):
                page_text = _normalise_text(page.get_text("text"))
                if page_text:
                    has_text = True
                    chunks.extend(chunk_page_text(page_text, page_number))
                    if len(chunks) > max_chunks:
                        raise PdfProcessingError(
                            f"This PDF produces more than {max_chunks} searchable chunks. "
                            "Split it into smaller files and upload them separately."
                        )
    except PdfProcessingError:
        raise
    except Exception as exc:
        raise PdfProcessingError(f"Could not read this PDF: {exc}") from exc

    if not has_text or not chunks:
        raise PdfProcessingError(
            "No selectable text was found. This may be a scanned PDF; OCR support is not enabled yet."
        )
    return page_count, chunks
