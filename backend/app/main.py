from __future__ import annotations

import logging
from pathlib import Path

import sentry_sdk
import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles

from app.config import settings
from app.routers import (
    auth, apartments, rooms, catalog, leads, media, estimate, draft_rooms, ai, meshy,
    wallpapers, electrical, decoration, finishes, furniture_placements, room_state,
    orders, currency,
)


def _configure_structlog() -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title="UyTa'mir API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # ------------------------------------------------------------------
    # CORS
    # ------------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------
    # Routers
    # ------------------------------------------------------------------
    app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
    app.include_router(apartments.router, prefix="/api/v1", tags=["apartments"])
    app.include_router(rooms.router, prefix="/api/v1", tags=["rooms"])
    app.include_router(catalog.router, prefix="/api/v1", tags=["catalog"])
    app.include_router(leads.router, prefix="/api/v1", tags=["leads"])
    app.include_router(media.router, prefix="/api/v1", tags=["media"])
    app.include_router(estimate.router, prefix="/api/v1", tags=["estimate"])
    app.include_router(estimate.estimates_router, prefix="/api/v1", tags=["estimate"])
    app.include_router(draft_rooms.router, prefix="/api/v1", tags=["draft-rooms"])
    app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
    app.include_router(meshy.router, tags=["meshy"])
    app.include_router(wallpapers.router, prefix="/api/v1", tags=["wallpapers"])
    app.include_router(electrical.router, prefix="/api/v1", tags=["electrical"])
    app.include_router(decoration.router, prefix="/api/v1", tags=["decoration"])
    app.include_router(finishes.router, prefix="/api/v1", tags=["finishes"])
    app.include_router(furniture_placements.router, prefix="/api/v1", tags=["furniture"])
    app.include_router(room_state.router, prefix="/api/v1", tags=["room-state"])
    app.include_router(orders.router, prefix="/api/v1", tags=["orders"])
    app.include_router(currency.router, prefix="/api/v1", tags=["currency"])

    # ------------------------------------------------------------------
    # Uploaded media (wallpapers, photos) when object storage is not set up.
    # Mounted unconditionally so a library uploaded locally keeps serving
    # even after S3 credentials are added later.
    # ------------------------------------------------------------------
    media_root = Path(settings.MEDIA_ROOT)
    media_root.mkdir(parents=True, exist_ok=True)
    app.mount(
        settings.MEDIA_URL_PREFIX,
        StaticFiles(directory=str(media_root)),
        name="media",
    )

    # ------------------------------------------------------------------
    # Startup
    # ------------------------------------------------------------------
    @app.on_event("startup")
    async def on_startup() -> None:
        _configure_structlog()

        if settings.SENTRY_DSN:
            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                environment=settings.ENVIRONMENT,
                traces_sample_rate=0.2,
            )

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------
    @app.get("/health", tags=["system"])
    async def health_check() -> dict:
        return {"status": "ok", "environment": settings.ENVIRONMENT}

    # ------------------------------------------------------------------
    # Exception handlers
    # ------------------------------------------------------------------
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = []
        for error in exc.errors():
            error_dict = {
                "loc": list(error.get("loc", [])),
                "msg": str(error.get("msg", "")),
                "type": str(error.get("type", "")),
            }
            errors.append(error_dict)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": errors},
        )

    @app.exception_handler(404)
    async def not_found_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Not found"},
        )

    return app


app = create_app()
