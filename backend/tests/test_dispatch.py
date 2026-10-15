import pytest
from sqlalchemy import select

from app.core.enums import AlertType, AssignmentStatus, IncidentStatus, MemberStatus, TeamStatus
from app.core.security import hash_password
from app.models.audit_log import AuditLog
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
# 1. Ranking: nearest suitable available team first; a deployed team is excluded
# -----------------------------------------------------------------------------
def test_ranking_nearest_suitable_available_first(client, coord_headers, verified_report, seeded_teams, db):
    r = client.get(f"/api/incidents/{verified_report}/available-teams", headers=coord_headers)
    assert r.status_code == 200
    data = r.json()
    items = data["items"]
    assert len(items) > 0

    # First item must be suitable
    assert items[0]["suitable"] is True
    # For a flood report, NDRF or local is suitable. NDRF Charlie is closer than Local Delta.
    assert items[0]["name"] == "NDRF Team Charlie"
    assert items[1]["suitable"] is True
    assert items[1]["name"] == "Local Rescue Delta"

    # Non-suitable teams follow afterwards
    assert items[2]["suitable"] is False

    # Deploy NDRF Team Charlie -> must be excluded from available list
    ndrf = db.scalar(select(RescueTeam).where(RescueTeam.name == "NDRF Team Charlie"))
    ndrf.status = TeamStatus.deployed.value
    db.commit()

    r2 = client.get(f"/api/incidents/{verified_report}/available-teams", headers=coord_headers)
    items2 = r2.json()["items"]
    team_names = [t["name"] for t in items2]
    assert "NDRF Team Charlie" not in team_names
    assert items2[0]["name"] == "Local Rescue Delta"


# -----------------------------------------------------------------------------
# 2. Assign happy path
# -----------------------------------------------------------------------------
def test_assign_happy_path(client, coord_headers, verified_report, seeded_teams, db):
    r = client.post(f"/api/incidents/{verified_report}/assign", headers=coord_headers)
    assert r.status_code == 201, r.text
    data = r.json()

    assert data["report_id"] == verified_report
    assert data["report_status"] == IncidentStatus.assigned.value
    assert len(data["assignments"]) == 1

    assignment_info = data["assignments"][0]
    assigned_team_id = assignment_info["team"]["id"]
    assert assignment_info["team"]["status"] == TeamStatus.deployed.value
    assert assignment_info["members_acknowledged"] > 0
    assert "latitude" in assignment_info["current_location"]

    # Verify DB state
    team = db.get(RescueTeam, assigned_team_id)
    assert team.status == TeamStatus.deployed.value
    for m in team.members:
        assert m.member_status == MemberStatus.assigned.value

    assignment = db.get(TeamAssignment, assignment_info["assignment_id"])
    assert assignment is not None
    assert assignment.status == AssignmentStatus.assigned.value
    assert assignment.report_id == verified_report
    assert assignment.team_id == assigned_team_id

    report = db.get(IncidentReport, verified_report)
    assert report.status == IncidentStatus.assigned.value

    # Verify notifications
    notes = list(db.scalars(select(Notification).where(Notification.alert_type == AlertType.team_deployed.value)).all())
    assert len(notes) >= 2  # to members and to coordinators

    # Verify audit log
    audits = list(
        db.scalars(
            select(AuditLog).where(
                AuditLog.entity_type == "incident_report",
                AuditLog.entity_id == verified_report,
            )
        ).all()
    )
    actions = [a.action for a in audits]
    assert "assign" in actions


# -----------------------------------------------------------------------------
# 3. BR-2: assign the same team twice -> second call TEAM_NOT_AVAILABLE
# -----------------------------------------------------------------------------
def test_assign_same_team_twice_rejected(client, coord_headers, verified_report, seeded_teams, make_report, db):
    # First assignment
    r1 = client.post(f"/api/incidents/{verified_report}/assign", headers=coord_headers)
    assert r1.status_code == 201
    assigned_team_id = r1.json()["assignments"][0]["team"]["id"]

    # Second verified report
    r2_id = make_report(latitude=19.2)["report_id"]
    client.post(f"/api/incidents/{r2_id}/verify", headers=coord_headers)

    # Try assigning the same team to report 2
    r2 = client.post(
        f"/api/incidents/{r2_id}/assign",
        headers=coord_headers,
        json={"team_ids": [assigned_team_id]},
    )
    assert r2.status_code == 409
    assert r2.json()["error"]["code"] == "TEAM_NOT_AVAILABLE"
    assert r2.json()["error"]["details"]["team_id"] == assigned_team_id

    # Verify first assignment is unaffected
    report1 = db.get(IncidentReport, verified_report)
    assert report1.status == IncidentStatus.assigned.value
    team = db.get(RescueTeam, assigned_team_id)
    assert team.status == TeamStatus.deployed.value


# -----------------------------------------------------------------------------
# 4. No team available -> NO_TEAM_AVAILABLE notification created, report still verified
# -----------------------------------------------------------------------------
def test_no_team_available(client, coord_headers, verified_report, seeded_teams, db):
    # Deploy all teams
    teams = list(db.scalars(select(RescueTeam)).all())
    for t in teams:
        t.status = TeamStatus.deployed.value
    db.commit()

    r = client.post(f"/api/incidents/{verified_report}/assign", headers=coord_headers)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "NO_TEAM_AVAILABLE"
    assert r.json()["error"]["details"]["report_id"] == verified_report

    # Report still verified
    report = db.get(IncidentReport, verified_report)
    assert report.status == IncidentStatus.verified.value

    # AlertType.no_team_available notification created
    notes = list(db.scalars(select(Notification).where(Notification.alert_type == AlertType.no_team_available.value)).all())
    assert len(notes) > 0


# -----------------------------------------------------------------------------
# 5. Assign on a "reported" (unverified) report -> INVALID_TRANSITION
# -----------------------------------------------------------------------------
def test_assign_on_unverified_report_fails(client, coord_headers, make_report, seeded_teams):
    unverified_id = make_report()["report_id"]
    r = client.post(f"/api/incidents/{unverified_id}/assign", headers=coord_headers)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "INVALID_TRANSITION"


# -----------------------------------------------------------------------------
# 6. Status flow: en_route -> on_site -> resolved; idempotent; backwards rejected;
#    closing note required; team and members available after resolve
# -----------------------------------------------------------------------------
def test_task_status_lifecycle(client, coord_headers, verified_report, seeded_teams, rescue_member_headers, db):
    # Assign Fire Team Alpha (team_id=1)
    team1 = db.scalar(select(RescueTeam).where(RescueTeam.name == "Fire Team Alpha"))
    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [team1.id]},
    )
    assert r_assign.status_code == 201
    assignment_id = r_assign.json()["assignments"][0]["assignment_id"]

    # Member checks my-task
    r_task = client.get("/api/team/my-task", headers=rescue_member_headers)
    assert r_task.status_code == 200
    assert r_task.json()["assignment_id"] == assignment_id
    assert r_task.json()["status"] == AssignmentStatus.assigned.value

    # 1. Update to en_route
    r_enroute = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=rescue_member_headers,
        json={"status": "en_route"},
    )
    assert r_enroute.status_code == 200
    assert r_enroute.json()["status"] == AssignmentStatus.en_route.value
    assert r_enroute.json()["en_route_at"] is not None

    # Report is now in_progress
    db.expire_all()
    report = db.get(IncidentReport, verified_report)
    assert report.status == IncidentStatus.in_progress.value

    # Repeating en_route is idempotent
    r_repeat = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=rescue_member_headers,
        json={"status": "en_route"},
    )
    assert r_repeat.status_code == 200
    assert r_repeat.json()["status"] == AssignmentStatus.en_route.value

    # Going backwards to assigned is rejected
    r_back = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=rescue_member_headers,
        json={"status": "assigned"},
    )
    assert r_back.status_code == 409
    assert r_back.json()["error"]["code"] == "INVALID_TRANSITION"

    # Skipping directly to resolved is rejected
    r_skip = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=rescue_member_headers,
        json={"status": "resolved", "closing_note": "skipping on_site"},
    )
    assert r_skip.status_code == 409
    assert r_skip.json()["error"]["code"] == "INVALID_TRANSITION"

    # 2. Update to on_site
    r_onsite = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=rescue_member_headers,
        json={"status": "on_site"},
    )
    assert r_onsite.status_code == 200
    assert r_onsite.json()["status"] == AssignmentStatus.on_site.value
    assert r_onsite.json()["on_site_at"] is not None

    # 3. Resolve without closing note -> REMARK_REQUIRED
    r_no_note = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=rescue_member_headers,
        json={"status": "resolved"},
    )
    assert r_no_note.status_code == 422
    assert r_no_note.json()["error"]["code"] == "REMARK_REQUIRED"

    r_short_note = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=rescue_member_headers,
        json={"status": "resolved", "closing_note": "tiny"},
    )
    assert r_short_note.status_code == 422
    assert r_short_note.json()["error"]["code"] == "REMARK_REQUIRED"

    # 4. Resolve with valid closing note
    r_resolved = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=rescue_member_headers,
        json={"status": "resolved", "closing_note": "Situation brought completely under control"},
    )
    assert r_resolved.status_code == 200
    assert r_resolved.json()["status"] == AssignmentStatus.resolved.value

    # Verify team and members are available again, report is resolved
    db.expire_all()
    team = db.get(RescueTeam, team1.id)
    assert team.status == TeamStatus.available.value
    for m in team.members:
        assert m.member_status == MemberStatus.available.value

    report = db.get(IncidentReport, verified_report)
    assert report.status == IncidentStatus.resolved.value
    assert "Situation brought completely under control" in (report.closing_note or "")

    # my-task now returns null
    r_mytask_after = client.get("/api/team/my-task", headers=rescue_member_headers)
    assert r_mytask_after.status_code == 200
    assert r_mytask_after.json() is None


# -----------------------------------------------------------------------------
# 7. Role / team permissions: member of other team cannot update task;
#    citizen/anonymous cannot call coordinator endpoints
# -----------------------------------------------------------------------------
def test_permissions_and_other_team_member_forbidden(
    client, coord_headers, verified_report, seeded_teams, other_team_member_headers, db
):
    team1 = db.scalar(select(RescueTeam).where(RescueTeam.name == "Fire Team Alpha"))
    r_assign = client.post(
        f"/api/incidents/{verified_report}/assign",
        headers=coord_headers,
        json={"team_ids": [team1.id]},
    )
    assert r_assign.status_code == 201
    assignment_id = r_assign.json()["assignments"][0]["assignment_id"]

    # Member of Fire Team Beta attempts to update Fire Team Alpha's task -> 403
    r_other = client.post(
        f"/api/team/tasks/{assignment_id}/status",
        headers=other_team_member_headers,
        json={"status": "en_route"},
    )
    assert r_other.status_code == 403
    assert r_other.json()["error"]["code"] == "FORBIDDEN"

    # Anonymous calling coordinator endpoints -> 401
    assert client.get("/api/teams").status_code == 401
    assert client.post(f"/api/incidents/{verified_report}/assign").status_code == 401

    # Citizen calling coordinator endpoints -> 403
    citizen = Citizen(name="Citizen X", phone_number="9876543299", password_hash=hash_password("Cit@123"))
    db.add(citizen)
    db.commit()
    cit_token = client.post("/api/auth/login", json={"email": "9876543299", "password": "Cit@123"})
    if cit_token.status_code != 200:
        # If login by email/phone:
        cit_token = client.post("/api/auth/login", json={"phone_number": "9876543299", "password": "Cit@123"})
    # Or create token directly if login endpoint is email only:
    from app.core.security import create_access_token
    cit_headers = {"Authorization": f"Bearer {create_access_token(citizen.id, citizen.role)}"}

    assert client.get("/api/teams", headers=cit_headers).status_code == 403
    assert client.post(f"/api/incidents/{verified_report}/assign", headers=cit_headers).status_code == 403

    # Anonymous / Citizen calling team portal -> 401 / 403
    assert client.get("/api/team/my-task").status_code == 401
    assert client.get("/api/team/my-task", headers=cit_headers).status_code == 403


# -----------------------------------------------------------------------------
# Teams endpoints tests
# -----------------------------------------------------------------------------
def test_teams_endpoints(client, coord_headers, seeded_teams):
    r = client.get("/api/teams", headers=coord_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 5
    assert len(data["items"]) == 5

    tid = data["items"][0]["id"]
    r_detail = client.get(f"/api/teams/{tid}", headers=coord_headers)
    assert r_detail.status_code == 200
    detail = r_detail.json()
    assert "members" in detail
    assert len(detail["members"]) > 0
    assert "assignments" in detail
    assert isinstance(detail["assignments"], list)


# -----------------------------------------------------------------------------
# Team location update
# -----------------------------------------------------------------------------
def test_update_location(client, rescue_member_headers, db):
    r = client.post(
        "/api/team/location",
        headers=rescue_member_headers,
        json={"latitude": 19.1234, "longitude": 72.8567},
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    team = db.scalar(select(RescueTeam).where(RescueTeam.name == "Fire Team Alpha"))
    assert team.latitude == 19.1234
    assert team.longitude == 72.8567


# -----------------------------------------------------------------------------
# BR-2: Concurrent assignment of the same team using two threads/sessions
# -----------------------------------------------------------------------------
@pytest.mark.skipif(
    "postgresql" not in getattr(__import__("app.core.config", fromlist=["settings"]).settings, "DATABASE_URL", ""),
    reason="BR-2 concurrency test requires PostgreSQL row-level locking (FOR UPDATE)",
)
def test_concurrent_team_assignment(verified_report, seeded_teams, make_report):
    import concurrent.futures
    from app.core.database import SessionLocal
    from app.core.errors import AppError
    from app.models.user import Coordinator
    from app.services.dispatch_service import DispatchService

    rep2_id = make_report(latitude=19.2)["report_id"]
    with SessionLocal() as s:
        c = s.scalar(select(Coordinator).where(Coordinator.is_active.is_(True)))
        r2 = s.get(IncidentReport, rep2_id)
        r2.verify(c)
        s.commit()

        team = s.scalar(select(RescueTeam).where(RescueTeam.status == TeamStatus.available.value))
        target_team_id = team.id

    results = []

    def run_assign(report_id):
        with SessionLocal() as session:
            coord = session.scalar(select(Coordinator).where(Coordinator.is_active.is_(True)))
            service = DispatchService(session)
            try:
                res = service.assign_team(coord, report_id, team_ids=[target_team_id])
                results.append(("SUCCESS", res))
            except AppError as e:
                results.append(("ERROR", e.code))
            except Exception as e:
                results.append(("CRASH", str(e)))

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(run_assign, verified_report)
        f2 = executor.submit(run_assign, rep2_id)
        f1.result()
        f2.result()

    successes = [r for r in results if r[0] == "SUCCESS"]
    team_not_avail = [r for r in results if r[0] == "ERROR" and r[1] == "TEAM_NOT_AVAILABLE"]

    assert len(successes) == 1
    assert len(team_not_avail) == 1
