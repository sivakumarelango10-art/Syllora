"""Thread-safe sliding-window in-memory rate limiter for Syllora API endpoints."""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from fastapi import HTTPException


class RateLimiter:
    """Sliding-window rate limiter per client/user identifier."""

    def __init__(self, max_requests: int = 60, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._records: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str) -> None:
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            timestamps = [t for t in self._records[key] if t > cutoff]
            if len(timestamps) >= self.max_requests:
                retry_after = int(self.window_seconds - (now - timestamps[0])) + 1
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
