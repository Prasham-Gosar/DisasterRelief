"""AppError + handlers producing the shared error JSON (contract section 0.7):

    { "error": { "code": "...", "message": "...", "details": {} } }
"""
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

DEFAULT_STATUS = {
    "VALIDATION_ERROR": 422,
    "UNAUTHENTICATED": 401,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "INVALID_TRANSITION": 409,
    "TEAM_NOT_AVAILABLE": 409,
    "NO_TEAM_AVAILABLE": 409,
    "REMARK_REQUIRED": 422,
    "REPORT_NOT_EDITABLE": 409,
}


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int | None = None, details: dict[str, Any] | None = None):
        self.code = code
        self.message = message
        self.status = status or DEFAULT_STATUS.get(code, 400)
        self.details = details or {}
        super().__init__(message)


def _body(code: str, message: str, details: Any = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details if details is not None else {}}}


_HTTP_CODES = {
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status, content=_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        errors = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"], "type": e["type"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder(_body("VALIDATION_ERROR", "Some fields are invalid", {"errors": errors})),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(status_code=exc.status_code, content=_body(code, str(exc.detail)))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        return JSONResponse(status_code=500, content=_body("INTERNAL_ERROR", "Something went wrong on the server"))
