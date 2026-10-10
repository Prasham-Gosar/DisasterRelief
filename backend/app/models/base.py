from abc import ABCMeta
from datetime import datetime, timezone

from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm.decl_api import DeclarativeAttributeIntercept


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class _BaseMeta(DeclarativeAttributeIntercept, ABCMeta):
    """Lets a mapped class also be an ABC (IncidentReport is an abstract «interface»)."""


class Base(DeclarativeBase, metaclass=_BaseMeta):
    pass
