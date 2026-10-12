"""Report.Photo: validate (count, type, size, real file signature) and store with random names."""
import uuid
from pathlib import Path

from starlette.datastructures import UploadFile

from app.core.config import settings
from app.core.errors import AppError

MAX_PHOTOS = 3
MAX_BYTES = 5 * 1024 * 1024
ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _signature_ok(content_type: str, data: bytes) -> bool:
    if content_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


async def read_and_validate(files: list[UploadFile]) -> list[tuple[bytes, str]]:
    """Returns [(bytes, extension)]. Never trusts the client filename."""
    if len(files) > MAX_PHOTOS:
        raise AppError("VALIDATION_ERROR", f"You can attach at most {MAX_PHOTOS} photos")
    out: list[tuple[bytes, str]] = []
    for f in files:
        ctype = (f.content_type or "").lower()
        if ctype not in ALLOWED:
            raise AppError("VALIDATION_ERROR", "Photos must be JPEG, PNG or WebP images")
        data = await f.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise AppError("VALIDATION_ERROR", "Each photo must be 5 MB or smaller")
        if not _signature_ok(ctype, data):
            raise AppError("VALIDATION_ERROR", "A photo does not look like a valid image file")
        out.append((data, ALLOWED[ctype]))
    return out


def save(blobs: list[tuple[bytes, str]]) -> list[str]:
    folder = Path(settings.UPLOAD_DIR)
    folder.mkdir(parents=True, exist_ok=True)
    names: list[str] = []
    for data, ext in blobs:
        name = f"{uuid.uuid4().hex}{ext}"
        (folder / name).write_bytes(data)
        names.append(name)
    return names


def delete(names: list[str]) -> None:
    for name in names:
        try:
            (Path(settings.UPLOAD_DIR) / name).unlink(missing_ok=True)
        except OSError:
            pass
