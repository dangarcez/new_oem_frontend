from __future__ import annotations

import time
from threading import Lock

from .config import BACKEND_RATE_LIMIT_MAX, BACKEND_RATE_LIMIT_WINDOW_SECONDS


class _TokenBucket:
    def __init__(self, capacity: int, refill_rate: float) -> None:
        self.capacity = max(1, capacity)
        self.refill_rate = max(0.001, refill_rate)
        self.tokens = float(self.capacity)
        self.updated_at = time.monotonic()

    def consume(self, tokens: float = 1.0) -> tuple[bool, float]:
        now = time.monotonic()
        elapsed = now - self.updated_at
        if elapsed > 0:
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
            self.updated_at = now
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True, 0.0
        needed = tokens - self.tokens
        retry_after = needed / self.refill_rate if self.refill_rate > 0 else 0.0
        return False, retry_after


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.capacity = max(1, max_requests)
        self.window_seconds = max(1, window_seconds)
        self.refill_rate = self.capacity / self.window_seconds
        self._lock = Lock()
        self._buckets: dict[str, _TokenBucket] = {}

    def allow(self, key: str, tokens: float = 1.0) -> tuple[bool, float]:
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _TokenBucket(self.capacity, self.refill_rate)
                self._buckets[key] = bucket
            return bucket.consume(tokens)


route_rate_limiter = RateLimiter(BACKEND_RATE_LIMIT_MAX, BACKEND_RATE_LIMIT_WINDOW_SECONDS)
