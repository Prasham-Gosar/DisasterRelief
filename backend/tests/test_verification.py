from sqlalchemy import select

from app.models import AuditLog, IncidentReport


def test_coordinator_verifies(client, coord_headers, make_report, db):
    rid = make_report()["report_id"]
    r = client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "verified" and r.json()["verified_by"] == "Coord"
    assert db.get(IncidentReport, rid).verified_at is not None


def test_anonymous_cannot_verify(client, make_report):  # BR-1
    rid = make_report()["report_id"]
    r = client.post(f"/api/incidents/{rid}/verify")
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_non_coordinator_cannot_verify_or_reject(client, make_report, db):  # BR-1
    from app.core.security import hash_password
    from app.models import SystemAdministrator

    db.add(SystemAdministrator(name="Admin", email="a@test.local", password_hash=hash_password("Admin@123")))
    db.commit()
    token = client.post("/api/auth/login", json={"email": "a@test.local", "password": "Admin@123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    rid = make_report()["report_id"]
    assert client.post(f"/api/incidents/{rid}/verify", headers=headers).status_code == 403
    assert client.post(f"/api/incidents/{rid}/reject", headers=headers, json={"remark": "no way"}).status_code == 403


def test_model_enforces_br1_too(db, citizen_user, make_report):
    import pytest

    from app.core.errors import AppError

    report = db.get(IncidentReport, make_report()["report_id"])
    with pytest.raises(AppError) as exc:
        report.verify(citizen_user)
    assert exc.value.code == "FORBIDDEN"


def test_reject_without_remark_is_422(client, coord_headers, make_report):
    rid = make_report()["report_id"]
    for body in ({}, {"remark": ""}, {"remark": "no"}, {"remark": "     "}):
        r = client.post(f"/api/incidents/{rid}/reject", headers=coord_headers, json=body)
        assert r.status_code == 422 and r.json()["error"]["code"] == "REMARK_REQUIRED", body


def test_reject_with_remark_closes_and_notifies_citizen(client, coord_headers, make_report, db):
    rid = make_report()["report_id"]
    r = client.post(f"/api/incidents/{rid}/reject", headers=coord_headers, json={"remark": "Duplicate of an earlier report"})
    assert r.status_code == 200
    assert r.json()["status"] == "closed" and r.json()["remark"] == "Duplicate of an earlier report"
    from app.models import Notification

    notes = db.scalars(select(Notification).where(Notification.alert_type == "rejection")).all()
    assert len(notes) == 1 and "Duplicate of an earlier report" in notes[0].message
    assert notes[0].channel == "sms"


def test_verify_notifies_citizen(client, coord_headers, make_report, db):
    from app.models import Notification

    rid = make_report()["report_id"]
    client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)
    notes = db.scalars(select(Notification).where(Notification.alert_type == "verification")).all()
    assert len(notes) == 1 and "has been verified" in notes[0].message


def test_invalid_transitions_return_409(client, coord_headers, make_report):
    rid = make_report()["report_id"]
    client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)
    again = client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)
    assert again.status_code == 409 and again.json()["error"]["code"] == "INVALID_TRANSITION"

    rid2 = make_report(latitude=19.4)["report_id"]
    client.post(f"/api/incidents/{rid2}/reject", headers=coord_headers, json={"remark": "false alarm here"})
    assert client.post(f"/api/incidents/{rid2}/verify", headers=coord_headers).status_code == 409  # closed -> verified
    assert client.post(f"/api/incidents/{rid2}/reject", headers=coord_headers, json={"remark": "again again"}).status_code == 409


def test_close_only_from_resolved(client, coord_headers, make_report, db, coordinator):
    rid = make_report()["report_id"]
    assert client.post(f"/api/incidents/{rid}/close", headers=coord_headers).status_code == 409
    report = db.get(IncidentReport, rid)
    report.verify(coordinator)
    report.transition("assigned", coordinator)
    report.transition("in_progress", None)
    report.transition("resolved", None)
    db.commit()
    r = client.post(f"/api/incidents/{rid}/close", headers=coord_headers, json={"closing_note": "All clear"})
    assert r.status_code == 200 and r.json()["status"] == "closed" and r.json()["closing_note"] == "All clear"


def test_unknown_report_is_404(client, coord_headers):
    assert client.post("/api/incidents/9999/verify", headers=coord_headers).status_code == 404
    assert client.get("/api/incidents/9999", headers=coord_headers).json()["error"]["code"] == "NOT_FOUND"


def test_every_transition_writes_an_audit_row(client, coord_headers, make_report, db):
    rid = make_report()["report_id"]
    client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)
    rows = db.scalars(select(AuditLog).where(AuditLog.entity_id == rid).order_by(AuditLog.id)).all()
    assert [(r.action, r.from_status, r.to_status) for r in rows] == [
        ("create", None, "reported"),
        ("verify", "reported", "verified"),
    ]
    assert rows[1].actor_user_id is not None and rows[1].actor_label.startswith("COORD-")

    rid2 = make_report(latitude=19.4)["report_id"]
    client.post(f"/api/incidents/{rid2}/reject", headers=coord_headers, json={"remark": "false alarm here"})
    actions = [r.action for r in db.scalars(select(AuditLog).where(AuditLog.entity_id == rid2).order_by(AuditLog.id))]
    assert actions == ["create", "reject", "close"]


def test_subscribed_citizen_gets_status_updates_sd_msg_10(client, coord_headers, make_report, db, coordinator):
    from app.models import Notification

    rid = make_report()["report_id"]
    report = db.get(IncidentReport, rid)
    report.verify(coordinator)
    report.transition("assigned", coordinator)  # what Person B's dispatch will call
    db.commit()
    updates = db.scalars(select(Notification).where(Notification.alert_type == "status_update")).all()
    assert len(updates) == 1 and "team has been assigned" in updates[0].message


def test_unsubscribed_citizen_gets_no_status_updates(client, make_report, db, coordinator):
    from app.models import Notification

    rid = make_report()["report_id"]
    report = db.get(IncidentReport, rid)
    report.citizen_subscribed = False
    report.verify(coordinator)
    report.transition("assigned", coordinator)
    db.commit()
    assert db.scalars(select(Notification).where(Notification.alert_type == "status_update")).all() == []
