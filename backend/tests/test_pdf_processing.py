import os
import shutil
from pathlib import Path

import fitz
import pytest

from app.rag.pdf_processing import (
    PdfProcessingError,
    chunk_page_text,
    extract_pdf_chunks,
)


def make_text_image(text: str) -> bytes:
    source = fitz.open()
    source_page = source.new_page(width=600, height=160)
    source_page.insert_text((24, 90), text, fontsize=28)
    image_bytes = source_page.get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes("png")
    source.close()
    return image_bytes


def make_image_pdf(image_bytes: bytes, *, page_count: int = 1) -> bytes:
    document = fitz.open()
    for _ in range(page_count):
        page = document.new_page(width=600, height=800)
        page.insert_image(fitz.Rect(40, 120, 560, 280), stream=image_bytes)
    pdf_bytes = document.tobytes()
    document.close()
    return pdf_bytes


def make_mixed_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page(width=600, height=800)
    page.insert_text((40, 60), "Selectable introduction.")
    page.insert_image(
        fitz.Rect(40, 120, 560, 280),
        stream=make_text_image("Embedded raster text."),
    )
    pdf_bytes = document.tobytes()
    document.close()
    return pdf_bytes


def _tesseract_ready() -> bool:
    executable = shutil.which("tesseract") or r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    tessdata_dir = Path(
        os.getenv("TESSDATA_PREFIX", r"C:\Program Files\Tesseract-OCR\tessdata")
    )
    return Path(executable).is_file() and (tessdata_dir / "eng.traineddata").is_file()


def test_chunk_page_text_preserves_page_metadata_and_overlap() -> None:
    text = "Deadlock is a condition. " * 100
    chunks = chunk_page_text(text, page_number=7, max_chars=250, overlap_chars=40)
    assert len(chunks) > 1
    assert all(chunk.page_number == 7 for chunk in chunks)
    assert all(chunk.text for chunk in chunks)
    assert chunks[0].chunk_index == 0


def test_extract_pdf_chunks_keeps_real_one_based_page_numbers() -> None:
    document = fitz.open()
    page_one = document.new_page()
    page_one.insert_text((72, 72), "Deadlock occurs when processes wait indefinitely for resources.")
    page_two = document.new_page()
    page_two.insert_text((72, 72), "Starvation occurs when a process waits for CPU resources for a long time.")
    pdf_bytes = document.tobytes()
    document.close()

    page_count, chunks = extract_pdf_chunks(pdf_bytes)
    assert page_count == 2
    assert {chunk.page_number for chunk in chunks} == {1, 2}


def test_text_only_pdf_does_not_run_ocr(monkeypatch) -> None:
    document = fitz.open()
    document.new_page().insert_text((72, 72), "Selectable page text.")
    pdf_bytes = document.tobytes()
    document.close()

    def unexpected_ocr(*args, **kwargs):
        raise AssertionError("Text-only pages should not run OCR.")

    monkeypatch.setattr("app.rag.pdf_processing._extract_ocr_text", unexpected_ocr)
    _, chunks = extract_pdf_chunks(pdf_bytes)
    assert "Selectable page text." in chunks[0].text


def test_small_image_region_does_not_trigger_ocr(monkeypatch) -> None:
    document = fitz.open()
    page = document.new_page(width=600, height=800)
    page.insert_text((72, 72), "Text with a small logo.")
    page.insert_image(
        fitz.Rect(40, 120, 60, 140),
        stream=make_text_image("logo"),
    )
    pdf_bytes = document.tobytes()
    document.close()

    def unexpected_ocr(*args, **kwargs):
        raise AssertionError("Insignificant image regions should not run OCR.")

    monkeypatch.setattr("app.rag.pdf_processing._extract_ocr_text", unexpected_ocr)
    _, chunks = extract_pdf_chunks(pdf_bytes)
    assert "Text with a small logo." in chunks[0].text


def test_fully_scanned_page_uses_full_page_ocr(monkeypatch) -> None:
    pdf_bytes = make_image_pdf(make_text_image("Scanned document content."))
    ocr_modes = []

    def fake_ocr(page, *, full):
        ocr_modes.append(full)
        return "Scanned document content."

    monkeypatch.setattr("app.rag.pdf_processing._extract_ocr_text", fake_ocr)
    _, chunks = extract_pdf_chunks(pdf_bytes)
    assert ocr_modes == [True]
    assert "Scanned document content." in chunks[0].text
    assert chunks[0].page_number == 1


def test_mixed_page_uses_partial_ocr_and_keeps_both_content_sources(monkeypatch) -> None:
    pdf_bytes = make_mixed_pdf()
    ocr_modes = []

    def fake_ocr(page, *, full):
        ocr_modes.append(full)
        return (
            "Selectable introduction.\n"
            "Selectable introduction.\n"
            "Embedded raster text."
        )

    monkeypatch.setattr("app.rag.pdf_processing._extract_ocr_text", fake_ocr)
    _, chunks = extract_pdf_chunks(pdf_bytes)
    text = "\n".join(chunk.text for chunk in chunks)
    assert ocr_modes == [False]
    assert text.count("Selectable introduction.") == 1
    assert "Embedded raster text." in text


def test_multipage_document_uses_ocr_only_on_pages_with_image_content(monkeypatch) -> None:
    document = fitz.open()
    document.new_page().insert_text((72, 72), "Selectable first page.")
    scanned_page = document.new_page(width=600, height=800)
    scanned_page.insert_image(
        fitz.Rect(40, 120, 560, 280),
        stream=make_text_image("Scanned second page."),
    )
    mixed_page = document.new_page(width=600, height=800)
    mixed_page.insert_text((40, 60), "Selectable third page.")
    mixed_page.insert_image(
        fitz.Rect(40, 120, 560, 280),
        stream=make_text_image("Raster third page."),
    )
    pdf_bytes = document.tobytes()
    document.close()
    ocr_modes = []

    def fake_ocr(page, *, full):
        ocr_modes.append(full)
        if full:
            return "Scanned second page."
        return "Selectable third page.\nRaster third page."

    monkeypatch.setattr("app.rag.pdf_processing._extract_ocr_text", fake_ocr)
    page_count, chunks = extract_pdf_chunks(pdf_bytes)
    assert page_count == 3
    assert ocr_modes == [True, False]
    assert {chunk.page_number for chunk in chunks} == {1, 2, 3}
    assert any("Scanned second page." in chunk.text for chunk in chunks if chunk.page_number == 2)
    assert any("Raster third page." in chunk.text for chunk in chunks if chunk.page_number == 3)


def test_blank_pdf_page_has_no_readable_text() -> None:
    document = fitz.open()
    document.new_page()
    pdf_bytes = document.tobytes()
    document.close()

    with pytest.raises(PdfProcessingError, match="No readable text"):
        extract_pdf_chunks(pdf_bytes)


def test_ocr_dependency_failure_is_reported_with_page_number(monkeypatch) -> None:
    pdf_bytes = make_image_pdf(make_text_image("Image-only text."))

    def failed_ocr(page, *, full):
        raise RuntimeError("Tesseract is not installed")

    monkeypatch.setattr("app.rag.pdf_processing._extract_ocr_text", failed_ocr)
    with pytest.raises(PdfProcessingError, match="OCR failed on page 1: Tesseract is not installed"):
        extract_pdf_chunks(pdf_bytes)


def test_existing_page_and_chunk_limits_remain_enforced() -> None:
    document = fitz.open()
    document.new_page().insert_text((72, 72), "Deadlock resources. " * 200)
    document.new_page().insert_text((72, 72), "Another page.")
    pdf_bytes = document.tobytes()
    document.close()

    with pytest.raises(PdfProcessingError, match="current limit is 1 pages"):
        extract_pdf_chunks(pdf_bytes, max_pages=1)
    with pytest.raises(PdfProcessingError, match="more than 1 searchable chunks"):
        extract_pdf_chunks(pdf_bytes, max_chunks=1)


@pytest.mark.skipif(not _tesseract_ready(), reason="Tesseract and English trained data are required")
def test_mixed_content_ocr_integration(monkeypatch) -> None:
    executable = shutil.which("tesseract") or r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    monkeypatch.setenv(
        "PATH",
        str(Path(executable).parent) + os.pathsep + os.getenv("PATH", ""),
    )
    _, chunks = extract_pdf_chunks(make_mixed_pdf())
    text = "\n".join(chunk.text for chunk in chunks)
    assert "Selectable introduction." in text
    assert "Embedded raster text." in text
    assert text.count("Selectable introduction.") == 1


def test_extract_rejects_non_pdf_bytes() -> None:
    try:
        extract_pdf_chunks(b"not a pdf")
    except PdfProcessingError as exc:
        assert "valid PDF" in str(exc)
    else:
        raise AssertionError("Expected invalid PDF to be rejected")
