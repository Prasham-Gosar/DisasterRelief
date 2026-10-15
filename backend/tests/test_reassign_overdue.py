from datetime import timedelta
import pytest
from sqlalchemy import select

from app.core.enums import AlertType, AssignmentStatus, IncidentStatus, MemberStatus, Role, TeamStatus
from app.core.security import hash_password
from app.models.app_setting import AppSetting
from app.models.audit_log import AuditLog
from app.models.base import utcnow
from app.models.incident import IncidentReport
from app.models.notification import Notification
from app.models.rescue_team import RescueTeam
from app.models.rescue_team_member import RescueTeamMember
from app.models.team_assignment import TeamAssignment
from app.models.user import Citizen
from app.seed import seed_dispatch


@pytest.fixture
def seeded_teams(db):
    seed_dispatch(db)
    db.commit()


@pytest.fixture
def verified_report(client, coord_headers, make_report):
    rep = make_report()
    rid = rep["report_id"]
    r = client.post(f"/api/incidents/{rid}/verify", headers=coord_headers)
    assert r.status_code == 200
    return rid


@pytest.fixture
def rescue_member_headers(client, seeded_teams):
    r = client.post("/api/auth/login", json={"email": "fire.alpha1@drrcp.test", "password": "Rescue@123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def other_team_member_headers(client, seeded_teams):
    r = client.post("/api/auth/login", json={"email": "fire.beta1@drrcp.test", "password": "Rescue@123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# -----------------------------------------------------------------------------
# 1. Reassign keeps history and audits reassign
# -----------------------------------------------------------------------------
def test_reassign_happy_path(client, coord_headers, verified_report, seeded_teams, db):
    # Assign NDRF Team Charlie first
    charlie = db.scalar(select(RescueTeam).where(RescueTeam.name == "NDRF Team Charlie"))
    delta = db.scalar(select(RescueTeam).where(RescueTeam.name == "Local Rescue Delta"))

    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [charlie.id]},
    )
    assert r_assign.status_code == 201
    old_assignment_id = r_assign.json()["assignments"][0]["assignment_id"]

    # Reassign from Charlie to Delta with a reason
    reason = "Specialized local boat rescue equipment needed"
    r_reassign = client.post(
        f"/api/incidents/{verified_report}/reassign",
        headers=coord_headers,
        json={
            "from_team_id": charlie.id,
            "to_team_id": delta.id,
            "reason": reason,
        },
    )
    assert r_reassign.status_code == 200, r_reassign.text
    data = r_reassign.json()

    assert data["report_id"] == verified_report
    assert data["report_status"] == IncidentStatus.assigned.value
    assert data["replaced_assignment_id"] == old_assignment_id
    assert len(data["assignments"]) == 1

    new_assignment_id = data["assignments"][0]["assignment_id"]
    assert new_assignment_id != old_assignment_id
    assert data["assignments"][0]["team"]["id"] == delta.id
    assert data["assignments"][0]["team"]["status"] == TeamStatus.deployed.value

    # Verify Old Assignment DB state
    db.expire_all()
    old_a = db.get(TeamAssignment, old_assignment_id)
    assert old_a.status == AssignmentStatus.reassigned.value
    assert old_a.reassign_reason == reason
    assert old_a.replaced_by_id == new_assignment_id

    # Old team and members available
    old_team = db.get(RescueTeam, charlie.id)
    assert old_team.status == TeamStatus.available.value
    for m in old_team.members:
        assert m.member_status == MemberStatus.available.value

    # New team deployed and members assigned
    new_team = db.get(RescueTeam, delta.id)
    assert new_team.status == TeamStatus.deployed.value
    for m in new_team.members:
        assert m.member_status == MemberStatus.assigned.value

    # Report still assigned
    report = db.get(IncidentReport, verified_report)
    assert report.status == IncidentStatus.assigned.value

    # Audit log contains "reassign"
    audits = list(
        db.scalars(
            select(AuditLog).where(
                AuditLog.entity_type == "incident_report",
                AuditLog.entity_id == verified_report,
            )
        ).all()
    )
    actions = [a.action for a in audits]
    assert "reassign" in actions
    reassign_audit = [a for a in audits if a.action == "reassign"][0]
    assert reassign_audit.remark == reason

    # Old team received cancellation notification
    notes = list(db.scalars(select(Notification)).all())
    cancelled_notes = [n for n in notes if f"Task cancelled: {report.tracking_ref} reassigned" in n.message]
    assert len(cancelled_notes) > 0


# -----------------------------------------------------------------------------
# 2. Reassign with no other team available -> NO_TEAM_AVAILABLE, old unchanged
# -----------------------------------------------------------------------------
def test_reassign_no_team_available(client, coord_headers, verified_report, seeded_teams, db):
    charlie = db.scalar(select(RescueTeam).where(RescueTeam.name == "NDRF Team Charlie"))
    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [charlie.id]},
    )
    assert r_assign.status_code == 201
    old_assignment_id = r_assign.json()["assignments"][0]["assignment_id"]

    # Deploy all other teams
    other_teams = list(db.scalars(select(RescueTeam).where(RescueTeam.id != charlie.id)).all())
    for t in other_teams:
        t.status = TeamStatus.deployed.value
    db.commit()

    # Reassign without specifying to_team_id
    r_reassign = client.post(
        f"/api/incidents/{verified_report}/reassign",
        headers=coord_headers,
        json={
            "from_team_id": charlie.id,
            "to_team_id": None,
            "reason": "Team needs relief urgently",
        },
    )
    assert r_reassign.status_code == 409
    assert r_reassign.json()["error"]["code"] == "NO_TEAM_AVAILABLE"

    # Old assignment remains untouched
    db.expire_all()
    old_a = db.get(TeamAssignment, old_assignment_id)
    assert old_a.status == AssignmentStatus.assigned.value
    assert old_a.replaced_by_id is None

    # Charlie still deployed
    charlie_db = db.get(RescueTeam, charlie.id)
    assert charlie_db.status == TeamStatus.deployed.value

    # Alert notification was created
    notes = list(
        db.scalars(
            select(Notification).where(Notification.alert_type == AlertType.no_team_available.value)
        ).all()
    )
    assert len(notes) > 0


# -----------------------------------------------------------------------------
# 3. Reassign without a reason -> REMARK_REQUIRED
# -----------------------------------------------------------------------------
def test_reassign_without_reason_rejected(client, coord_headers, verified_report, seeded_teams, db):
    charlie = db.scalar(select(RescueTeam).where(RescueTeam.name == "NDRF Team Charlie"))
    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [charlie.id]},
    )
    assert r_assign.status_code == 201

    r_short = client.post(
        f"/api/incidents/{verified_report}/reassign",
        headers=coord_headers,
        json={
            "from_team_id": charlie.id,
            "reason": "bad",
        },
    )
    assert r_short.status_code == 422
    assert r_short.json()["error"]["code"] == "REMARK_REQUIRED"


# -----------------------------------------------------------------------------
# 4. Overdue detection, notification created once, not overdue after on_site
# -----------------------------------------------------------------------------
def test_overdue_detection_lifecycle(client, coord_headers, verified_report, seeded_teams, db):
    # Set overdue threshold to 10 minutes
    r_set = client.put(
        "/api/dispatch/settings",
        headers=coord_headers,
        json={"overdue_minutes": 10},
    )
    assert r_set.status_code == 200
    assert r_set.json()["overdue_minutes"] == 10

    # Assign team
    team = db.scalar(select(RescueTeam).where(RescueTeam.name == "NDRF Team Charlie"))
    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [team.id]},
    )
    assert r_assign.status_code == 201
    aid = r_assign.json()["assignments"][0]["assignment_id"]

    # Backdate assigned_at by 25 minutes (past the 10 minute threshold)
    assignment = db.get(TeamAssignment, aid)
    assignment.assigned_at = utcnow() - timedelta(minutes=25)
    db.commit()

    # Query assignments -> triggers overdue check
    r_list = client.get("/api/dispatch/assignments", headers=coord_headers)
    assert r_list.status_code == 200
    items = r_list.json()["items"]
    target = [i for i in items if i["assignment_id"] == aid][0]
    assert target["overdue"] is True
    assert target["overdue_minutes"] >= 14

    # GET /api/dispatch/overdue
    r_overdue = client.get("/api/dispatch/overdue", headers=coord_headers)
    assert r_overdue.status_code == 200
    overdue_ids = [i["assignment_id"] for i in r_overdue.json()["items"]]
    assert aid in overdue_ids

    # Notification created for coordinator
    db.expire_all()
    overdue_notes = list(
        db.scalars(
            select(Notification).where(Notification.alert_type == AlertType.overdue.value)
        ).all()
    )
    assert len(overdue_notes) == 1
    assert "NDRF Team Charlie has not reached" in overdue_notes[0].message
    assert "after 10 minutes" in overdue_notes[0].message

    # Call again -> Notification is NOT duplicated
    client.get("/api/dispatch/assignments", headers=coord_headers)
    db.expire_all()
    overdue_notes_2 = list(
        db.scalars(
            select(Notification).where(Notification.alert_type == AlertType.overdue.value)
        ).all()
    )
    assert len(overdue_notes_2) == 1

    # Team updates status to on_site via member
    # Login member of NDRF Team Charlie
    ndrf_member = [m for m in team.members][0]
    from app.core.security import create_access_token
    ndrf_headers = {"Authorization": f"Bearer {create_access_token(ndrf_member.id, ndrf_member.role)}"}

    client.post(f"/api/team/tasks/{aid}/status", headers=ndrf_headers, json={"status": "en_route"})
    client.post(f"/api/team/tasks/{aid}/status", headers=ndrf_headers, json={"status": "on_site"})

    # Check /api/dispatch/assignments -> no longer overdue
    r_list_after = client.get("/api/dispatch/assignments", headers=coord_headers)
    target_after = [i for i in r_list_after.json()["items"] if i["assignment_id"] == aid][0]
    assert target_after["overdue"] is False
    assert target_after["overdue_minutes"] == 0

    # /api/dispatch/overdue is now empty
    r_overdue_after = client.get("/api/dispatch/overdue", headers=coord_headers)
    assert r_overdue_after.json()["items"] == []


# -----------------------------------------------------------------------------
# 5. Settings endpoint validation 1..600
# -----------------------------------------------------------------------------
def test_settings_validation(client, coord_headers):
    # Valid get
    r = client.get("/api/dispatch/settings", headers=coord_headers)
    assert r.status_code == 200
    assert "overdue_minutes" in r.json()

    # Valid put (min 1, max 600)
    assert client.put("/api/dispatch/settings", headers=coord_headers, json={"overdue_minutes": 1}).status_code == 200
    assert client.put("/api/dispatch/settings", headers=coord_headers, json={"overdue_minutes": 600}).status_code == 200

    # Invalid put (< 1)
    r_low = client.put("/api/dispatch/settings", headers=coord_headers, json={"overdue_minutes": 0})
    assert r_low.status_code == 422
    assert r_low.json()["error"]["code"] == "VALIDATION_ERROR"

    # Invalid put (> 600)
    r_high = client.put("/api/dispatch/settings", headers=coord_headers, json={"overdue_minutes": 601})
    assert r_high.status_code == 422
    assert r_high.json()["error"]["code"] == "VALIDATION_ERROR"


# -----------------------------------------------------------------------------
# 6. /api/dispatch/assignments scopes
# -----------------------------------------------------------------------------
def test_dispatch_assignments_scopes(client, coord_headers, verified_report, seeded_teams, make_report, db):
    # Assignment 1: will be resolved today
    r1 = client.post(f"/api/incidents/{verified_report}/assign", headers=coord_headers)
    aid1 = r1.json()["assignments"][0]["assignment_id"]
    team1_id = r1.json()["assignments"][0]["team"]["id"]
    t1 = db.get(RescueTeam, team1_id)
    m1 = t1.members[0]
    from app.core.security import create_access_token
    m1_headers = {"Authorization": f"Bearer {create_access_token(m1.id, m1.role)}"}

    client.post(f"/api/team/tasks/{aid1}/status", headers=m1_headers, json={"status": "en_route"})
    client.post(f"/api/team/tasks/{aid1}/status", headers=m1_headers, json={"status": "on_site"})
    client.post(
        f"/api/team/tasks/{aid1}/status",
        headers=m1_headers,
        json={"status": "resolved", "closing_note": "Resolved and all clear"},
    )

    # Assignment 2 on second report: will be reassigned
    rep2_id = make_report(latitude=19.3)["report_id"]
    client.post(f"/api/incidents/{rep2_id}/verify", headers=coord_headers)
    r2 = client.post(f"/api/incidents/{rep2_id}/assign", headers=coord_headers)
    aid2 = r2.json()["assignments"][0]["assignment_id"]
    team2_id = r2.json()["assignments"][0]["team"]["id"]

    # Reassign assignment 2
    r_re = client.post(
        f"/api/incidents/{rep2_id}/reassign",
        headers=coord_headers,
        json={"from_team_id": team2_id, "reason": "Swapping rescue team for availability"},
    )
    aid3 = r_re.json()["assignments"][0]["assignment_id"]

    # Scope = active: aid3 is active, aid1 (resolved) and aid2 (reassigned) are excluded
    r_active = client.get("/api/dispatch/assignments?scope=active", headers=coord_headers)
    assert r_active.status_code == 200
    active_ids = [i["assignment_id"] for i in r_active.json()["items"]]
    assert aid3 in active_ids
    assert aid2 not in active_ids
    assert aid1 not in active_ids

    # Scope = resolved_today: aid1 is present
    r_resolved = client.get("/api/dispatch/assignments?scope=resolved_today", headers=coord_headers)
    assert r_resolved.status_code == 200
    resolved_ids = [i["assignment_id"] for i in r_resolved.json()["items"]]
    assert aid1 in resolved_ids
    assert aid2 not in resolved_ids
    assert aid3 not in resolved_ids


# -----------------------------------------------------------------------------
# 7. /api/dispatch/map shape
# -----------------------------------------------------------------------------
def test_dispatch_map_shape(client, coord_headers, verified_report, seeded_teams):
    r = client.get("/api/dispatch/map", headers=coord_headers)
    assert r.status_code == 200
    data = r.json()

    assert "incidents" in data
    assert "teams" in data
    assert isinstance(data["incidents"], list)
    assert isinstance(data["teams"], list)

    incidents = data["incidents"]
    assert len(incidents) > 0
    inc = incidents[0]
    for key in ("id", "tracking_ref", "incident_type", "severity", "status", "latitude", "longitude", "location"):
        assert key in inc

    teams = data["teams"]
    assert len(teams) > 0
    tm = teams[0]
    for key in ("id", "name", "team_type", "status", "latitude", "longitude", "last_location_at"):
        assert key in tm


# -----------------------------------------------------------------------------
# 8. Role-check review
# -----------------------------------------------------------------------------
def test_role_checks(client, coord_headers, rescue_member_headers, verified_report, seeded_teams, other_team_member_headers, db):
    # Citizen headers
    citizen = Citizen(name="Citizen Tester", phone_number="9876543288", password_hash=hash_password("Cit@123"))
    db.add(citizen)
    db.commit()
    from app.core.security import create_access_token
    cit_headers = {"Authorization": f"Bearer {create_access_token(citizen.id, citizen.role)}"}

    # Coordinator endpoints
    coord_endpoints = [
        ("GET", "/api/teams"),
        ("GET", "/api/dispatch/assignments"),
        ("GET", "/api/dispatch/overdue"),
        ("GET", "/api/dispatch/settings"),
        ("GET", "/api/dispatch/map"),
        ("POST", f"/api/incidents/{verified_report}/assign"),
        ("POST", f"/api/incidents/{verified_report}/reassign"),
    ]

    for method, path in coord_endpoints:
        # Anonymous -> 401
        if method == "GET":
            assert client.get(path).status_code == 401, f"{path} should be 401 for anonymous"
            assert client.get(path, headers=cit_headers).status_code == 403, f"{path} should be 403 for citizen"
            assert client.get(path, headers=rescue_member_headers).status_code == 403, f"{path} should be 403 for rescue member"
        else:
            assert client.post(path).status_code == 401, f"{path} should be 401 for anonymous"
            assert client.post(path, headers=cit_headers).status_code == 403, f"{path} should be 403 for citizen"
            assert client.post(path, headers=rescue_member_headers).status_code == 403, f"{path} should be 403 for rescue member"

    # Coordinator calling /api/team/* -> 403
    assert client.get("/api/team/my-task", headers=coord_headers).status_code == 403
    assert client.post("/api/team/location", headers=coord_headers, json={"latitude": 19.1, "longitude": 72.8}).status_code == 403


# -----------------------------------------------------------------------------
# 9. Delayed older status is a no-op, client_update_id accepted
# -----------------------------------------------------------------------------
def test_delayed_older_status_and_idempotency(client, coord_headers, verified_report, seeded_teams, rescue_member_headers, make_report, db):
    team1 = db.scalar(select(RescueTeam).where(RescueTeam.name == "Fire Team Alpha"))
    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [team1.id]},
    )
    assert r_assign.status_code == 201
    aid = r_assign.json()["assignments"][0]["assignment_id"]

    # 1. Update to en_route with client_update_id
    r1 = client.post(
        f"/api/team/tasks/{aid}/status",
        headers=rescue_member_headers,
        json={"status": "en_route", "client_update_id": "client-uuid-001"},
    )
    assert r1.status_code == 200
    assert r1.json()["status"] == AssignmentStatus.en_route.value

    # Re-sending same status -> 200 no-op
    r1_repeat = client.post(
        f"/api/team/tasks/{aid}/status",
        headers=rescue_member_headers,
        json={"status": "en_route", "client_update_id": "client-uuid-001-replay"},
    )
    assert r1_repeat.status_code == 200
    assert r1_repeat.json()["status"] == AssignmentStatus.en_route.value

    # 2. Update to on_site
    r2 = client.post(
        f"/api/team/tasks/{aid}/status",
        headers=rescue_member_headers,
        json={"status": "on_site", "client_update_id": "client-uuid-002"},
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == AssignmentStatus.on_site.value

    # Delayed en_route replay after on_site -> 200 no-op (harmless offline replay)
    r_delayed_enroute = client.post(
        f"/api/team/tasks/{aid}/status",
        headers=rescue_member_headers,
        json={"status": "en_route", "client_update_id": "delayed-enroute"},
    )
    assert r_delayed_enroute.status_code == 200
    assert r_delayed_enroute.json()["status"] == AssignmentStatus.on_site.value

    # Going backwards to assigned is rejected
    r_back_assigned = client.post(
        f"/api/team/tasks/{aid}/status",
        headers=rescue_member_headers,
        json={"status": "assigned"},
    )
    assert r_back_assigned.status_code == 409
    assert r_back_assigned.json()["error"]["code"] == "INVALID_TRANSITION"

    # But genuinely invalid jump (e.g. assigned -> resolved) on a new assignment is 409 INVALID_TRANSITION
    rep2_id = make_report(latitude=19.4)["report_id"]
    client.post(f"/api/incidents/{rep2_id}/verify", headers=coord_headers)

    team2 = db.scalar(select(RescueTeam).where(RescueTeam.name == "NDRF Team Charlie"))
    r_assign2 = client.post(f"/api/incidents/{rep2_id}/assign", headers=coord_headers, json={"team_ids": [team2.id]})
    aid2 = r_assign2.json()["assignments"][0]["assignment_id"]

    m2 = team2.members[0]
    from app.core.security import create_access_token
    m2_headers = {"Authorization": f"Bearer {create_access_token(m2.id, m2.role)}"}

    r_jump = client.post(
        f"/api/team/tasks/{aid2}/status",
        headers=m2_headers,
        json={"status": "resolved", "closing_note": "skipping all steps"},
    )
    assert r_jump.status_code == 409
    assert r_jump.json()["error"]["code"] == "INVALID_TRANSITION"


# -----------------------------------------------------------------------------
# 10. Reassign team while en_route: report stays in_progress, audit written,
#     old reassigned, new deployed, subsequent en_route succeeds
# -----------------------------------------------------------------------------
def test_reassign_team_en_route(client, coord_headers, verified_report, seeded_teams, rescue_member_headers, db):
    alpha = db.scalar(select(RescueTeam).where(RescueTeam.name == "Fire Team Alpha"))
    beta = db.scalar(select(RescueTeam).where(RescueTeam.name == "Fire Team Beta"))

    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [alpha.id]},
    )
    assert r_assign.status_code == 201
    old_aid = r_assign.json()["assignments"][0]["assignment_id"]

    # Alpha marks en_route -> report becomes in_progress
    r_enroute = client.post(
        f"/api/team/tasks/{old_aid}/status",
        headers=rescue_member_headers,
        json={"status": "en_route"},
    )
    assert r_enroute.status_code == 200

    db.expire_all()
    report = db.get(IncidentReport, verified_report)
    assert report.status == IncidentStatus.in_progress.value

    # Coordinator reassigns from Alpha to Beta while report is in_progress
    reason = "Alpha vehicle broke down on route; swapping to Beta"
    r_reassign = client.post(
        f"/api/incidents/{verified_report}/reassign",
        headers=coord_headers,
        json={
            "from_team_id": alpha.id,
            "to_team_id": beta.id,
            "reason": reason,
        },
    )
    assert r_reassign.status_code == 200
    data = r_reassign.json()
    assert data["report_status"] == IncidentStatus.in_progress.value
    assert data["replaced_assignment_id"] == old_aid
    new_aid = data["assignments"][0]["assignment_id"]

    # Verify DB state
    db.expire_all()
    rep = db.get(IncidentReport, verified_report)
    assert rep.status == IncidentStatus.in_progress.value

    old_a = db.get(TeamAssignment, old_aid)
    assert old_a.status == AssignmentStatus.reassigned.value
    assert old_a.replaced_by_id == new_aid

    alpha_db = db.get(RescueTeam, alpha.id)
    assert alpha_db.status == TeamStatus.available.value
    for m in alpha_db.members:
        assert m.member_status == MemberStatus.available.value

    beta_db = db.get(RescueTeam, beta.id)
    assert beta_db.status == TeamStatus.deployed.value
    for m in beta_db.members:
        assert m.member_status == MemberStatus.assigned.value

    # Verify audit log contains reassign
    audits = list(
        db.scalars(
            select(AuditLog).where(
                AuditLog.entity_type == "incident_report",
                AuditLog.entity_id == verified_report,
                AuditLog.action == "reassign",
            )
        ).all()
    )
    assert len(audits) >= 1
    assert audits[-1].from_status == "in_progress"
    assert audits[-1].to_status == "in_progress"
    assert audits[-1].remark == reason

    # New team member marks en_route -> should not fail even though report is already in_progress
    beta_member = beta_db.members[0]
    from app.core.security import create_access_token
    beta_headers = {"Authorization": f"Bearer {create_access_token(beta_member.id, beta_member.role)}"}
    r_beta_enroute = client.post(
        f"/api/team/tasks/{new_aid}/status",
        headers=beta_headers,
        json={"status": "en_route"},
    )
    assert r_beta_enroute.status_code == 200
    assert r_beta_enroute.json()["status"] == AssignmentStatus.en_route.value


# -----------------------------------------------------------------------------
# 11. Reassign team while on_site: report stays in_progress, audit written,
#     old reassigned, new deployed
# -----------------------------------------------------------------------------
def test_reassign_team_on_site(client, coord_headers, verified_report, seeded_teams, rescue_member_headers, db):
    alpha = db.scalar(select(RescueTeam).where(RescueTeam.name == "Fire Team Alpha"))
    beta = db.scalar(select(RescueTeam).where(RescueTeam.name == "Fire Team Beta"))

    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [alpha.id]},
    )
    assert r_assign.status_code == 201
    old_aid = r_assign.json()["assignments"][0]["assignment_id"]

    # Alpha marks en_route then on_site -> report is in_progress
    client.post(f"/api/team/tasks/{old_aid}/status", headers=rescue_member_headers, json={"status": "en_route"})
    client.post(f"/api/team/tasks/{old_aid}/status", headers=rescue_member_headers, json={"status": "on_site"})

    db.expire_all()
    report = db.get(IncidentReport, verified_report)
    assert report.status == IncidentStatus.in_progress.value

    # Coordinator reassigns from Alpha to Beta while Alpha is on_site
    reason = "Alpha team requires immediate hazmat backup replacement"
    r_reassign = client.post(
        f"/api/incidents/{verified_report}/reassign",
        headers=coord_headers,
        json={
            "from_team_id": alpha.id,
            "to_team_id": beta.id,
            "reason": reason,
        },
    )
    assert r_reassign.status_code == 200
    data = r_reassign.json()
    assert data["report_status"] == IncidentStatus.in_progress.value
    assert data["replaced_assignment_id"] == old_aid
    new_aid = data["assignments"][0]["assignment_id"]

    # Verify DB state
    db.expire_all()
    rep = db.get(IncidentReport, verified_report)
    assert rep.status == IncidentStatus.in_progress.value

    old_a = db.get(TeamAssignment, old_aid)
    assert old_a.status == AssignmentStatus.reassigned.value
    assert old_a.replaced_by_id == new_aid

    alpha_db = db.get(RescueTeam, alpha.id)
    assert alpha_db.status == TeamStatus.available.value
    for m in alpha_db.members:
        assert m.member_status == MemberStatus.available.value

    beta_db = db.get(RescueTeam, beta.id)
    assert beta_db.status == TeamStatus.deployed.value
    for m in beta_db.members:
        assert m.member_status == MemberStatus.assigned.value

    # Verify audit log contains reassign
    audits = list(
        db.scalars(
            select(AuditLog).where(
                AuditLog.entity_type == "incident_report",
                AuditLog.entity_id == verified_report,
                AuditLog.action == "reassign",
            )
        ).all()
    )
    assert len(audits) >= 1
    assert audits[-1].from_status == "in_progress"
    assert audits[-1].to_status == "in_progress"
    assert audits[-1].remark == reason
