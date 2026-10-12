from sqlalchemy import select

from app.models import Notification


def test_notifications_require_login(client):
    assert client.get("/api/notifications").status_code == 401


def test_new_report_notifies_every_active_coordinator_and_citizen(client, make_report, coordinator, db):
    from app.core.security import hash_password
    from app.models import Coordinator

    db.add(Coordinator(name="Off duty", email="off@test.local", phone_number="9000000009",
                       password_hash=hash_password("x"), is_active=False))
    db.commit()
    rid = make_report()["report_id"]
    notes = db.scalars(select(Notification).where(Notification.related_report_id == rid)).all()
    assert len(notes) == 2  # the one active coordinator + the citizen confirmation
    by_channel = {n.channel for n in notes}
    assert by_channel == {"in_app", "sms"}
    assert all(n.delivery_status == "sent" and n.sent_at is not None for n in notes)
    coord_note = next(n for n in notes if n.channel == "in_app")
    assert "New HIGH flood report" in coord_note.message
    citizen_note = next(n for n in notes if n.channel == "sms")
    assert "has been received" in citizen_note.message and "DRR-" in citizen_note.message


def test_list_mark_read_and_read_all(client, coord_headers, make_report):
    make_report()
    make_report(latitude=19.4)
    r = client.get("/api/notifications", headers=coord_headers).json()
    assert r["total"] == 2 and r["unread_count"] == 2 and r["page"] == 1

    first = r["items"][0]["id"]
    one = client.post(f"/api/notifications/{first}/read", headers=coord_headers)
    assert one.status_code == 200 and one.json()["is_read"] is True
    assert client.get("/api/notifications?unread_only=true", headers=coord_headers).json()["total"] == 1

    assert client.post("/api/notifications/read-all", headers=coord_headers).json() == {"updated": 1}
    assert client.get("/api/notifications", headers=coord_headers).json()["unread_count"] == 0


def test_cannot_read_someone_elses_notification(client, coord_headers, make_report, db):
    make_report()
    citizen_note = db.scalar(select(Notification).where(Notification.channel == "sms"))
    r = client.post(f"/api/notifications/{citizen_note.id}/read", headers=coord_headers)
    assert r.status_code == 404


def test_pagination(client, coord_headers, make_report):
    for i in range(3):
        make_report(latitude=19.1 + i)
    r = client.get("/api/notifications?page_size=2&page=2", headers=coord_headers).json()
    assert r["total"] == 3 and len(r["items"]) == 1
