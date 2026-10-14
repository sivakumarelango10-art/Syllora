"""PDF text extraction and page-aware chunking for Syllora."""
from __future__ import annotations

import os
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

import fitz

OCR_MIN_IMAGE_DIMENSION = 32
OCR_MIN_IMAGE_REGION_AREA_RATIO = 0.015
OCR_MIN_TOTAL_IMAGE_AREA_RATIO = 0.03


@dataclass(frozen=True)
class TextChunk:
    page_number: int
    chunk_index: int
    text: str


class PdfProcessingError(ValueError):
    """Raised when a PDF cannot be processed into searchable text."""


def _page_image_rects(page: fitz.Page) -> list[fitz.Rect]:
    """Return unique image placement bounds reported by PyMuPDF."""
    image_rects: dict[tuple[float, float, float, float], fitz.Rect] = {}
    page_dict = page.get_text("dict")
    for block in page_dict.get("blocks", []):
        if block.get("type") == 1 and block.get("bbox"):
            rect = fitz.Rect(block["bbox"])
            image_rects[tuple(round(value, 2) for value in rect)] = rect

    for image_info in page.get_image_info():
        bbox = image_info.get("bbox")
        if bbox:
            rect = fitz.Rect(bbox)
            image_rects[tuple(round(value, 2) for value in rect)] = rect
    return list(image_rects.values())


def _page_needs_ocr(page: fitz.Page) -> bool:
    """Check whether visible image regions are large enough to justify OCR."""
    page_area = page.rect.get_area()
    if page_area <= 0:
        return False

    image_area = 0.0
    for rect in _page_image_rects(page):
        rect = rect & page.rect
        if rect.is_empty or rect.width < OCR_MIN_IMAGE_DIMENSION or rect.height < OCR_MIN_IMAGE_DIMENSION:
            continue
        area_ratio = rect.get_area() / page_area
        if area_ratio >= OCR_MIN_IMAGE_REGION_AREA_RATIO:
            return True
        image_area += rect.get_area()
    return image_area / page_area >= OCR_MIN_TOTAL_IMAGE_AREA_RATIO


def _extract_ocr_text(page: fitz.Page, *, full: bool) -> str:
    tessdata_dir = os.getenv(
        "TESSDATA_PREFIX",
        r"C:\Program Files\Tesseract-OCR\tessdata",
    )
    textpage = page.get_textpage_ocr(
        language="eng",
        dpi=160,
        full=full,
        tessdata=tessdata_dir,
    )
    return page.get_text("text", textpage=textpage)


def _merge_ocr_text(selectable_text: str, ocr_text: str) -> str:
    """Retain selectable lines once when OCR returns them alongside OCR text."""
    selectable_lines = [
        line for line in selectable_text.splitlines() if _normalise_text(line)
    ]
    selectable_counts = Counter(_normalise_text(line).casefold() for line in selectable_lines)
    merged_lines: list[str] = []
    seen_selectable: Counter[str] = Counter()

    for line in ocr_text.splitlines():
        normalised = _normalise_text(line)
        key = normalised.casefold()
        if key in selectable_counts:
            if seen_selectable[key] >= selectable_counts[key]:
                continue
            seen_selectable[key] += 1
        if normalised:
            merged_lines.append(normalised)

    missing_selectable: list[str] = []
    for line in selectable_lines:
        key = _normalise_text(line).casefold()
        if seen_selectable[key] < selectable_counts[key]:
            missing_selectable.append(line)
            seen_selectable[key] += 1
    return "\n".join([*missing_selectable, *merged_lines])


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


def extract_pdf_pages_and_chunks(
    pdf_bytes: bytes,
    *,
    max_pages: int = 500,
    max_chunks: int = 1200,
) -> tuple[int, list[dict[str, Any]], list[TextChunk]]:
    """Extract page text and metadata with 1-based page numbers, then chunk each page."""
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

            pages: list[dict[str, Any]] = []
            chunks: list[TextChunk] = []
            has_text = False
            for page_number, page in enumerate(document, start=1):
                selectable_text = _normalise_text(page.get_text("text"))
                needs_ocr = _page_needs_ocr(page)
                page_text = selectable_text

                if needs_ocr:
                    try:
                        ocr_text = _normalise_text(
                            _extract_ocr_text(page, full=not bool(selectable_text))
                        )
                        if selectable_text:
                            page_text = _merge_ocr_text(selectable_text, ocr_text)
                        else:
                            page_text = ocr_text
                    except Exception as exc:
                        raise PdfProcessingError(
                            f"OCR failed on page {page_number}: {exc}"
                        ) from exc

                pages.append({
                    "page_number": page_number,
                    "extracted_text": page_text,
                    "page_metadata": {
                        "char_count": len(page_text),
                        "word_count": len(page_text.split()) if page_text else 0,
                    },
                })

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
            "No readable text was found in this PDF."
        )
    return page_count, pages, chunks


def extract_pdf_chunks(
    pdf_bytes: bytes,
    *,
    max_pages: int = 500,
    max_chunks: int = 1200,
) -> tuple[int, list[TextChunk]]:
    """Extract text with 1-based PDF page numbers, then chunk each page."""
    page_count, _pages, chunks = extract_pdf_pages_and_chunks(
        pdf_bytes, max_pages=max_pages, max_chunks=max_chunks
    )
    return page_count, chunks
