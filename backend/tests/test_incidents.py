import json
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.enums import IncidentType
from app.core.errors import AppError
from app.models import Citizen, FireIncident, FloodIncident, IncidentFactory, IncidentReport, MedicalEmergencyIncident
from app.models.base import utcnow
from tests.conftest import FLOOD, JPEG, PNG


def test_incident_report_is_abstract():
    with pytest.raises(TypeError):
        IncidentReport()


def test_factory_picks_the_right_subclass():
    assert type(IncidentFactory.create(IncidentType.flood, location="x")) is FloodIncident
    assert type(IncidentFactory.create("fire", location="x")) is FireIncident
    assert type(IncidentFactory.create("medical", location="x")) is MedicalEmergencyIncident
    with pytest.raises(AppError):
        IncidentFactory.create("earthquake")


def test_anonymous_submit_creates_report_and_citizen(client, db):
    r = client.post("/api/incidents", json=FLOOD)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "reported" and body["possible_duplicate"] is False
    assert body["tracking_ref"] == f"DRR-{utcnow().year}-{body['report_id']:06d}"
    citizen = db.scalar(select(Citizen).where(Citizen.phone_number == "9876543210"))
    assert citizen is not None and citizen.name == "Asha"
    assert isinstance(db.get(IncidentReport, body["report_id"]), FloodIncident)


def test_same_phone_reuses_the_citizen(client, db):
    client.post("/api/incidents", json=FLOOD)
    client.post("/api/incidents", json={**FLOOD, "latitude": 19.3})
    assert len(db.scalars(select(Citizen)).all()) == 1


@pytest.mark.parametrize(
    "changes, missing",
    [
        ({"water_level": None}, "water_level"),
        ({"structure_type": "residential"}, "structure_type"),  # flood must not carry fire fields
        ({"reporter_phone": "12345"}, "reporter_phone"),
        ({"location": "ab"}, "location"),
        ({"description": "hey"}, "description"),
        ({"latitude": 123.0}, "latitude"),
        ({"severity": "extreme"}, "severity"),
    ],
)
def test_validation_errors_use_shared_format(client, changes, missing):
    body = {**FLOOD, **changes}
    body = {k: v for k, v in body.items() if v is not None}
    r = client.post("/api/incidents", json=body)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_type_specific_field_required_per_type(client):
    base = {k: v for k, v in FLOOD.items() if k != "water_level"}
    fire = {**base, "incident_type": "fire"}
    assert client.post("/api/incidents", json=fire).status_code == 422
    assert client.post("/api/incidents", json={**fire, "structure_type": "residential"}).status_code == 201
    med = {**base, "incident_type": "medical"}
    assert client.post("/api/incidents", json={**med, "casualty_count": -1}).status_code == 422
    assert client.post("/api/incidents", json={**med, "casualty_count": 0}).status_code == 201


def test_phone_is_normalised(client, db):
    client.post("/api/incidents", json={**FLOOD, "reporter_phone": "+91 98765-43210"})
    assert db.scalar(select(IncidentReport.reporter_phone)) == "9876543210"


# ------------------------------------------------------------ duplicate check
def _age_report(db, report_id, **delta):
    report = db.get(IncidentReport, report_id)
    report.created_at = utcnow() - timedelta(**delta)
    db.commit()


def test_duplicate_150m_1h_is_flagged(client, db, make_report):
    first = make_report()
    _age_report(db, first["report_id"], hours=1)
    second = make_report(latitude=FLOOD["latitude"] + 0.00135)  # ~150 m north
    assert second["possible_duplicate"] is True
    assert db.get(IncidentReport, second["report_id"]).duplicate_of_id == first["report_id"]


def test_300m_is_not_flagged(client, make_report):
    make_report()
    assert make_report(latitude=FLOOD["latitude"] + 0.0027)["possible_duplicate"] is False


def test_3h_old_is_not_flagged(client, db, make_report):
    first = make_report()
    _age_report(db, first["report_id"], hours=3)
    assert make_report()["possible_duplicate"] is False


def test_other_type_nearby_is_not_a_duplicate(client, make_report):
    make_report()
    fire = {k: v for k, v in FLOOD.items() if k != "water_level"}
    r = client.post("/api/incidents", json={**fire, "incident_type": "fire", "structure_type": "shop"})
    assert r.json()["possible_duplicate"] is False


def test_duplicate_is_still_saved(client, db, make_report):
    make_report()
    make_report()
    assert len(db.scalars(select(IncidentReport)).all()) == 2


# --------------------------------------------------------------------- photos
def _multipart(client, files, data=None):
    return client.post("/api/incidents", data={"data": json.dumps(data or FLOOD)}, files=files)


def test_photo_upload_saved_with_random_name(client, db):
    r = _multipart(client, [("photos", ("../../evil.jpg", JPEG, "image/jpeg")), ("photos", ("b.png", PNG, "image/png"))])
    assert r.status_code == 201, r.text
    photos = db.get(IncidentReport, r.json()["report_id"]).photos
    assert len(photos) == 2
    assert all("evil" not in p and "/" not in p for p in photos)
    assert photos[0].endswith(".jpg") and photos[1].endswith(".png")


def test_fourth_photo_rejected(client):
    files = [("photos", (f"{i}.jpg", JPEG, "image/jpeg")) for i in range(4)]
    r = _multipart(client, files)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_wrong_mime_rejected(client):
    r = _multipart(client, [("photos", ("a.pdf", b"%PDF-1.4", "application/pdf"))])
    assert r.status_code == 422


def test_fake_image_content_rejected(client):
    r = _multipart(client, [("photos", ("a.jpg", b"not really a jpeg", "image/jpeg"))])
    assert r.status_code == 422


def test_oversized_photo_rejected(client):
    big = b"\xff\xd8\xff" + b"0" * (5 * 1024 * 1024 + 10)
    assert _multipart(client, [("photos", ("a.jpg", big, "image/jpeg"))]).status_code == 422


def test_multipart_without_data_is_422(client):
    r = client.post("/api/incidents", files=[("photos", ("a.jpg", JPEG, "image/jpeg"))])
    assert r.status_code == 422
