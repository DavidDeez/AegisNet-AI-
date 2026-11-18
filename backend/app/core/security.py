"""Rate limiting, optional API key verification, and safe error handling middleware."""
from __future__ import annotations

from collections import defaultdict, deque
import time
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.logging_config import logger


class RateLimitAndSecurityMiddleware(BaseHTTPMiddleware):
    """
    Provides sliding-window per-client rate limiting, optional API key enforcement,
    and structured exception safety so stack traces are never leaked to external callers.
    """

    def __init__(self, app, max_requests_per_minute: int = 240) -> None:
        super().__init__(app)
        self.max_rpm = max_requests_per_minute
        self._window_sec = 60.0
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        now = time.perf_counter()
        client_host = request.client.host if request.client else "local"

        # 1. Sliding window rate limit check
        q = self._hits[client_host]
        while q and (now - q[0]) > self._window_sec:
            q.popleft()

        if len(q) >= self.max_rpm:
            logger.warning(
                "Rate limit exceeded",
                extra={"extra_data": {"client": client_host, "path": request.url.path}},
            )
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": f"Rate limit exceeded ({self.max_rpm} requests/min). Please retry shortly."
                },
            )
        q.append(now)

        # 2. Optional API key check (when OPTIONAL_API_KEY is configured in environment)
        if settings.optional_api_key and request.url.path.startswith("/api/"):
            if request.url.path != "/api/v1/health":
                provided_key = request.headers.get(settings.api_key_header, "")
                if provided_key != settings.optional_api_key:
                    return JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={"detail": "Invalid or missing API key."},
                    )

        # 3. Safe execution wrapper
        try:
            response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            return response
        except Exception as exc:
            logger.error(
                f"Unhandled server error on {request.url.path}: {exc}",
                exc_info=True,
            )
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "detail": "An internal operational error occurred while processing the request."
                },
            )
