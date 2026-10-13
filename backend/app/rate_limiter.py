"""Thread-safe sliding-window in-memory rate limiter and concurrency guard for Syllora API endpoints."""
from __future__ import annotations

import asyncio
import os
import threading
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import AsyncIterator
from fastapi import HTTPException, Request


def get_client_rate_limit_key(request: Request, user_id: str | None = None) -> str:
    """
    Extract a reliable rate limiting key for a request.
    Prevents header spoofing: only trusts forwarding headers if direct peer is loopback.
    """
    if user_id:
        return f"user:{user_id}"

    # Determine peer IP
    peer_ip = (request.client.host if request.client else "").strip().lower()

    # Only inspect proxy forwarding headers if direct peer is a trusted local proxy/tunnel
    if peer_ip in ("127.0.0.1", "::1", "localhost", "testclient"):
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return f"ip:{cf_ip.strip()}"
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # First IP in chain is the original client
            client_ip = forwarded.split(",")[0].strip()
            if client_ip:
                return f"ip:{client_ip}"

    return f"ip:{peer_ip or 'unknown'}"


class RateLimiter:
    """Sliding-window rate limiter per client/user identifier with automatic cleanup."""

    def __init__(self, max_requests: int = 60, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._records: dict[str, list[float]] = defaultdict(list)
        self._check_counter = 0

    def check(self, key: str) -> None:
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            self._check_counter += 1
            # Periodic cleanup of expired records to avoid unbounded memory growth
            if self._check_counter % 100 == 0 and len(self._records) > 100:
                expired_keys = [k for k, v in self._records.items() if not v or v[-1] <= cutoff]
                for k in expired_keys:
                    del self._records[k]

            timestamps = [t for t in self._records[key] if t > cutoff]
            if len(timestamps) >= self.max_requests:
                earliest = timestamps[0]
                retry_after = int(self.window_seconds - (now - earliest)) + 1
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded. Maximum {self.max_requests} requests per minute.",
                    headers={"Retry-After": str(max(1, retry_after))},
                )
            timestamps.append(now)
            self._records[key] = timestamps


# 30 AI inferences/minute per student/IP; 120 general requests/minute
ai_rate_limiter = RateLimiter(max_requests=30, window_seconds=60)
standard_rate_limiter = RateLimiter(max_requests=120, window_seconds=60)

# Heavy inference concurrency limiter
_inference_semaphore: asyncio.Semaphore | None = None
_MAX_CONCURRENT_INFERENCES = int(os.getenv("SYLLORA_MAX_CONCURRENT_INFERENCES", "3"))


def _get_inference_semaphore() -> asyncio.Semaphore:
    global _inference_semaphore
    if _inference_semaphore is None:
        _inference_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_INFERENCES)
    return _inference_semaphore


@asynccontextmanager
async def inference_concurrency_guard(timeout_seconds: float = 30.0) -> AsyncIterator[None]:
    """
    Limits simultaneous in-flight LLM generations / embeddings.
    Queues concurrent requests up to semaphore capacity; returns 429 if timeout is reached.
    """
    sem = _get_inference_semaphore()
    try:
        await asyncio.wait_for(sem.acquire(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=429,
            detail="The AI inference engine is currently under high load. Please try again shortly.",
            headers={"Retry-After": "5"},
        )
    try:
        yield
    finally:
        sem.release()

