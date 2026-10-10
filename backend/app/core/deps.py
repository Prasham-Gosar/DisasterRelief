from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.enums import Role
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.models.user import User

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """JWT -> User. Raises 401 UNAUTHENTICATED."""
    if creds is None:
        raise AppError("UNAUTHENTICATED", "Please log in")
    claims = decode_access_token(creds.credentials)
    try:
        user_id = int(claims["sub"])
    except (KeyError, ValueError):
        raise AppError("UNAUTHENTICATED", "Invalid token")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError("UNAUTHENTICATED", "Account not found or disabled")
    return user


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if creds is None:
        return None
    return get_current_user(creds, db)


def require_role(*roles: Role):
    """FastAPI dependency factory: only the listed roles may pass, else 403 FORBIDDEN."""
    allowed = {Role(r).value for r in roles}

    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise AppError("FORBIDDEN", "You are not allowed to do this")
        return user

    return _dep
