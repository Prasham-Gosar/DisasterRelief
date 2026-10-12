"""Test setup: a throwaway SQLite database + upload folder, never your real Postgres."""
import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="drrcp-tests-").replace("\\", "/")  # forward slashes: safe in a SQLite URL on Windows
# Must be set BEFORE the app is imported (environment variables beat backend/.env).
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.sqlite"
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, Citizen, Coordinator  # noqa: E402

FLOOD = {
    "incident_type": "flood",
    "location": "Near Andheri subway, Mumbai",
    "latitude": 19.1197,
    "longitude": 72.8468,
    "severity": "high",
    "description": "Water rising fast, cars stuck",
    "reporter_name": "Asha",
    "reporter_phone": "9876543210",
    "water_level": "knee-deep",
}

# tiny but real file signatures
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def coordinator(db):
    user = Coordinator(name="Coord", email="coord@test.local", phone_number="9000000001",
                       password_hash=hash_password("Coord@123"))
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def coord_headers(client, coordinator):
    r = client.post("/api/auth/login", json={"email": "coord@test.local", "password": "Coord@123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def citizen_user(db):
    user = Citizen(name="Citizen", phone_number="9111111111")
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def make_report(client):
    def _make(**overrides):
        body = {**FLOOD, **overrides}
        r = client.post("/api/incidents", json=body)
        assert r.status_code == 201, r.text
        return r.json()

    return _make
