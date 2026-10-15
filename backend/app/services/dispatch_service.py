from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import AlertType, AssignmentStatus, IncidentStatus, IncidentType, MemberStatus, Role, TeamStatus, TeamType
from app.core.errors import AppError
from app.models.app_setting import AppSetting
from app.models.base import utcnow
from app.models.incident import IncidentReport
from app.models.rescue_team import RescueTeam
from app.models.rescue_team_member import RescueTeamMember
from app.models.team_assignment import TeamAssignment
from app.models.user import Coordinator, User
from app.services import audit_service
from app.services.geo import haversine_m
from app.services.notification_service import NotificationService


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


_NEXT_STATUS = {
    AssignmentStatus.assigned.value: AssignmentStatus.en_route.value,
    AssignmentStatus.en_route.value: AssignmentStatus.on_site.value,
    AssignmentStatus.on_site.value: AssignmentStatus.resolved.value,
}


class DispatchService:
    def __init__(self, db: Session):
        self.db = db

    def list_teams(
        self,
        status: TeamStatus | None = None,
        team_type: TeamType | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        """List rescue teams with active report and member counts for coordinators."""
        stmt = select(RescueTeam)
        if status:
            stmt = stmt.where(RescueTeam.status == status.value)
        if team_type:
            stmt = stmt.where(RescueTeam.team_type == team_type.value)

        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        rows = list(
            self.db.scalars(
                stmt.order_by(RescueTeam.id.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )

        items = []
        for team in rows:
            active_assign = self.db.scalar(
                select(TeamAssignment)
                .where(
                    TeamAssignment.team_id == team.id,
                    TeamAssignment.status.in_([
                        AssignmentStatus.assigned.value,
                        AssignmentStatus.en_route.value,
                        AssignmentStatus.on_site.value,
                    ]),
                )
                .order_by(TeamAssignment.assigned_at.desc(), TeamAssignment.id.desc())
            )
            items.append({
                "id": team.id,
                "public_code": team.public_code,
                "name": team.name,
                "team_type": team.team_type,
                "status": team.status,
                "latitude": team.latitude,
                "longitude": team.longitude,
                "member_count": len(team.members),
                "current_report_id": active_assign.report_id if active_assign else None,
            })

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def get_team(self, team_id: int) -> dict:
        """Get detail of a specific team including its members and assignments history."""
        team = self.db.get(RescueTeam, team_id)
        if team is None:
            raise AppError("NOT_FOUND", "Team not found")

        active_assign = self.db.scalar(
            select(TeamAssignment)
            .where(
                TeamAssignment.team_id == team.id,
                TeamAssignment.status.in_([
                    AssignmentStatus.assigned.value,
                    AssignmentStatus.en_route.value,
                    AssignmentStatus.on_site.value,
                ]),
            )
            .order_by(TeamAssignment.assigned_at.desc(), TeamAssignment.id.desc())
        )
        members = [
            {
                "id": m.id,
                "name": m.name,
                "public_code": m.public_code,
                "member_status": m.member_status,
            }
            for m in team.members
        ]

        assignments_rows = list(
            self.db.scalars(
                select(TeamAssignment)
                .where(TeamAssignment.team_id == team.id)
                .order_by(TeamAssignment.assigned_at.desc(), TeamAssignment.id.desc())
            ).all()
        )
        assignments = [
            {
                "assignment_id": a.id,
                "tracking_ref": a.report.tracking_ref if a.report else None,
                "report_tracking_ref": a.report.tracking_ref if a.report else None,
                "status": a.status,
                "assigned_at": _aware(a.assigned_at),
                "resolved_at": _aware(a.resolved_at),
                "reassign_reason": a.reassign_reason,
            }
            for a in assignments_rows
        ]

        return {
            "id": team.id,
            "public_code": team.public_code,
            "name": team.name,
            "team_type": team.team_type,
            "status": team.status,
            "latitude": team.latitude,
            "longitude": team.longitude,
            "member_count": len(team.members),
            "current_report_id": active_assign.report_id if active_assign else None,
            "members": members,
            "assignments": assignments,
        }

    def list_available_teams(self, report: IncidentReport | int) -> list[dict]:
        """Ranked available teams suitable for the given report."""
        if isinstance(report, int):
            rep = self.db.get(IncidentReport, report)
            if rep is None:
                raise AppError("NOT_FOUND", "Report not found")
            report = rep

        teams = list(
            self.db.scalars(
                select(RescueTeam).where(RescueTeam.status == TeamStatus.available.value)
            ).all()
        )

        ranked: list[dict] = []
        for team in teams:
            available_members = [
                m for m in team.members if m.member_status == MemberStatus.available.value
            ]
            if not available_members:
                continue

            if (
                report.latitude is not None
                and report.longitude is not None
                and team.latitude is not None
                and team.longitude is not None
            ):
                dist_m = haversine_m(report.latitude, report.longitude, team.latitude, team.longitude)
                distance_km = round((dist_m / 1000.0) * 1.3, 1)
            else:
                distance_km = None

            suitable = False
            itype = getattr(report, "incident_type", "")
            ttype = getattr(team, "team_type", "")
            if itype == IncidentType.flood.value:
                suitable = ttype in (TeamType.ndrf.value, TeamType.local.value)
            elif itype == IncidentType.fire.value:
                suitable = ttype == TeamType.fire.value
            elif itype == IncidentType.medical.value:
                suitable = ttype == TeamType.medical.value

            ranked.append({
                "team_id": team.id,
                "name": team.name,
                "team_type": team.team_type,
                "distance_km": distance_km,
                "member_count": len(available_members),
                "suitable": suitable,
                "latitude": team.latitude,
                "longitude": team.longitude,
            })

        ranked.sort(
            key=lambda t: (
                not t["suitable"],
                t["distance_km"] if t["distance_km"] is not None else float("inf"),
                t["team_id"],
            )
        )
        return ranked

    def assign_team(
        self, coordinator: User, report_id: int, team_ids: list[int] | None = None
    ) -> dict:
        """Assign one or more rescue teams to a verified incident report. ONE transaction."""
        # 2.a: Require coordinator role
        if coordinator is None or coordinator.role != Role.coordinator.value:
            raise AppError("FORBIDDEN", "Only coordinators can assign teams")

        # 2.a: Lock report with FOR UPDATE
        report = self.db.scalar(
            select(IncidentReport).where(IncidentReport.id == report_id).with_for_update()
        )
        if report is None:
            raise AppError("NOT_FOUND", "Report not found")

        # SD msg 1/2: Report status must be verified (or assigned for reassign)
        if report.status not in (IncidentStatus.verified.value, IncidentStatus.assigned.value):
            raise AppError("INVALID_TRANSITION", "Report must be verified before dispatch")

        # 2.b: Choose teams
        if team_ids is not None:
            chosen_team_ids = list(team_ids)
        else:
            available_list = self.list_available_teams(report)
            if not available_list:
                chosen_team_ids = []
            else:
                chosen_team_ids = [available_list[0]["team_id"]]

        # 2.c: If NO team is available (SD msg 10)
        if not chosen_team_ids:
            coordinators = list(
                self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))).all()
            )
            NotificationService(self.db).send(
                AlertType.no_team_available,
                f"No rescue team available for report {report.tracking_ref}",
                coordinators,
                report=report,
            )
            self.db.commit()
            raise AppError(
                "NO_TEAM_AVAILABLE",
                "No rescue team is available",
                details={"report_id": report.id},
            )

        # 2.d: Lock chosen teams FOR UPDATE and check availability (BR-2: no double booking)
        chosen_teams: list[RescueTeam] = []
        seen_tids: set[int] = set()
        for tid in chosen_team_ids:
            if tid in seen_tids:
                self.db.rollback()
                raise AppError(
                    "TEAM_NOT_AVAILABLE",
                    f"Team {tid} cannot be assigned multiple times",
                    details={"team_id": tid},
                )
            seen_tids.add(tid)
            team = self.db.scalar(select(RescueTeam).where(RescueTeam.id == tid).with_for_update())
            if team is None:
                self.db.rollback()
                raise AppError("NOT_FOUND", f"Team {tid} not found")
            if team.status != TeamStatus.available.value:
                self.db.rollback()
                raise AppError(
                    "TEAM_NOT_AVAILABLE",
                    f"{team.name} is already dispatched",
                    details={"team_id": team.id},
                )
            chosen_teams.append(team)

        # 2.e: Update teams, create assignments, loop members, report location
        assignments_out = []
        for team in chosen_teams:
            # SD msg 4
            team.update_status(TeamStatus.deployed)
            team.assigned_by_id = coordinator.id

            assignment = TeamAssignment(
                report_id=report.id,
                team_id=team.id,
                assigned_by_id=coordinator.id,
                status=AssignmentStatus.assigned.value,
            )
            self.db.add(assignment)
            self.db.flush()

            ack_count = 0
            # SD msg 5/6
            for member in team.members:
                ack = member.update_task_status(MemberStatus.assigned, assignment)
                if ack == "task_acknowledged":
                    ack_count += 1

            # SD msg 7/8
            lat, lng = team.report_location()
            assignments_out.append({
                "assignment_id": assignment.id,
                "team": {
                    "id": team.id,
                    "name": team.name,
                    "status": team.status,
                },
                "members_acknowledged": ack_count,
                "current_location": {
                    "latitude": lat,
                    "longitude": lng,
                },
            })

        # 2.f: Transition report to assigned (also notifies subscribed citizen)
        report.transition(IncidentStatus.assigned, coordinator)

        # 2.g: Send AlertType.team_deployed notifications (SD msg 9)
        notifier = NotificationService(self.db)
        coordinators = list(
            self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))).all()
        )
        for team in chosen_teams:
            members = list(team.members)
            if members:
                notifier.send(
                    AlertType.team_deployed,
                    f"New task: {report.incident_type.upper()} {report.severity.upper()} at {report.location}",
                    members,
                    report=report,
                )
            notifier.send(
                AlertType.team_deployed,
                f"{team.name} dispatched to {report.tracking_ref}",
                coordinators,
                report=report,
            )

        # 2.h: Audit log
        team_names = ", ".join(t.name for t in chosen_teams)
        audit_service.log(self.db, coordinator, "assign", "incident_report", report.id, remark=team_names)

        self.db.commit()

        # 2.i: Return result dict
        return {
            "report_id": report.id,
            "report_status": report.status,
            "assignments": assignments_out,
        }

    def reassign(
        self,
        coordinator: User,
        report_id: int,
        from_team_id: int,
        to_team_id: Optional[int] = None,
        reason: Optional[str] = None,
    ) -> dict:
        """Reassign an incident report from an old team to a new team. ONE transaction."""
        # 1. Require coordinator role
        if coordinator is None or coordinator.role != Role.coordinator.value:
            raise AppError("FORBIDDEN", "Only coordinators can reassign teams")

        # 2. Reason required (strip, >= 5 chars) else REMARK_REQUIRED
        if not reason or len(reason.strip()) < 5:
            raise AppError("REMARK_REQUIRED", "A reason of at least 5 characters is required")
        clean_reason = reason.strip()

        # 3. Lock report FOR UPDATE
        report = self.db.scalar(
            select(IncidentReport).where(IncidentReport.id == report_id).with_for_update()
        )
        if report is None:
            raise AppError("NOT_FOUND", "Report not found")

        if report.status not in (IncidentStatus.assigned.value, IncidentStatus.in_progress.value):
            raise AppError(
                "INVALID_TRANSITION",
                f"Cannot reassign report with status {report.status}",
            )

        # 4. Lock old assignment FOR UPDATE
        old_assignment = self.db.scalar(
            select(TeamAssignment)
            .where(
                TeamAssignment.report_id == report.id,
                TeamAssignment.team_id == from_team_id,
            )
            .order_by(TeamAssignment.assigned_at.desc(), TeamAssignment.id.desc())
            .with_for_update()
        )
        if old_assignment is None:
            raise AppError("NOT_FOUND", "Assignment not found")

        if old_assignment.status not in (
            AssignmentStatus.assigned.value,
            AssignmentStatus.en_route.value,
            AssignmentStatus.on_site.value,
        ):
            raise AppError(
                "INVALID_TRANSITION",
                f"Cannot reassign assignment with status {old_assignment.status}",
            )

        # 5. Choose new team
        if to_team_id is not None:
            chosen_team_id = to_team_id
        else:
            # Rank available teams BEFORE releasing the old team
            available_list = self.list_available_teams(report)
            available_excluding_from = [t for t in available_list if t["team_id"] != from_team_id]
            if not available_excluding_from:
                chosen_team_id = None
            else:
                chosen_team_id = available_excluding_from[0]["team_id"]

        # If none available: SD msg 10 alert to all coordinators, raise NO_TEAM_AVAILABLE, old assignment untouched
        if chosen_team_id is None:
            coordinators = list(
                self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))).all()
            )
            NotificationService(self.db).send(
                AlertType.no_team_available,
                f"No rescue team available for report {report.tracking_ref}",
                coordinators,
                report=report,
            )
            self.db.commit()
            raise AppError(
                "NO_TEAM_AVAILABLE",
                "No rescue team is available",
                details={"report_id": report.id},
            )

        if chosen_team_id == from_team_id:
            self.db.rollback()
            raise AppError(
                "TEAM_NOT_AVAILABLE",
                "Cannot reassign to the same team",
                details={"team_id": chosen_team_id},
            )

        # 6. Lock new team FOR UPDATE and verify availability
        new_team = self.db.scalar(
            select(RescueTeam).where(RescueTeam.id == chosen_team_id).with_for_update()
        )
        if new_team is None:
            self.db.rollback()
            raise AppError("NOT_FOUND", f"Team {chosen_team_id} not found")
        if new_team.status != TeamStatus.available.value:
            self.db.rollback()
            raise AppError(
                "TEAM_NOT_AVAILABLE",
                f"{new_team.name} is already dispatched",
                details={"team_id": new_team.id},
            )

        # 7. Create new assignment
        new_assignment = TeamAssignment(
            report_id=report.id,
            team_id=new_team.id,
            assigned_by_id=coordinator.id,
            status=AssignmentStatus.assigned.value,
        )
        self.db.add(new_assignment)
        self.db.flush()

        # 8. Update old assignment
        old_assignment.status = AssignmentStatus.reassigned.value
        old_assignment.reassign_reason = clean_reason
        old_assignment.replaced_by_id = new_assignment.id

        # 9. Old team -> available, members -> available (SD msg 11)
        old_team = old_assignment.team
        if old_team is None:
            old_team = self.db.get(RescueTeam, from_team_id)
        if old_team is not None:
            old_team.update_status(TeamStatus.available)
            for m in old_team.members:
                m.update_task_status(MemberStatus.available, old_assignment)

        # 10. New team deployed (update_status) (SD msg 4)
        new_team.update_status(TeamStatus.deployed)
        new_team.assigned_by_id = coordinator.id

        # 11. Loop new members update_task_status(assigned) (SD msg 5/6)
        ack_count = 0
        for member in new_team.members:
            ack = member.update_task_status(MemberStatus.assigned, new_assignment)
            if ack == "task_acknowledged":
                ack_count += 1

        # 12. Report transition / audit
        if report.status == IncidentStatus.assigned.value:
            report.transition(IncidentStatus.assigned, coordinator, remark=clean_reason)
        elif report.status == IncidentStatus.in_progress.value:
            audit_service.log(
                self.db,
                coordinator,
                "reassign",
                "incident_report",
                report.id,
                from_status="in_progress",
                to_status="in_progress",
                remark=clean_reason,
            )
        else:
            raise AppError(
                "INVALID_TRANSITION",
                f"Cannot reassign report with status {report.status}",
            )

        # 13. Notifications (SD msg 9)
        notifier = NotificationService(self.db)
        coordinators = list(
            self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))).all()
        )
        new_members = list(new_team.members)
        if new_members:
            notifier.send(
                AlertType.team_deployed,
                f"New task: {report.incident_type.upper()} {report.severity.upper()} at {report.location}",
                new_members,
                report=report,
            )
        notifier.send(
            AlertType.team_deployed,
            f"{new_team.name} dispatched to {report.tracking_ref}",
            coordinators,
            report=report,
        )

        # Notify old team members
        if old_team is not None:
            old_members = list(old_team.members)
            if old_members:
                notifier.send(
                    AlertType.status_update,
                    f"Task cancelled: {report.tracking_ref} reassigned",
                    old_members,
                    report=report,
                )

        # SD msg 7/8: report location
        lat, lng = new_team.report_location()

        self.db.commit()

        # Return same shape as assign_team, plus replaced_assignment_id
        return {
            "report_id": report.id,
            "report_status": report.status,
            "assignments": [
                {
                    "assignment_id": new_assignment.id,
                    "team": {
                        "id": new_team.id,
                        "name": new_team.name,
                        "status": new_team.status,
                    },
                    "members_acknowledged": ack_count,
                    "current_location": {
                        "latitude": lat,
                        "longitude": lng,
                    },
                }
            ],
            "replaced_assignment_id": old_assignment.id,
        }

    def update_task_status(
        self,
        member: User,
        assignment_id: int,
        status: str,
        closing_note: Optional[str] = None,
        client_update_id: Optional[str] = None,
    ) -> dict:
        """Update task progress status by an assigned rescue team member."""
        assignment = self.db.scalar(
            select(TeamAssignment).where(TeamAssignment.id == assignment_id).with_for_update()
        )
        if assignment is None:
            raise AppError("NOT_FOUND", "Assignment not found")

        if member.team_id is None or assignment.team_id != member.team_id:
            raise AppError("FORBIDDEN", "This task does not belong to your team")

        if assignment.status == AssignmentStatus.reassigned.value:
            raise AppError("INVALID_TRANSITION", "Assignment has been reassigned")

        MEMBER_STATUS_ORDER = {
            AssignmentStatus.en_route.value: 2,
            AssignmentStatus.on_site.value: 3,
            AssignmentStatus.resolved.value: 4,
        }

        # If incoming status is assigned: only allowed if assignment is already assigned (idempotent no-op)
        if status == AssignmentStatus.assigned.value:
            if assignment.status == AssignmentStatus.assigned.value:
                return self._format_task(assignment)
            raise AppError(
                "INVALID_TRANSITION",
                f"Cannot transition assignment from {assignment.status} to {status}",
            )

        if status not in MEMBER_STATUS_ORDER:
            raise AppError("INVALID_TRANSITION", f"Unknown assignment status {status}")

        curr_rank = MEMBER_STATUS_ORDER.get(assignment.status, 1)
        target_rank = MEMBER_STATUS_ORDER[status]

        # Idempotent re-send or delayed older status replay (e.g. en_route after on_site) -> 200 no-op
        if target_rank <= curr_rank:
            return self._format_task(assignment)

        expected_next = _NEXT_STATUS.get(assignment.status)
        if status != expected_next:
            raise AppError(
                "INVALID_TRANSITION",
                f"Cannot transition assignment from {assignment.status} to {status}",
            )

        if status == AssignmentStatus.en_route.value:
            assignment.en_route_at = utcnow()
            assignment.status = AssignmentStatus.en_route.value
            for m in assignment.team.members:
                m.update_task_status(MemberStatus.en_route, assignment)

            report = assignment.report
            if report.status == IncidentStatus.assigned.value:
                report.transition(IncidentStatus.in_progress, member)

            coordinators = list(
                self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))).all()
            )
            NotificationService(self.db).send(
                AlertType.status_update,
                f"{assignment.team.name} is on the way to {report.tracking_ref}",
                coordinators,
                report=report,
            )

        elif status == AssignmentStatus.on_site.value:
            assignment.on_site_at = utcnow()
            assignment.status = AssignmentStatus.on_site.value
            for m in assignment.team.members:
                m.update_task_status(MemberStatus.on_site, assignment)

            report = assignment.report
            coordinators = list(
                self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))).all()
            )
            NotificationService(self.db).send(
                AlertType.status_update,
                f"{assignment.team.name} is on site at {report.tracking_ref}",
                coordinators,
                report=report,
            )

        elif status == AssignmentStatus.resolved.value:
            if not closing_note or len(closing_note.strip()) < 5:
                raise AppError(
                    "REMARK_REQUIRED", "A closing note of at least 5 characters is required"
                )
            clean_note = closing_note.strip()
            assignment.resolved_at = utcnow()
            assignment.closing_note = clean_note
            assignment.status = AssignmentStatus.resolved.value

            # SD msg 11: Team and members back to available
            assignment.team.update_status(TeamStatus.available)
            for m in assignment.team.members:
                m.update_task_status(MemberStatus.available, assignment)

            report = assignment.report
            all_active = list(
                self.db.scalars(
                    select(TeamAssignment).where(
                        TeamAssignment.report_id == report.id,
                        TeamAssignment.status != AssignmentStatus.reassigned.value,
                    )
                ).all()
            )
            if all(a.status == AssignmentStatus.resolved.value for a in all_active):
                report.transition(IncidentStatus.resolved, member, clean_note)
                if report.closing_note:
                    report.closing_note = f"{report.closing_note}\n{clean_note}"
                else:
                    report.closing_note = clean_note

                coordinators = list(
                    self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))).all()
                )
                NotificationService(self.db).send(
                    AlertType.incident_resolved,
                    f"Incident {report.tracking_ref} has been resolved by {assignment.team.name}",
                    coordinators,
                    report=report,
                )

        self.db.commit()
        return self._format_task(assignment)

    def update_location(self, member: User, lat: float, lng: float) -> dict:
        """Update GPS location of the member's rescue team."""
        if lat < -90 or lat > 90 or lng < -180 or lng > 180:
            raise AppError(
                "VALIDATION_ERROR",
                "Latitude must be between -90 and 90, longitude between -180 and 180",
            )
        if member.team_id is None:
            raise AppError("FORBIDDEN", "Member does not belong to any team")

        team = self.db.get(RescueTeam, member.team_id)
        if team is None:
            raise AppError("NOT_FOUND", "Team not found")

        team.latitude = lat
        team.longitude = lng
        team.last_location_at = utcnow()
        self.db.commit()
        return {"ok": True}

    def current_task_for(self, member: User) -> dict | None:
        """Active assignment for member's team (assigned/en_route/on_site), newest first."""
        if member.team_id is None:
            return None

        assignment = self.db.scalar(
            select(TeamAssignment)
            .where(
                TeamAssignment.team_id == member.team_id,
                TeamAssignment.status.in_([
                    AssignmentStatus.assigned.value,
                    AssignmentStatus.en_route.value,
                    AssignmentStatus.on_site.value,
                ]),
            )
            .order_by(TeamAssignment.assigned_at.desc(), TeamAssignment.id.desc())
        )
        if assignment is None:
            return None
        return self._format_task(assignment)

    def _format_task(self, assignment: TeamAssignment) -> dict:
        report = assignment.report
        team = assignment.team
        return {
            "assignment_id": assignment.id,
            "status": assignment.status,
            "assigned_at": _aware(assignment.assigned_at),
            "en_route_at": _aware(assignment.en_route_at),
            "on_site_at": _aware(assignment.on_site_at),
            "team": {
                "id": team.id,
                "name": team.name,
            },
            "report": {
                "id": report.id,
                "tracking_ref": report.tracking_ref,
                "incident_type": report.incident_type,
                "severity": report.severity,
                "status": report.status,
                "location": report.location,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "description": report.description,
                "reporter_phone": report.reporter_phone,
            },
        }

    def get_overdue_minutes(self) -> int:
        setting = self.db.get(AppSetting, "overdue_minutes")
        if setting and setting.value and setting.value.isdigit():
            return int(setting.value)
        return 30

    def set_overdue_minutes(self, value: int) -> int:
        if not isinstance(value, int) or value < 1 or value > 600:
            raise AppError("VALIDATION_ERROR", "overdue_minutes must be between 1 and 600")
        setting = self.db.get(AppSetting, "overdue_minutes")
        if setting is None:
            setting = AppSetting(key="overdue_minutes", value=str(value))
            self.db.add(setting)
        else:
            setting.value = str(value)
        self.db.commit()
        return value

    def overdue_assignments(self) -> list[TeamAssignment]:
        """Assignments with status in (assigned, en_route), on_site_at IS NULL, assigned_at < now - overdue_minutes.
        Sends AlertType.overdue to all active coordinators once."""
        minutes = self.get_overdue_minutes()
        cutoff = utcnow() - timedelta(minutes=minutes)
        overdue_list = list(
            self.db.scalars(
                select(TeamAssignment).where(
                    TeamAssignment.status.in_([
                        AssignmentStatus.assigned.value,
                        AssignmentStatus.en_route.value,
                    ]),
                    TeamAssignment.on_site_at.is_(None),
                    TeamAssignment.assigned_at < cutoff,
                ).order_by(TeamAssignment.assigned_at.desc(), TeamAssignment.id.desc())
            ).all()
        )

        newly_overdue = [a for a in overdue_list if not a.overdue_notified]
        if newly_overdue:
            coordinators = list(
                self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))).all()
            )
            notifier = NotificationService(self.db)
            for a in newly_overdue:
                a.overdue_notified = True
                team_name = a.team.name if a.team else f"Team {a.team_id}"
                ref = a.report.tracking_ref if a.report else f"Report {a.report_id}"
                notifier.send(
                    AlertType.overdue,
                    f"{team_name} has not reached {ref} after {minutes} minutes",
                    coordinators,
                    report=a.report,
                )
            self.db.commit()

        return overdue_list

    def check_overdue_assignments(self) -> list[TeamAssignment]:
        return self.overdue_assignments()

    def list_assignments(self, scope: str = "active") -> dict:
        """List assignments for coordinators filtered by scope (active, overdue, resolved_today)."""
        self.overdue_assignments()

        now = utcnow()
        minutes = self.get_overdue_minutes()
        cutoff = now - timedelta(minutes=minutes)

        stmt = select(TeamAssignment)
        if scope == "active":
            stmt = stmt.where(
                TeamAssignment.status.in_([
                    AssignmentStatus.assigned.value,
                    AssignmentStatus.en_route.value,
                    AssignmentStatus.on_site.value,
                ])
            )
        elif scope == "overdue":
            stmt = stmt.where(
                TeamAssignment.status.in_([
                    AssignmentStatus.assigned.value,
                    AssignmentStatus.en_route.value,
                ]),
                TeamAssignment.on_site_at.is_(None),
                TeamAssignment.assigned_at < cutoff,
            )
        elif scope == "resolved_today":
            midnight_utc = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
            stmt = stmt.where(
                TeamAssignment.status == AssignmentStatus.resolved.value,
                TeamAssignment.resolved_at >= midnight_utc,
            )
        else:
            raise AppError("VALIDATION_ERROR", f"Invalid scope: {scope}")

        stmt = stmt.order_by(TeamAssignment.assigned_at.desc(), TeamAssignment.id.desc())
        rows = list(self.db.scalars(stmt).all())

        items = []
        for a in rows:
            assigned_dt = _aware(a.assigned_at) or now
            end_dt = _aware(a.resolved_at) if a.resolved_at is not None else now
            elapsed_minutes = max(0, int((end_dt - assigned_dt).total_seconds() // 60))

            is_overdue = (
                a.status in (AssignmentStatus.assigned.value, AssignmentStatus.en_route.value)
                and a.on_site_at is None
                and assigned_dt < cutoff
            )
            overdue_mins = max(0, elapsed_minutes - minutes) if is_overdue else 0

            items.append({
                "assignment_id": a.id,
                "status": a.status,
                "assigned_at": assigned_dt,
                "en_route_at": _aware(a.en_route_at),
                "on_site_at": _aware(a.on_site_at),
                "resolved_at": _aware(a.resolved_at),
                "elapsed_minutes": elapsed_minutes,
                "overdue": is_overdue,
                "overdue_minutes": overdue_mins,
                "team": {
                    "id": a.team.id,
                    "name": a.team.name,
                    "team_type": a.team.team_type,
                },
                "report": {
                    "id": a.report.id,
                    "tracking_ref": a.report.tracking_ref,
                    "incident_type": a.report.incident_type,
                    "severity": a.report.severity,
                    "status": a.report.status,
                    "location": a.report.location,
                    "latitude": a.report.latitude,
                    "longitude": a.report.longitude,
                },
            })

        return {
            "items": items,
            "total": len(items),
        }

    def get_dispatch_map(self) -> dict:
        """Map of active incidents and teams with GPS coordinates."""
        incidents_stmt = select(IncidentReport).where(
            IncidentReport.status.not_in([
                IncidentStatus.resolved.value,
                IncidentStatus.rejected.value,
                IncidentStatus.closed.value,
            ]),
            IncidentReport.latitude.is_not(None),
            IncidentReport.longitude.is_not(None),
        ).order_by(IncidentReport.id.desc())
        incident_rows = list(self.db.scalars(incidents_stmt).all())
        incidents = [
            {
                "id": rep.id,
                "tracking_ref": rep.tracking_ref,
                "incident_type": rep.incident_type,
                "severity": rep.severity,
                "status": rep.status,
                "latitude": rep.latitude,
                "longitude": rep.longitude,
                "location": rep.location,
            }
            for rep in incident_rows
        ]

        team_rows = list(self.db.scalars(select(RescueTeam).order_by(RescueTeam.id.asc())).all())
        teams = [
            {
                "id": t.id,
                "name": t.name,
                "team_type": t.team_type,
                "status": t.status,
                "latitude": t.latitude,
                "longitude": t.longitude,
                "last_location_at": _aware(t.last_location_at),
            }
            for t in team_rows
        ]

        return {
            "incidents": incidents,
            "teams": teams,
        }
