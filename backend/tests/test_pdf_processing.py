import fitz

from app.rag.pdf_processing import PdfProcessingError, chunk_page_text, extract_pdf_chunks


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


def test_extract_rejects_non_pdf_bytes() -> None:
    try:
        extract_pdf_chunks(b"not a pdf")
    except PdfProcessingError as exc:
        assert "valid PDF" in str(exc)
    else:
        raise AssertionError("Expected invalid PDF to be rejected")
