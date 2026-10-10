"""python -m app.seed  ->  demo accounts + sample incidents.

A: users and incidents.   B: fills in seed_dispatch() (teams, members, rescue accounts).
"""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.enums import AlertType
from app.core.security import hash_password
from app.models import Citizen, Coordinator, SystemAdministrator, User
from app.models.incident import IncidentReport
from app.services.notification_service import NotificationService


def seed_users(db: Session) -> dict:
    coord1 = Coordinator(name="Coordinator One", email="coordinator@drrcp.test", phone_number="9000000001",
                         password_hash=hash_password("Coord@123"))
    coord2 = Coordinator(name="Coordinator Two", email="coordinator2@drrcp.test", phone_number="9000000002",
                         password_hash=hash_password("Coord@123"))
    admin = SystemAdministrator(name="System Admin", email="admin@drrcp.test", phone_number="9000000003",
                                password_hash=hash_password("Admin@123"))
    citizens = [
        Citizen(name="Asha Patil", phone_number="9876543210"),
        Citizen(name="Rohan Mehta", phone_number="9876543211"),
        Citizen(name="Anonymous", phone_number="9876543212"),
    ]
    db.add_all([coord1, coord2, admin, *citizens])
    db.flush()
    return {"coord": coord1, "citizens": citizens}


# (type, location, lat, lng, severity, description, type-specific field, citizen index, target)
_SAMPLE_INCIDENTS = [
    ("flood", "Near Andheri subway, Mumbai", 19.1197, 72.8468, "high",
     "Water rising fast, cars stuck", {"water_level": "knee-deep"}, 0, "reported"),
    ("fire", "Kurla West market, Mumbai", 19.0726, 72.8845, "critical",
     "Fire in a shop, smoke spreading to nearby shops", {"structure_type": "commercial"}, 1, "reported"),
    ("medical", "Dadar station, Mumbai", 19.0178, 72.8478, "high",
     "Two people collapsed on the platform", {"casualty_count": 2}, 2, "verified"),
    ("flood", "Borivali East, Mumbai", 19.2307, 72.8567, "medium",
     "Street flooded, residents cannot leave their homes", {"water_level": "ankle-deep"}, 0, "verified"),
    ("fire", "Bandra Reclamation, Mumbai", 19.0596, 72.8295, "critical",
     "Residential building fire on 3rd floor", {"structure_type": "residential"}, 1, "verified"),
    ("flood", "Powai lake road, Mumbai", 19.1176, 72.9060, "low",
     "Minor waterlogging near the bus stop (false alarm)", {"water_level": "ankle-deep"}, 2, "rejected"),
]


def seed_incidents(db: Session, coord: Coordinator, citizens: list[Citizen]) -> None:
    notifier = NotificationService(db)
    for itype, loc, lat, lng, sev, desc, extra, ci, target in _SAMPLE_INCIDENTS:
        citizen = citizens[ci]
        report_id = citizen.submit_report(db, {
            "incident_type": itype, "location": loc, "latitude": lat, "longitude": lng,
            "severity": sev, "description": desc, "reporter_phone": citizen.phone_number, **extra,
        })
        report = db.get(IncidentReport, report_id)
        notifier.send(AlertType.new_report, f"New {sev.upper()} {itype} report at {loc}", [coord], report=report)
        if target == "verified":
            coord.verify_report(db, report_id)
        elif target == "rejected":
            report.reject(coord, "Checked with local ward office: no flooding at this location")


def seed_dispatch(db: Session) -> None:
    """Person B: seed 5 teams, 2-3 members each, and the rescue demo accounts (contract 0.10)."""


def run() -> None:
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            print("Database already has users, skipping seed. (Reset: docker compose down -v)")
            return
        logging.getLogger("drrcp.notify").setLevel(logging.WARNING)  # keep the seed output quiet
        ctx = seed_users(db)
        seed_incidents(db, ctx["coord"], ctx["citizens"])
        seed_dispatch(db)
        db.commit()
        print("Seed complete: 2 coordinators, 1 admin, 3 citizens, 6 incidents.")


if __name__ == "__main__":
    run()
