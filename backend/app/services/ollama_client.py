"""Small asynchronous client for local Ollama chat and embedding APIs."""
from __future__ import annotations

import os
import re
from typing import Any

import httpx

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))
OLLAMA_EMBED_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_EMBED_TIMEOUT_SECONDS", "300"))
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")


class OllamaServiceError(RuntimeError):
    """Raised when the local Ollama service cannot complete a request."""


def strip_thinking_text(content: str) -> str:
    """Remove Qwen/Ollama thinking text if it appears in message content.

    Some runtime/model combinations may place a closing </think> tag in content
    even when thinking is disabled. Treat everything before the first closing tag
    as non-user-facing and return only the final answer.
    """
    text = content or ""
    closing = re.search(r"</think\s*>", text, flags=re.IGNORECASE)
    if closing:
        text = text[closing.end():]
    else:
        text = re.sub(
            r"<think\b[^>]*>.*?</think\s*>", "", text,
            flags=re.IGNORECASE | re.DOTALL,
        )
    # Remove any additional complete think blocks or stray markers.
    text = re.sub(
        r"<think\b[^>]*>.*?</think\s*>", "", text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(r"</?think\s*>", "", text, flags=re.IGNORECASE)
    return text.strip()


def _with_embedding_prefix(text: str, purpose: str, model: str) -> str:
    # Nomic's recommended task prefixes improve retrieval embedding quality.
    if "nomic-embed-text" in model.lower():
        prefix = "search_query: " if purpose == "query" else "search_document: "
        return prefix + text
    return text


async def get_tags() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=httpx.Timeout(OLLAMA_TIMEOUT_SECONDS),
        ) as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise OllamaServiceError(f"Could not reach Ollama at {OLLAMA_BASE_URL}: {exc}") from exc


async def chat_completion(
    model: str,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.2,
    num_ctx: int = 4096,
) -> str:
    try:
        async with httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=httpx.Timeout(OLLAMA_TIMEOUT_SECONDS),
        ) as client:
            response = await client.post(
                "/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "think": False,
                    "options": {"temperature": temperature, "num_ctx": num_ctx},
                },
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.TimeoutException as exc:
        raise OllamaServiceError("Ollama timed out. Try a shorter question or fewer source passages.") from exc
    except httpx.HTTPError as exc:
        detail = getattr(getattr(exc, "response", None), "text", "")
        raise OllamaServiceError(f"Ollama chat request failed: {str(exc)} {detail[:300]}") from exc

    content = strip_thinking_text((payload.get("message") or {}).get("content", ""))
    if not content:
        raise OllamaServiceError("Ollama returned an empty answer after filtering non-user-facing thinking text.")
    return content


async def embed_texts(texts: list[str], *, purpose: str, model: str | None = None) -> list[list[float]]:
    """Embed multiple strings, supporting current and older Ollama API endpoints.

    Current Ollama uses POST /api/embed with an input list. Older versions expose
    POST /api/embeddings with one prompt at a time, so a 404 triggers a compatible
    fallback. Large documents should be indexed using a current Ollama version.
    """
    if not texts:
        return []
    model_name = model or OLLAMA_EMBED_MODEL
    prefixed = [_with_embedding_prefix(text, purpose, model_name) for text in texts]
    timeout = httpx.Timeout(OLLAMA_EMBED_TIMEOUT_SECONDS)

    async with httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=timeout) as client:
        # Try the batched API first; it is considerably faster for document ingestion.
        try:
            response = await client.post(
                "/api/embed",
                json={"model": model_name, "input": prefixed, "truncate": True},
            )
            if response.status_code not in (404, 405):
                response.raise_for_status()
                payload = response.json()
                vectors = payload.get("embeddings")
                if not isinstance(vectors, list) or len(vectors) != len(prefixed):
                    raise OllamaServiceError("Ollama returned an unexpected embedding response.")
                return [[float(value) for value in vector] for vector in vectors]
        except httpx.TimeoutException as exc:
            raise OllamaServiceError("Ollama embedding request timed out during indexing.") from exc
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500]
            if exc.response.status_code in (400, 404) and model_name.lower() not in detail.lower():
                raise OllamaServiceError(
                    f"Could not create embeddings with '{model_name}': {detail}. "
                    f"Install it with `ollama pull {model_name}`."
                ) from exc
            raise OllamaServiceError(f"Ollama embedding request failed: {detail}") from exc
        except httpx.RequestError as exc:
            raise OllamaServiceError(f"Could not connect to Ollama for embeddings: {exc}") from exc

        # Older Ollama API: the endpoint accepts one prompt per request.
        vectors: list[list[float]] = []
        for text in prefixed:
            try:
                response = await client.post(
                    "/api/embeddings",
                    json={"model": model_name, "prompt": text},
                )
                response.raise_for_status()
                vector = response.json().get("embedding")
                if not isinstance(vector, list) or not vector:
                    raise OllamaServiceError("Ollama returned an empty embedding.")
                vectors.append([float(value) for value in vector])
            except httpx.TimeoutException as exc:
                raise OllamaServiceError("Ollama embedding request timed out during indexing.") from exc
            except httpx.HTTPError as exc:
                detail = getattr(getattr(exc, "response", None), "text", "")[:500]
                raise OllamaServiceError(
                    f"Could not create embeddings with '{model_name}': {detail or exc}. "
                    f"Check the Ollama version and run `ollama pull {model_name}`."
                ) from exc
        return vectors
