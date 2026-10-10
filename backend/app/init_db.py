"""python -m app.init_db  ->  create all tables (no Alembic in the 3-day plan)."""
from app.core.database import engine
from app.models import Base


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    print("Tables created:", ", ".join(sorted(Base.metadata.tables)))


if __name__ == "__main__":
    init_db()
