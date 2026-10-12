import importlib
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.errors import register_error_handlers

# Person B's routers are picked up automatically once their files exist.
_OPTIONAL_ROUTERS = ("teams", "dispatch", "team_portal")
_A_ROUTERS = ("auth", "incidents", "notifications")


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    app = FastAPI(title="DRRCP API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)

    for name in _A_ROUTERS:
        app.include_router(importlib.import_module(f"app.routers.{name}").router)
    for name in _OPTIONAL_ROUTERS:
        try:
            module = importlib.import_module(f"app.routers.{name}")
        except ModuleNotFoundError as exc:
            if exc.name != f"app.routers.{name}":
                raise
            continue
        app.include_router(module.router)

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    @app.get("/api/health", tags=["health"])
    def health():
        return {"status": "ok"}

    return app


app = create_app()
