"""Shared enums (contract section 0.5). Values are exact lowercase snake_case strings.

Mirrored in frontend/src/lib/types.ts (owned by Person B). Change both together.
"""
from enum import StrEnum


class Role(StrEnum):
    citizen = "citizen"
    coordinator = "coordinator"
    rescue_team_member = "rescue_team_member"
    system_administrator = "system_administrator"
    volunteer = "volunteer"


class IncidentType(StrEnum):
    flood = "flood"
    fire = "fire"
    medical = "medical"


class Severity(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class IncidentStatus(StrEnum):
    reported = "reported"
    verified = "verified"
    assigned = "assigned"
    in_progress = "in_progress"
    resolved = "resolved"
    rejected = "rejected"
    closed = "closed"


class TeamType(StrEnum):
    fire = "fire"
    medical = "medical"
    ndrf = "ndrf"
    local = "local"


class TeamStatus(StrEnum):
    available = "available"
    deployed = "deployed"  # UI label: "Dispatched"


class MemberStatus(StrEnum):
    available = "available"
    assigned = "assigned"
    en_route = "en_route"
    on_site = "on_site"


class AssignmentStatus(StrEnum):
    assigned = "assigned"
    en_route = "en_route"
    on_site = "on_site"
    resolved = "resolved"
    reassigned = "reassigned"


class Channel(StrEnum):
    sms = "sms"
    push = "push"
    email = "email"
    in_app = "in_app"


class AlertType(StrEnum):
    new_report = "new_report"
    verification = "verification"
    rejection = "rejection"
    status_update = "status_update"
    team_deployed = "team_deployed"
    no_team_available = "no_team_available"
    task_assigned = "task_assigned"
    overdue = "overdue"
    incident_resolved = "incident_resolved"


class DeliveryStatus(StrEnum):
    queued = "queued"
    sent = "sent"
    failed = "failed"
