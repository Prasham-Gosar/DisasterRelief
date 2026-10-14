"""Shared A + B test: the whole demo path through the real API, with the final state checked."""
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.rescue_team_member import RescueTeamMember
from app.seed import seed_dispatch
from tests.conftest import FLOOD

PHONE = FLOOD["reporter_phone"]


def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_report_to_close_end_to_end(client, coordinator, coord_headers, db):
    seed_dispatch(db)
    db.commit()

    # 1. anonymous citizen reports
    made = client.post("/api/incidents", json=FLOOD).json()
    rid, ref = made["report_id"], made["tracking_ref"]
    assert ref.startswith("DRR-") and made["status"] == "reported"

    # 2. coordinator verifies, citizen is told
    assert client.post(f"/api/incidents/{rid}/verify", headers=coord_headers).json()["status"] == "verified"

    # 3. coordinator assigns the nearest suitable team
    assigned = client.post(f"/api/incidents/{rid}/assign", headers=coord_headers)
    assert assigned.status_code == 201
    info = assigned.json()["assignments"][0]
    assignment_id, team_id = info["assignment_id"], info["team"]["id"]

    # 4. a member of that team works the task: en route -> on site -> resolved
    member = db.scalar(select(RescueTeamMember).where(RescueTeamMember.team_id == team_id))
    team_headers = _login(client, member.email, "Rescue@123")
    for body in ({"status": "en_route"}, {"status": "on_site"}, {"status": "resolved", "closing_note": "Water pumped out, road clear"}):
        r = client.post(f"/api/team/tasks/{assignment_id}/status", headers=team_headers, json=body)
        assert r.status_code == 200, r.text

    # 5. coordinator closes
    closed = client.post(f"/api/incidents/{rid}/close", headers=coord_headers, json={"closing_note": "Verified on the ground"})
    assert closed.json()["status"] == "closed"

    # final state: audit trail
    db.expire_all()
    rows = list(db.scalars(select(AuditLog).where(AuditLog.entity_type == "incident_report", AuditLog.entity_id == rid).order_by(AuditLog.id)))
    # dispatch writes two `assign` rows: the state change, and one that names the team sent
    actions = [a.action for a in rows]
    assert actions == ["create", "verify", "assign", "assign", "en_route", "resolve", "close"]
    assert any(a.action == "assign" and a.remark for a in rows)

    # final state: the citizen was told at each later step (SD msg 10), and sees it on the track page
    citizen_msgs = [n["message"] for n in client.get(f"/api/incidents/track/{ref}/notifications", params={"phone": PHONE}).json()]
    for fragment in ("received", "verified", "assigned", "on the way", "resolved", "closed"):
        assert any(fragment in m for m in citizen_msgs), f"missing citizen message containing {fragment!r}: {citizen_msgs}"

    # coordinators were alerted about the new report and the deployment
    alerts = {n.alert_type for n in db.scalars(select(Notification).where(Notification.recipient_user_id == coordinator.id))}
    assert {"new_report", "team_deployed"} <= alerts

    # the citizen's track view ends on closed with a full timeline
    view = client.get(f"/api/incidents/track/{ref}", params={"phone": PHONE}).json()
    assert view["status"] == "closed" and view["editable"] is False
    assert [t["action"] for t in view["timeline"]][-1] == "close"
