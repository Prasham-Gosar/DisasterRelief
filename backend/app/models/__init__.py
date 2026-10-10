"""Import every model so Base.metadata knows all tables (needed by init_db / seed)."""
from app.models.base import Base  # noqa: F401
from app.models.user import Citizen, Coordinator, SystemAdministrator, User, Volunteer  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.incident import (  # noqa: F401
    FireIncident,
    FloodIncident,
    IncidentFactory,
    IncidentReport,
    MedicalEmergencyIncident,
)
from app.models.notification import Notification  # noqa: F401

# Person B's models: loaded automatically once they exist in the repo.
for _name in ("rescue_team", "rescue_team_member", "team_assignment", "app_setting"):
    try:
        __import__(f"app.models.{_name}")
    except ModuleNotFoundError as exc:
        if exc.name != f"app.models.{_name}":
            raise
