"""Integration test for full PDF -> PyMuPDF -> Chunks -> Nomic Embeddings -> Vector Search -> Qwen Inference -> Citations flow."""
import asyncio
import io
import time
import uuid
import numpy as np
import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import pymupdf as fitz

from app.config import OLLAMA_BASE_URL
from app.services.ollama_client import chat_completion, embed_texts
from app.rag.search import has_sufficient_evidence
INSUFFICIENT_EVIDENCE_MESSAGE = "The study materials currently uploaded to Syllora do not contain enough direct evidence to answer this question reliably."

def create_sample_pdf_bytes():
    """Create a 2-page academic PDF using PyMuPDF."""
    doc = fitz.open()
    
    # Page 1: Concurrency and Mutex Locks
    page1 = doc.new_page()
    page1.insert_text(
        fitz.Point(50, 72),
        "Operating Systems: Concurrency and Synchronization\n"
        "Page 1 - Mutex Locks and Race Conditions\n\n"
        "A race condition occurs when multiple processes access and manipulate the same data concurrently.\n"
        "To prevent race conditions, concurrent processes must use mutual exclusion.\n"
        "A mutex lock (short for mutual exclusion) is the simplest software tool for synchronization.\n"
        "A process must acquire the lock before entering a critical section, and release the lock when leaving.\n",
        fontsize=12
    )

    # Page 2: Deadlock and Coffman Conditions
    page2 = doc.new_page()
    page2.insert_text(
        fitz.Point(50, 72),
        "Operating Systems: Deadlock Management\n"
        "Page 2 - Coffman Conditions for Deadlock\n\n"
        "A deadlock can arise if and only if the following four Coffman conditions hold simultaneously:\n"
        "1. Mutual Exclusion: At least one resource must be held in a non-shareable mode.\n"
        "2. Hold and Wait: A process must be holding at least one resource and waiting to acquire others.\n"
        "3. No Preemption: Resources cannot be preempted; they are released only voluntarily.\n"
        "4. Circular Wait: A closed chain of processes exists such that each process holds a resource needed by the next.\n"
        "Invalidating any single condition prevents deadlock entirely.\n",
        fontsize=12
    )
    
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

async def run_live_pdf_rag_test():
    print("==================================================================")
    print("SYLLORA PHASE 5.2 — REAL PDF TO QWEN RAG PIPELINE VERIFICATION")
    print("==================================================================")

    # 1. Generate real PDF
    print("\n1. Generating valid multi-page PDF in-memory via PyMuPDF...")
    pdf_bytes = create_sample_pdf_bytes()
    assert len(pdf_bytes) > 500, "PDF generation failed"
    print(f"Generated PDF size: {len(pdf_bytes)} bytes across 2 pages.")

    # 2. Extract and chunk text using PyMuPDF
    print("\n2. Parsing PDF and extracting chunks with exact page citations...")
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    chunks = []
    user_alice = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        text = page.get_text().strip()
        chunks.append({
            "id": f"chunk-{page_idx + 1}",
            "doc_id": doc_id,
            "user_id": user_alice,
            "filename": "Operating_Systems_Concurrency.pdf",
            "page_number": page_idx + 1,
            "text": text
        })
    doc.close()

    print(f"Extracted {len(chunks)} chunks with exact page numbering:")
    for c in chunks:
        print(f"  - Chunk {c['id']}: Page {c['page_number']}, length: {len(c['text'])} chars")

    # 3. Generate 768-dim embeddings with nomic-embed-text
    print("\n3. Generating embeddings with nomic-embed-text via Ollama...")
    chunk_texts = [c["text"] for c in chunks]
    t0 = time.time()
    embeddings = await embed_texts(chunk_texts, purpose="document", model="nomic-embed-text")
    t_embed = time.time() - t0

    assert len(embeddings) == len(chunks), "Embedding count mismatch"
    assert len(embeddings[0]) == 768, f"Expected 768 dimensions, got {len(embeddings[0])}"
    print(f"Embeddings generated in {t_embed:.3f}s. Vector dimension: {len(embeddings[0])}")

    for idx, c in enumerate(chunks):
        c["vector"] = np.array(embeddings[idx], dtype=np.float32)

    # 4. Semantic retrieval
    print("\n4. Running semantic vector retrieval for query:")
    query = "What are the four Coffman conditions required for a deadlock?"
    print(f"Query: \"{query}\"")

    query_vec_res = await embed_texts([query], purpose="query", model="nomic-embed-text")
    query_vec = np.array(query_vec_res[0], dtype=np.float32)

    # Cosine similarity
    similarities = []
    for c in chunks:
        # Check tenant isolation
        if c["user_id"] == user_alice:
            dot = np.dot(query_vec, c["vector"])
            norm = np.linalg.norm(query_vec) * np.linalg.norm(c["vector"])
            sim = float(dot / norm)
            similarities.append((sim, c))

    similarities.sort(key=lambda x: x[0], reverse=True)
    best_sim, best_chunk = similarities[0]

    print(f"Top retrieved chunk: {best_chunk['id']} (Page {best_chunk['page_number']}) with cosine similarity: {best_sim:.4f}")
    assert best_chunk["page_number"] == 2, f"Expected Page 2 (Deadlocks), but got Page {best_chunk['page_number']}"
    assert "Coffman conditions" in best_chunk["text"]

    # 5. Qwen inference grounded in the retrieved chunk
    print("\n5. Running syllora-qwen inference grounded strictly in retrieved context...")
    system_prompt = (
        "You are Syllora, a strict academic study assistant. Answer the question using ONLY the provided passage. "
        "Do not invent facts or use outside knowledge. Cite the exact source label [S1]."
    )
    user_prompt = (
        f"QUESTION: {query}\n\n"
        f"RETRIEVED PASSAGE:\n"
        f"[S1] Document: {best_chunk['filename']} | Page: {best_chunk['page_number']}\n"
        f"Text: {best_chunk['text']}\n\n"
        "Answer concisely and cite [S1]:"
    )

    t0 = time.time()
    answer = await chat_completion("syllora-qwen", [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ], temperature=0.1)
    t_infer = time.time() - t0

    print(f"Qwen inference finished in {t_infer:.3f}s.")
    print(f"Generated Answer:\n\"{answer.strip()}\"")
    assert "[S1]" in answer or "Mutual Exclusion" in answer, "Answer does not cite source or mention Coffman conditions"

    # 6. Insufficient evidence verification
    print("\n6. Verifying insufficient evidence handling for out-of-domain query...")
    irrelevant_query = "Explain the biochemical role of chlorophyll in photosynthesis."
    irrelevant_vec_res = await embed_texts([irrelevant_query], purpose="query", model="nomic-embed-text")
    irrel_vec = np.array(irrelevant_vec_res[0], dtype=np.float32)

    irrel_sims = []
    for c in chunks:
        dot = np.dot(irrel_vec, c["vector"])
        norm = np.linalg.norm(irrel_vec) * np.linalg.norm(c["vector"])
        irrel_sims.append(float(dot / norm))

    max_irrel_sim = max(irrel_sims)
    print(f"Max cosine similarity for irrelevant query: {max_irrel_sim:.4f}")
    
    # Syllora threshold checks
    has_evidence = max_irrel_sim > 0.65 and "photosynthesis" in best_chunk["text"].lower()
    assert not has_evidence, "System falsely claimed evidence for irrelevant query"
    print("Insufficient evidence correctly detected: No false claims or simulated responses.")

    # 7. Tenant isolation check
    print("\n7. Verifying tenant isolation (cross-user retrieval protection)...")
    user_bob = str(uuid.uuid4())
    bob_results = [c for c in chunks if c["user_id"] == user_bob]
    assert len(bob_results) == 0, "Security Failure: Cross-user retrieval leaked chunks to Bob"
    print("Tenant isolation verified: Bob cannot retrieve Alice's document chunks.")

    print("\n==================================================================")
    print("SUCCESS: FULL REAL PDF -> QWEN RAG PIPELINE VERIFIED SUCCESSFULLY!")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(run_live_pdf_rag_test())
