# DRRCP: Disaster Relief and Rescue Coordination Platform

A web app where citizens report floods, fires and medical emergencies (no account needed), coordinators verify
reports and dispatch the nearest suitable rescue team, and rescue teams update their progress from a phone.

**Stack:** FastAPI + SQLAlchemy 2 + PostgreSQL (backend) · React 19 + TypeScript + Vite + Tailwind (frontend)

## Prerequisites
- Python 3.11+
- Node.js 18+
- Git
- PostgreSQL 15 (either `docker compose up -d`, or a local install with a database called `drrcp`)

## 1. Run the backend
```bash
docker compose up -d                       # PostgreSQL 15 (from the repo root). Skip if you use a local install.
cd backend
python -m venv venv
venv\Scripts\activate                      # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                     # macOS/Linux: cp .env.example .env
python -m app.init_db                      # create the tables
python -m app.seed                         # demo users, rescue teams, sample incidents
uvicorn app.main:app --reload              # API docs: http://localhost:8000/docs
```
Using a local PostgreSQL instead of Docker? Edit `DATABASE_URL` in `backend/.env`
(`postgresql+psycopg://USER:PASSWORD@localhost:5432/drrcp`).

## 2. Run the frontend
In a second terminal:
```bash
cd frontend
npm install
npm run dev                                # http://localhost:5173
```
Vite forwards `/api` and `/uploads` to the backend on port 8000, so start the backend first.

## 3. Demo accounts
| Role | Login | Password |
|---|---|---|
| Coordinator | coordinator@drrcp.test | Coord@123 |
| Coordinator 2 | coordinator2@drrcp.test | Coord@123 |
| System administrator | admin@drrcp.test | Admin@123 |
| Rescue member, Fire Team Alpha | fire.alpha1@drrcp.test | Rescue@123 |
| Rescue member, Fire Team Beta | fire.beta1@drrcp.test | Rescue@123 |
| Rescue member, Medical Team Bravo | med.bravo1@drrcp.test | Rescue@123 |
| Rescue member, NDRF Team Charlie | ndrf.charlie1@drrcp.test | Rescue@123 |
| Rescue member, Local Rescue Delta | local.delta1@drrcp.test | Rescue@123 |

Citizens do not log in: they report at `/report` and follow progress at `/track` with the tracking number
(for example `DRR-2026-000001`) plus the phone number they reported with.

## 4. Run the tests
```bash
cd backend && python -m pytest -q          # uses a throwaway SQLite database, never your real one
cd frontend && npm test                    # Vitest
cd frontend && npx tsc --noEmit && npm run build
```

## 5. Demo script (about 6 minutes)
1. **Citizen (phone-sized window)**: open `/`, press *Report an emergency*, fill the 3 steps (Flood, pick the spot on the map, High, "Knee-deep"), attach a photo, submit. Note the tracking number.
2. Submit a second flood report about 100 m away: the coordinator queue will flag it *Possible duplicate*.
3. **Track**: open `/track`, enter the number and phone: status **Reported**. Try turning status texts off and on, and *Edit report*.
4. **Coordinator**: log in, open the queue (colour-coded, critical first, refreshes every 10 s), open the report, check *Similar reports nearby*, press **Verify**. The citizen's tracking page now shows **Verified** and the message that was sent. Reject the duplicate with a reason.
5. **Dispatch**: press *Dispatch*, pick from the ranked teams, confirm. Team becomes *Dispatched*, report *Assigned*.
6. **Rescue member** (second window): log in, open the task, tap *En route*, *On site*, *Resolved* (a closing note is required). The coordinator board updates within 10 s.
7. **Operations**: lower the overdue minutes to show the overdue alert, then *Reassign*.
8. **Coordinator**: *Close* the resolved report and show the **History** timeline (audit trail) and the notification inbox.

## 6. Folder map
```
backend/
  app/
    core/        config, database, enums, errors (shared error JSON), security (JWT), deps (role checks)
    models/      User hierarchy, IncidentReport (abstract) + Flood/Fire/Medical, Notification, AuditLog,
                 RescueTeam, RescueTeamMember, TeamAssignment, AppSetting
    services/    incident_service, dispatch_service, notification_service, audit_service, photo_service, geo
    routers/     auth, incidents, notifications, stats, dispatch, teams, team_portal
    schemas/     Pydantic request/response models
    init_db.py   create tables          seed.py   demo data
  tests/         pytest (incl. test_integration_flow.py: report -> close)
frontend/src/
  features/      incidents (citizen + coordinator pages), dispatch, rescue, notifications, auth, map
  components/    ui kit, layout, map
  lib/           axios client, types, formatting
docs/            execution plan, module specs, diagrams
```

## 7. Key API endpoints (incident module)
| Endpoint | Who | What |
|---|---|---|
| `POST /api/incidents` | public | Submit a report (JSON, or multipart with up to 3 photos) |
| `GET /api/incidents/track/{ref}?phone=` | public | Citizen status + timeline (wrong phone gives 404) |
| `PATCH /api/incidents/track/{ref}?phone=` | public | Edit location/description while `reported`, else 409 `REPORT_NOT_EDITABLE` |
| `POST /api/incidents/track/{ref}/subscription?phone=` | public | Turn status texts on or off |
| `GET /api/incidents/track/{ref}/notifications?phone=` | public | Messages sent to this citizen |
| `GET /api/incidents` | coordinator | Queue: filters, search, critical-first sort, pagination |
| `GET /api/incidents/{id}` · `/history` · `/nearby` | coordinator | Detail, audit trail, similar reports (200 m / 2 h) |
| `POST /api/incidents/{id}/verify` · `/reject` · `/close` | coordinator | State changes (reject needs a reason) |
| `GET /api/stats/incidents` | coordinator | Counts for the queue's stat cards |

Errors always look like `{"error": {"code": "...", "message": "...", "details": {}}}`.

## 8. Where the sequence diagrams live in code
**Report and Verify Incident**

| Msg | Meaning | Code |
|---|---|---|
| 1-3 | create, submit, return report id | `schemas/incident.py` (`IncidentCreate`), `models/user.py` (`Citizen.submit_report`), `models/incident.py` (`submit`), `services/incident_service.py` (`submit`) |
| 4 | alert all coordinators | `incident_service.submit`, `notification_service.send` |
| 5 | pick the channel | `models/notification.py` (`filter_by_channel`) |
| 6 | verify (coordinators only, BR-1) | `models/user.py`, `models/incident.py` (`verify`), `incident_service.verify` |
| 7 | tell the citizen it is verified | `incident_service.verify` |
| 8-9 | reject with a mandatory remark, tell the citizen | `models/incident.py` (`reject`), `incident_service.reject` |
| 10 | opt [citizen subscribed]: status update on every later change | `models/incident.py` (`transition`) |

**Assign Rescue Team to Incident** (messages 1-11): see `services/dispatch_service.py`,
`models/rescue_team.py` and `models/rescue_team_member.py`; each step carries a `# SD msg N` comment.

The one rule that ties it together: a report's status changes only through `IncidentReport.transition()`,
which validates the move, writes the audit row and sends message 10.

## Reset everything
```bash
docker compose down -v && docker compose up -d
cd backend && python -m app.init_db && python -m app.seed
```
