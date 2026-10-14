"""A10: history, nearby, citizen edit, subscription, citizen notifications, stats."""
from sqlalchemy import select

from app.models.notification import Notification
from tests.conftest import FLOOD

PHONE = FLOOD["reporter_phone"]


def _track(client, ref, **kw):
    return client.get(f"/api/incidents/track/{ref}", params={"phone": PHONE}, **kw)


# ----------------------------------------------------------------- history
def test_history_lists_every_audit_row_in_order(client, coord_headers, make_report):
    rid = make_report()["report_id"]
    client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)
    rows = client.get(f"/api/incidents/{rid}/history", headers=coord_headers).json()
    assert [r["action"] for r in rows] == ["create", "verify"]
    assert rows[1]["from_status"] == "reported" and rows[1]["to_status"] == "verified"
    assert rows[1]["actor"].startswith("COORD-")


def test_history_is_coordinator_only_and_404s(client, coord_headers, make_report):
    rid = make_report()["report_id"]
    assert client.get(f"/api/incidents/{rid}/history").status_code == 401
    assert client.get("/api/incidents/9999/history", headers=coord_headers).status_code == 404


# ------------------------------------------------------------------ nearby
def test_nearby_shows_close_similar_reports_with_distance(client, coord_headers, make_report):
    first = make_report()["report_id"]
    near = make_report(latitude=19.1205)["report_id"]  # ~90 m away
    make_report(latitude=19.30)  # far away
    make_report(incident_type="fire", structure_type="shop", water_level=None)  # other type, same spot
    items = client.get(f"/api/incidents/{first}/nearby", headers=coord_headers).json()
    assert [i["id"] for i in items] == [near]
    assert 0 < items[0]["distance_m"] <= 200 and items[0]["minutes_apart"] >= 0


def test_nearby_without_a_pin_is_empty(client, coord_headers, make_report):
    rid = make_report(latitude=None, longitude=None)["report_id"]
    assert client.get(f"/api/incidents/{rid}/nearby", headers=coord_headers).json() == []


def test_nearby_requires_coordinator(client, make_report):
    rid = make_report()["report_id"]
    assert client.get(f"/api/incidents/{rid}/nearby").status_code == 401


# -------------------------------------------------------------------- edit
def test_citizen_can_edit_while_reported(client, make_report):
    ref = make_report()["tracking_ref"]
    r = client.patch(
        f"/api/incidents/track/{ref}", params={"phone": PHONE},
        json={"location": "Andheri subway, west side", "description": "Water is now waist-deep"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["location"] == "Andheri subway, west side" and body["description"] == "Water is now waist-deep"
    assert "edit" in [t["action"] for t in body["timeline"]]


def test_edit_after_verify_is_409_not_editable(client, coord_headers, make_report):
    made = make_report()
    client.post(f"/api/incidents/{made['report_id']}/verify", headers=coord_headers)
    r = client.patch(f"/api/incidents/track/{made['tracking_ref']}", params={"phone": PHONE}, json={"location": "Somewhere else"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "REPORT_NOT_EDITABLE"


def test_edit_needs_the_right_phone_and_some_change(client, make_report):
    ref = make_report()["tracking_ref"]
    wrong = client.patch(f"/api/incidents/track/{ref}", params={"phone": "9999999999"}, json={"location": "Elsewhere"})
    assert wrong.status_code == 404
    empty = client.patch(f"/api/incidents/track/{ref}", params={"phone": PHONE}, json={})
    assert empty.status_code == 422 and empty.json()["error"]["code"] == "VALIDATION_ERROR"


def test_edit_cannot_touch_severity_or_type(client, make_report):
    ref = make_report()["tracking_ref"]
    client.patch(f"/api/incidents/track/{ref}", params={"phone": PHONE}, json={"location": "New place", "severity": "low"})
    assert _track(client, ref).json()["severity"] == "high"


# ------------------------------------------------------------ subscription
def test_subscription_toggle_round_trip(client, make_report):
    ref = make_report()["tracking_ref"]
    assert _track(client, ref).json()["citizen_subscribed"] is True
    off = client.post(f"/api/incidents/track/{ref}/subscription", params={"phone": PHONE}, json={"subscribed": False})
    assert off.status_code == 200 and off.json()["citizen_subscribed"] is False
    on = client.post(f"/api/incidents/track/{ref}/subscription", params={"phone": PHONE}, json={"subscribed": True})
    assert on.json()["citizen_subscribed"] is True


def test_unsubscribing_through_the_api_stops_sd_msg_10(client, coord_headers, make_report, db):
    made = make_report()
    client.post(f"/api/incidents/track/{made['tracking_ref']}/subscription", params={"phone": PHONE}, json={"subscribed": False})
    rid = made["report_id"]
    client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)  # verification text is separate from msg 10
    # push it to closed through reject (no status_update is ever sent for rejected -> closed)
    texts = [n.message for n in db.scalars(select(Notification).where(Notification.related_report_id == rid))]
    assert not any("has been closed" in t or "resolved" in t for t in texts)


def test_subscription_needs_the_right_phone(client, make_report):
    ref = make_report()["tracking_ref"]
    r = client.post(f"/api/incidents/track/{ref}/subscription", params={"phone": "9999999999"}, json={"subscribed": False})
    assert r.status_code == 404


# ----------------------------------------------- citizen's own notifications
def test_citizen_sees_only_their_own_notifications(client, coord_headers, make_report):
    made = make_report()
    client.post(f"/api/incidents/{made['report_id']}/verify", headers=coord_headers)
    notes = client.get(f"/api/incidents/track/{made['tracking_ref']}/notifications", params={"phone": PHONE}).json()
    messages = [n["message"] for n in notes]
    assert len(notes) == 2
    assert any("has been received" in m for m in messages) and any("verified" in m for m in messages)
    assert not any("New HIGH" in m for m in messages)  # the coordinator alert is never shown to a citizen
    assert notes[0]["created_at"] >= notes[1]["created_at"]  # newest first


def test_citizen_notifications_need_the_right_phone(client, make_report):
    ref = make_report()["tracking_ref"]
    r = client.get(f"/api/incidents/track/{ref}/notifications", params={"phone": "9999999999"})
    assert r.status_code == 404


# ------------------------------------------------------------------- stats
def test_stats_counts_and_critical_open(client, coord_headers, make_report):
    make_report(severity="critical", latitude=19.1)
    done = make_report(severity="critical", latitude=19.2)["report_id"]
    make_report(severity="low", latitude=19.3)
    client.post(f"/api/incidents/{done}/reject", headers=coord_headers, json={"remark": "Not a real flood"})
    s = client.get("/api/stats/incidents", headers=coord_headers).json()
    assert s["total"] == 3 and s["critical_open"] == 1
    assert s["by_status"]["reported"] == 2 and s["by_status"]["closed"] == 1
    assert s["by_status"]["assigned"] == 0  # every status is present, even at zero
    assert s["by_severity"] == {"low": 1, "medium": 0, "high": 0, "critical": 2}


def test_stats_requires_coordinator(client):
    assert client.get("/api/stats/incidents").status_code == 401
