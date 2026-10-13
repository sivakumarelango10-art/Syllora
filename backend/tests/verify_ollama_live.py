"""Direct Verification of Ollama, Syllora-Qwen, and Nomic Embeddings."""
import asyncio
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.config import OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_EMBED_MODEL, EMBEDDING_DIM
from app.services.ollama_client import get_tags, chat_completion, embed_texts

async def main():
    print(f"=== OLLAMA CONFIGURATION ===")
    print(f"OLLAMA_BASE_URL: {OLLAMA_BASE_URL}")
    print(f"Configured Chat Model: {OLLAMA_MODEL}")
    print(f"Configured Embed Model: {OLLAMA_EMBED_MODEL}")
    print(f"Expected Embedding Dim: {EMBEDDING_DIM}")

    # 1. Tags check
    tags = await get_tags()
    models = [m.get("name") for m in tags.get("models", [])]
    print(f"Available models in Ollama: {models}")
    assert any("syllora-qwen" in m for m in models), "syllora-qwen model not found in Ollama"
    assert any("nomic-embed-text" in m for m in models), "nomic-embed-text model not found in Ollama"

    # 2. Test embedding with nomic-embed-text
    print("\n=== 1. TESTING NOMIC-EMBED-TEXT EMBEDDINGS ===")
    t0 = time.time()
    test_texts = [
        "Operating Systems deadlock avoidance and Banker's algorithm.",
        "Mutual exclusion condition requires exclusive resource reservation."
    ]
    vectors = await embed_texts(test_texts, purpose="document", model="nomic-embed-text")
    embed_time = time.time() - t0

    print(f"Embedding Status: SUCCESS")
    print(f"Number of vectors generated: {len(vectors)}")
    assert len(vectors) == 2, f"Expected 2 vectors, got {len(vectors)}"
    dim = len(vectors[0])
    print(f"Vector Dimensions: {dim}")
    assert dim == 768, f"Expected 768 dimensions, got {dim}"
    print(f"Sample values (first 5 of vector 0): {[round(x, 6) for x in vectors[0][:5]]}")
    print(f"Embedding Latency (2 texts): {embed_time:.3f}s")

    # 3. Test chat inference with syllora-qwen
    print("\n=== 2. TESTING SYLLORA-QWEN INFERENCE ===")
    prompt = "In one sentence, explain what mutual exclusion means in operating systems concurrency."
    messages = [
        {"role": "system", "content": "You are Syllora, an academic AI assistant. Answer concisely and accurately based on academic principles."},
        {"role": "user", "content": prompt}
    ]
    t0 = time.time()
    response = await chat_completion(
        model="syllora-qwen",
        messages=messages,
        temperature=0.2
    )
    infer_time = time.time() - t0

    print(f"Inference Status: SUCCESS")
    print(f"Model used: syllora-qwen")
    print(f"Inference Latency: {infer_time:.3f}s")
    print(f"Generated Response:\n\"{response.strip()}\"")
    assert len(response.strip()) > 10, "Response is too short or empty"

    # 4. Test question generation through academic service
    print("\n=== 3. TESTING UNDERSTANDING SERVICE QUESTION GENERATION ===")
    from app.services.understanding_service import generate_question

    t0 = time.time()
    q_data = generate_question(
        topic_title="Deadlock Prevention",
        topic_description="Techniques to prevent deadlocks by invalidating at least one of the four Coffman conditions.",
        difficulty="intermediate"
    )
    q_time = time.time() - t0

    print(f"Question Generation Latency: {q_time:.3f}s")
    print(f"Generated Question:\n{q_data.get('question', '')}")
    print(f"Rubric Key Points ({len(q_data.get('rubric_key_points', []))}): {q_data.get('rubric_key_points', [])}")
    print(f"Evaluation Criteria: {q_data.get('evaluation_criteria', '')[:100]}...")

    print("\n🎉 ALL LIVE OLLAMA AND QWEN INFERENCE CHECKS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(main())
