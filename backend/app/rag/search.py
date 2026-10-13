"""Page-aware hybrid retrieval with an in-memory matrix cache."""
from __future__ import annotations

import re
import threading
from typing import Any, Literal

import numpy as np

from app.rag.store import load_search_chunks
from app.services.ollama_client import OllamaServiceError, embed_texts

SearchMode = Literal["keyword", "semantic", "combined"]
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "because", "by", "can", "could",
    "did", "do", "does", "for", "from", "how", "i", "in", "is", "it", "me", "my",
    "of", "on", "or", "our", "please", "should", "so", "that", "the", "their", "this",
    "to", "was", "what", "when", "where", "which", "why", "will", "with", "would", "you",
    # Query framing words are not useful evidence that a topic is covered.
    "according", "answer", "based", "briefly", "chapter", "describe", "difference",
    "differences", "document", "documents", "example", "examples", "explain",
    "first", "give", "help", "lecture", "material", "materials", "note", "notes",
    "page", "pages", "provide", "provided", "question", "simple", "student",
    "students", "summarize", "summary", "tell", "textbook", "three", "uploaded",
    "upload", "use", "using", "year", "sentences", "sentence", "compare", "comparison",
}
_CACHE_LOCK = threading.Lock()
_INDEX_CACHE: dict[tuple[str, str | None], tuple[list[dict[str, Any]], np.ndarray]] = {}


def tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[^\W_]+", text.casefold(), flags=re.UNICODE)
    return [token for token in tokens if token not in STOPWORDS and len(token) > 1]


def keyword_score(query_terms: set[str], chunk_terms: set[str], query: str, chunk_text: str) -> float:
    if not query_terms:
        return 0.0
    matched = len(query_terms.intersection(chunk_terms)) / len(query_terms)
    exact_phrase = 0.12 if len(query.strip()) > 2 and query.casefold() in chunk_text.casefold() else 0.0
    return float(min(1.0, matched + exact_phrase))


def invalidate_index_cache(user_id: str | None = None) -> None:
    global _INDEX_CACHE
    with _CACHE_LOCK:
        if user_id is None:
            _INDEX_CACHE.clear()
        else:
            _INDEX_CACHE = {k: v for k, v in _INDEX_CACHE.items() if k[1] != user_id}


def _get_index(embedding_model: str, user_id: str | None = None) -> tuple[list[dict[str, Any]], np.ndarray]:
    cache_key = (embedding_model, user_id)
    with _CACHE_LOCK:
        if cache_key in _INDEX_CACHE:
            return _INDEX_CACHE[cache_key]

        raw_rows = load_search_chunks(embedding_model, user_id=user_id)
        records: list[dict[str, Any]] = []
        vectors: list[np.ndarray] = []
        expected_dim: int | None = None
        for row in raw_rows:
            vector = np.frombuffer(row["embedding"], dtype=np.float32).copy()
            if vector.size == 0 or vector.size != int(row["embedding_dim"]):
                continue
            if expected_dim is None:
                expected_dim = int(vector.size)
            if vector.size != expected_dim:
                # Avoid mixing vectors from incompatible embedding models/dimensions.
                continue
            norm = float(np.linalg.norm(vector))
            if norm > 0:
                vector /= norm
            item = {key: value for key, value in row.items() if key != "embedding"}
            item["_token_set"] = set(tokenize(item["text"]))
            records.append(item)
            vectors.append(vector)

        matrix = np.vstack(vectors).astype(np.float32, copy=False) if vectors else np.empty((0, 0), dtype=np.float32)
        _INDEX_CACHE[cache_key] = (records, matrix)
        return records, matrix


async def search_passages(
    query: str,
    *,
    mode: SearchMode = "combined",
    document_ids: list[str] | None = None,
    limit: int = 5,
    embedding_model: str = "nomic-embed-text",
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    """Search pre-indexed passage vectors and metadata; no PDFs are re-parsed here."""
    records, matrix = _get_index(embedding_model, user_id=user_id)

    if not records:
        return []

    terms = set(tokenize(query))
    filtered_indices = [
        i for i, record in enumerate(records)
        if not document_ids or record["document_id"] in document_ids
    ]
    if not filtered_indices:
        return []

    semantic_scores: dict[int, float] = {}
    if mode in ("semantic", "combined"):
        vectors = await embed_texts([query], purpose="query", model=embedding_model)
        query_vector = np.asarray(vectors[0], dtype=np.float32)
        if query_vector.size != matrix.shape[1]:
            raise OllamaServiceError(
                "The query embedding dimension does not match the indexed documents. "
                "Re-index documents after changing the embedding model."
            )
        norm = float(np.linalg.norm(query_vector))
        if norm > 0:
            query_vector /= norm
        scores = matrix @ query_vector
        semantic_scores = {i: float(scores[i]) for i in filtered_indices}

    results: list[dict[str, Any]] = []
    for index in filtered_indices:
        record = records[index]
        semantic = semantic_scores.get(index, 0.0)
        keyword = keyword_score(terms, record["_token_set"], query, record["text"])
        if mode == "keyword":
            relevance = keyword
        elif mode == "semantic":
            relevance = semantic
        else:
            relevance = 0.78 * max(0.0, semantic) + 0.22 * keyword
        results.append({
            "chunk_id": record["id"],
            "document_id": record["document_id"],
            "filename": record["filename"],
            "title": record["title"],
            "page_number": int(record["page_number"]),
            "chunk_index": int(record["chunk_index"]),
            "text": record["text"],
            "semantic_score": semantic,
            "keyword_score": keyword,
            "score": float(relevance),
        })

    results.sort(key=lambda item: item["score"], reverse=True)
    if mode == "keyword":
        results = [item for item in results if item["keyword_score"] > 0]
    return results[:limit]


def has_sufficient_evidence(query: str, results: list[dict[str, Any]]) -> bool:
    """Conservative relevance gate that rejects obvious topic mismatches.

    Cosine scores from embedding models can be moderately positive even for unrelated
    passages. For queries with distinctive long terms, require the passages to cover
    most of those terms unless semantic similarity is unusually strong. This is a
    first-pass guardrail; thresholds should be evaluated against a real course test set.
    """
    if not results:
        return False

    query_terms = set(tokenize(query))
    corpus_terms: set[str] = set()
    for item in results[:5]:
        corpus_terms.update(tokenize(str(item.get("text", ""))))

    distinctive_terms = {term for term in query_terms if len(term) >= 7}
    if distinctive_terms:
        coverage = len(distinctive_terms & corpus_terms) / len(distinctive_terms)
        best_semantic = max(float(item.get("semantic_score", 0.0)) for item in results)
        if coverage < 0.75 and best_semantic < 0.78:
            return False

    return any(
        float(item.get("semantic_score", 0.0)) >= 0.30
        or float(item.get("keyword_score", 0.0)) >= 0.25
        for item in results
    )
