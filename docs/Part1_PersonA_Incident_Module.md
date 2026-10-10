# DRRCP — Project Split, Part 1 of 2: Person A (Incident Reporting & Verification + Backend Foundation)

**Project:** Disaster Relief and Rescue Coordination Platform (web only: FastAPI + React/TypeScript + PostgreSQL)
**Read order:** this Part 1 (your work), then Section 0 (shared contract). Person B has Part 2.

# PART 1 (PERSON A): Incident Reporting & Verification Module + Backend Foundation

**Your one-line mission:** a citizen can report a disaster (no login), a coordinator can verify or reject it, and everyone involved is notified, with the full audit trail. You also own the backend foundation that Person B builds on.

## 1. Your ownership at a glance

| Area | What you deliver |
|---|---|
| Backend foundation | Docker Postgres, config, DB session, Alembic, JWT auth, `require_role`, error handling, enums, seed data |
| Domain classes | `User`, `Citizen`, `Coordinator`, `SystemAdministrator`, `Volunteer` (stub), `Notification`, `IncidentReport` (abstract), `FloodIncident`, `FireIncident`, `MedicalEmergencyIncident` |
| Services | `NotificationService`, `AuditService`, `IncidentService`, `geo.haversine_m` |
| Routers | `auth`, `incidents`, `notifications` |
| Frontend | Citizen pages (report, confirm, track, edit, notifications) and the Coordinator verification queue/detail pages, all under `src/features/incidents/` |
| Sequence diagram | **SD - Report and Verify Incident** (all 10 messages, `alt` and `opt` fragments) |
| SRS requirements | Report.Submit, .Anonymous, .Photo, Report.Duplicate.Check, Report.Confirm, Report.Verify, Report.Track.View, Report.Edit, BR-1, SE-1, SE-3, SE-5, SF-1, UI-1, UI-2 (queue part), CI-1 |

## 2. Class diagram: exactly what you write

### 2.1 `models/user.py`
```python
class User(Base):                      # «interface» in the diagram → abstract base, never instantiated directly
    __tablename__ = "users"
    id, role (discriminator), public_code, name, phone_number, email, password_hash, is_active
    __mapper_args__ = {"polymorphic_on": "role"}

class Citizen(User):        # role="citizen"       citizen_id = public_code
    def submit_report(self, db, payload) -> int:      # returns report_id (diagram: submitReport() : int)
    def track_status(self, db, tracking_ref) -> IncidentStatus:   # trackStatus() : void → we return the status

class Coordinator(User):    # role="coordinator"   coordinator_id = public_code
    def verify_report(self, db, report_id): ...       # calls report.verify(self)
    def assign_team(self, db, report_id, team_ids=None): ...   # delegator → DispatchService (B)
    def manage_resource(self, *a, **k): raise NotImplementedError("Release 2: resource module")

class SystemAdministrator(User):   # role="system_administrator"
    def manage_accounts(self, db, ...): ...           # optional stretch: create/deactivate coordinator + team accounts (SE-4)
    def configure_settings(self, db, ...): ...        # stub

class Volunteer(User):             # role="volunteer", skills; stub methods register_volunteer(), accept_task() → NotImplementedError
```
Use **single-table inheritance** (one `users` table, `role` as discriminator). B adds `RescueTeamMember` in their own file using the same mechanism (`polymorphic_identity="rescue_team_member"`); your base class must therefore allow that (`polymorphic_on` + `with_polymorphic="*"` is fine).

### 2.2 `models/incident.py`
```python
class IncidentReport(Base, ABC):       # «interface»: ABC with abstract methods; cannot be instantiated
    __tablename__ = "incident_reports"
    # report_id, location, severity, status (+ tracking_ref, lat, lng, description, ...) per shared DB section
    __mapper_args__ = {"polymorphic_on": "incident_type"}

    @abstractmethod
    def type_specific_fields(self) -> dict: ...     # each subclass returns its own attribute (water_level etc.)

    def submit(self, db, reporter) -> int:           # status=reported, generate tracking_ref, duplicate check, persist,
        ...                                           #   audit_log("create"), return report_id          (diagram msg 2 / 3)
    def verify(self, coordinator) -> IncidentStatus: # transition(VERIFIED) + verified_by + verified_at     (msg 6)
    def reject(self, coordinator, remark) -> IncidentStatus:  # remark mandatory → REMARK_REQUIRED; transition(REJECTED), then CLOSED (msg 8)
    def transition(self, to, actor, remark=None): ...         # state machine from shared §0.6 (B calls this)

class FloodIncident(IncidentReport):             # polymorphic_identity="flood",   +water_level
class FireIncident(IncidentReport):              # polymorphic_identity="fire",    +structure_type
class MedicalEmergencyIncident(IncidentReport):  # polymorphic_identity="medical", +casualty_count
```
A small **factory** `IncidentFactory.create(incident_type, **fields)` picks the right subclass (this is the `«create»` arrow in the sequence diagram, message 1: `create(location, severity)`).

### 2.3 `models/notification.py`
```python
class Notification(Base):
    # notification_id, message, channel, alert_type, recipient..., related_report_id, is_read, delivery_status
    def send(self) -> None:                      # marks delivery_status=sent, sent_at=now; "SMS/push" → logger.info(...)
    @staticmethod
    def filter_by_channel(user_or_phone, preferred=None) -> Channel:
        # registered user online → in_app (+push); phone-only citizen → sms; email present → email
```
`NotificationService.send(...)` (the contract in §0.9) builds `Notification` rows, calls `filter_by_channel` (diagram message 5) then `send()` (messages 4/7/9/10).

## 3. Sequence diagram "Report and Verify Incident": message-by-message mapping

| # | Diagram message | Implementation (file → function) |
|---|---|---|
| ‹create› | Citizen creates `report: FloodIncident` | `routers/incidents.py: POST /api/incidents` → `IncidentFactory.create(...)` |
| 1 | `create(location, severity)` | request body validated by `IncidentCreate` schema (type-specific field required for the chosen type) |
| 2 | `submit()` | `IncidentReport.submit()` called by `Citizen.submit_report()` / `IncidentService.submit` |
| 3 | `report_id` returned | response `{ report_id, tracking_ref, status:"reported" }` |
| 4 | `send(newReportAlert)` | `NotificationService.send(AlertType.new_report, ..., recipients=all active coordinators)` and a confirmation to the citizen (CI-1) |
| 5 | `filterByChannel(channel)` (self call) | `Notification.filter_by_channel(...)` inside `send()` |
| alt `[genuine report]` 6 | `verify()` | `POST /api/incidents/{id}/verify` → `Coordinator.verify_report()` → `report.verify()` |
| 7 | `send(verificationAlert)` | notify citizen (`AlertType.verification`) |
| alt `[false report]` 8 | `reject()` | `POST /api/incidents/{id}/reject` (remark required) → `report.reject()` |
| 9 | `send(rejectionAlert)` | notify citizen (`AlertType.rejection`) incl. remark |
| opt `[citizen subscribed]` 10 | `send(statusUpdate)` | on **every later status change** (assigned, in_progress, resolved, closed) → if `report.citizen_subscribed` send `AlertType.status_update`. Implement this inside `IncidentReport.transition()` so B's dispatch changes trigger it automatically. |

Keep the same names in code comments (`# SD msg 6`) so you can point at them in the viva.

## 4. Backend: detailed design

### 4.1 Layers (follow strictly; it is what makes the backend "good")
`router` (HTTP only: parse, auth, call service, shape response) → `service` (business rules, transactions) → `model` (domain behaviour and state machine). Routers contain **no** business logic. Pydantic `schemas` for every request/response; never return ORM objects directly.

### 4.2 Foundation tasks (Day 1, unblock Person B first)
1. `docker-compose.yml` with `postgres:15`, volume, env `POSTGRES_DB=drrcp`; `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRE_MINUTES=480`, `CORS_ORIGINS`, `UPLOAD_DIR`, `OVERDUE_MINUTES=30`).
2. `core/config.py` (pydantic-settings), `core/database.py`, `core/errors.py` (`AppError(code, message, status, details)` + exception handlers producing the shared error JSON, including Pydantic validation errors → `VALIDATION_ERROR`).
3. `core/security.py` (bcrypt hash/verify, JWT encode/decode), `core/deps.py` (`get_current_user`, `require_role`).
4. `core/enums.py` with every enum from shared §0.5.
5. Alembic baseline + migration containing **all** tables from shared §0.8 (B's models are added as soon as B pushes them; regenerate the migration together).
6. `seed.py` with demo accounts and sample incidents; command `python -m app.seed`.
7. **Push to `main` by end of Day 1** and tell B.

### 4.3 Endpoints you own

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/login` | public | `{email,password}` → `{access_token, user:{id,name,role,public_code}}`. Wrong creds → 401 `UNAUTHENTICATED` |
| `GET /api/auth/me` | any logged in | current user |
| `POST /api/incidents` | public | **multipart**: JSON field `data` + up to 3 `photos`. Creates the right subclass. Returns 201 `{report_id, tracking_ref, status}` |
| `GET /api/incidents/track/{tracking_ref}?phone=` | public | Citizen view; phone must match reporter (SE-3), else 404 (never reveal existence). Returns report summary, status, `timeline[]` (from audit log) |
| `PATCH /api/incidents/track/{tracking_ref}?phone=` | public | Edit `location`/`description` only while `status=reported` (else 409 `REPORT_NOT_EDITABLE`); audit `edit` |
| `POST /api/incidents/track/{tracking_ref}/subscription?phone=` | public | `{subscribed:true|false}` sets `citizen_subscribed` (drives SD msg 10) |
| `GET /api/incidents/track/{tracking_ref}/notifications?phone=` | public | Notifications sent to that phone for this report |
| `GET /api/incidents` | coordinator | Filters `status`, `severity`, `incident_type`, `q`, `possible_duplicate`; sort `severity_age` (default: critical first, then oldest), pagination. Critical reports never hidden until resolved/rejected/closed (SF-1) |
| `GET /api/incidents/{id}` | coordinator, rescue member (if assigned) | Full detail incl. photos and type-specific field |
| `GET /api/incidents/{id}/nearby` | coordinator | Reports within 200 m and last 2 h (for duplicate review) |
| `GET /api/incidents/{id}/history` | coordinator | Audit timeline for the report |
| `POST /api/incidents/{id}/verify` | coordinator | reported → verified |
| `POST /api/incidents/{id}/reject` | coordinator | `{remark}` required, reported/verified → rejected → closed |
| `POST /api/incidents/{id}/close` | coordinator | resolved → closed (`closing_note` optional) |
| `GET /api/notifications` | any logged in | my notifications (`unread_only`, pagination) |
| `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all` | any logged in | mark read |
| `GET /api/stats/incidents` | coordinator | counts by status and severity (for dashboard cards) |
| `GET /uploads/{file}` | public via static mount | serves stored photos (validate type/size) |

**Example: create incident (JSON in `data`)**
```json
{ "incident_type": "flood", "location": "Near Andheri subway, Mumbai", "latitude": 19.1197, "longitude": 72.8468,
  "severity": "high", "description": "Water rising fast, cars stuck", "reporter_name": "Asha", "reporter_phone": "9876543210",
  "water_level": "knee-deep" }
```
**Response 201**
```json
{ "report_id": 17, "tracking_ref": "DRR-2026-000017", "status": "reported", "possible_duplicate": false }
```

### 4.4 Business rules and validations (write a test for each)
* Phone: 10-digit Indian mobile (`^[6-9]\d{9}$`) normalised; location text 3 to 255 chars; description 5 to 1000 chars; lat in [-90, 90], lng in [-180, 180].
* Type-specific field required: flood→`water_level`, fire→`structure_type`, medical→`casualty_count` (≥ 0); a flood must not carry fire fields (422).
* Photos: ≤ 3, only `image/jpeg|png|webp`, ≤ 5 MB each, saved with random UUID filenames (never trust the client filename), original extension validated by content type.
* Anonymous citizen (Report.Submit.Anonymous): if no logged-in user, find-or-create a `Citizen` row by phone (name optional → "Anonymous").
* **Duplicate check (Report.Duplicate.Check):** on submit, query reports with `created_at >= now()-2h`, same `incident_type`, `haversine_m(...) <= 200` (filter by a lat/lng bounding box in SQL first, then exact haversine in Python). If any → `possible_duplicate=true`, `duplicate_of_id` = nearest one. The report is still saved (never silently dropped).
* `tracking_ref` = `DRR-<year>-<6-digit zero-padded id>`; unique index.
* **BR-1:** `verify`/`reject` only for `Role.coordinator` (dependency `require_role`), enforced again inside the model method.
* Reject requires non-empty remark (≥ 5 chars) → `REMARK_REQUIRED`.
* Every transition writes an `audit_logs` row (SE-5) with actor and timestamp, inside the same DB transaction as the status change.
* Rate-limit the public create endpoint per IP (simple in-memory limiter, e.g. 10/min) to prevent spam during the demo or real use.

### 4.5 Notification behaviour (what messages say)
Keep messages short, plain, and include the tracking ref, e.g. *"Your report DRR-2026-000017 has been received."*, *"Your report DRR-2026-000017 has been verified. A rescue team will be assigned soon."*, *"Your report was rejected: <remark>"*. Coordinators get *"New HIGH flood report at <location>"*. The simulated gateway logs `[SMS → 98xxxxxx] message` to the console, so you can show it live.

## 5. Frontend: pages you build (`src/features/incidents/`)

Use B's design system (`components/ui`, `MapView`, `LocationPicker`, `useAuth`, `api.ts`). Until B delivers it (Day 2), build with plain Tailwind and swap later. **Mobile-first**: the citizen pages are designed at 375 px width first.

### 5.1 Citizen pages (public, no login)
| Route | Page | Detail |
|---|---|---|
| `/` | **Home / landing** | Big red "Report an emergency" button, "Track my report" link, short explanation, language switcher (EN / हिं / मरा) |
| `/report` | **Report form** (UI-1: completable < 1 minute) | Step 1: incident type as 3 large icon cards (Flood / Fire / Medical). Step 2: location, with **"Use my current location"** button (`navigator.geolocation`), tap-to-place map pin (`LocationPicker`), and an address text box prefilled by manual entry. Step 3: severity as 4 colour-coded radio cards (low/medium/high/critical, with a one-line meaning each), description textarea (with character counter), type-specific field (water level dropdown / structure type dropdown / casualty count stepper), phone number, optional name, optional photos (max 3, thumbnail preview, remove button, size/type errors inline). Submit button shows spinner and disables to prevent double submit. **Mandatory fields are only location, description, severity (+ phone for follow-up)** |
| `/report/success` | **Confirmation** | Large tracking reference with a *Copy* button, "Save this number", status chip, link to track, notice if flagged as possible duplicate (friendly wording) |
| `/track` | **Track report** | Form: tracking ref + phone → shows status stepper (Reported → Verified → Assigned → In progress → Resolved/Closed or Rejected with remark), timeline with times, notifications received, subscribe toggle |
| `/track/:ref/edit` | **Edit report** | Only location/description; if not editable show explanatory message (409 mapped) |

### 5.2 Coordinator pages (login required, role `coordinator`)
| Route | Page | Detail |
|---|---|---|
| `/coordinator/incidents` | **Verification queue / dashboard** (UI-2) | Top stat cards (Reported, Verified, In progress, Critical open), filter bar (status tabs, severity, type, search, "possible duplicates only"), table sorted critical-first then oldest, **row colour/badge by severity and age** (age > 30 min on `reported` shown in red text), auto-refresh every 10 s with a subtle "updated 3 s ago" indicator and manual refresh button, empty and loading skeleton states, pagination |
| `/coordinator/incidents/:id` | **Report detail** | Header (ref, severity badge, status badge), map with the pin, photo gallery with lightbox, type-specific details, reporter contact (click-to-call), **nearby similar reports** card (from `/nearby`) with "mark as duplicate and reject" shortcut, audit timeline, action bar: **Verify**, **Reject** (modal with required remark and live validation), **Dispatch** (visible when `verified`; navigates to B's `/coordinator/dispatch/:id`), **Close** (visible when `resolved`). Buttons are disabled with a tooltip when the transition is not allowed |
| (shared) | Notification bell | Built by B in the shell; you only make sure your backend returns correct data |

### 5.3 Frontend technical requirements
* Forms: `react-hook-form` + `zod`; error text under each field, `aria-invalid`, focus the first invalid field on submit.
* Data: TanStack Query hooks in `features/incidents/api.ts` (`useIncidents`, `useIncident`, `useCreateIncident`, `useVerify`, ...); mutations invalidate the queue query; optimistic UI is not required.
* Every async view needs **loading, empty and error** states; map server error `code`s to friendly messages.
* Accessibility (WCAG 2.1 AA target for the citizen form): visible labels, colour is never the only signal (severity badges include text), 44 px minimum touch targets, keyboard operable, sufficient contrast.
* Multilingual (SRS §6, **stretch goal**): `react-i18next` with `en`, `hi`, `mr` JSON for the report form and confirmation screens only.
* Photo upload sent as `FormData` (`data` as JSON string + `photos`).

## 6. Testing (your minimum)

**Backend (`pytest`, use a separate test database):**
1. Cannot instantiate `IncidentReport` directly (abstract).
2. Factory creates the right subclass; type-specific field validation per type.
3. Submit anonymous report → 201, `tracking_ref` format, citizen row created by phone.
4. Duplicate check: report at 150 m / 1 h → flagged; at 300 m or 3 h → not flagged.
5. Verify as coordinator → `verified`; as citizen/anonymous → 403/401 (BR-1).
6. Reject without remark → 422 `REMARK_REQUIRED`; with remark → `rejected` then `closed`, citizen notified.
7. Invalid transition (e.g. `closed → verified`) → 409.
8. Edit allowed in `reported`, rejected with 409 after `verified`.
9. Tracking with wrong phone → 404 (SE-3).
10. Every transition creates an audit row; notifications created for coordinators on submit, citizen on verify/reject, and on later status changes only when subscribed (SD opt fragment).
11. Photo rules: 4th photo rejected, wrong mime rejected.

**Frontend:** at least Vitest + Testing Library tests for the report form validation and the reject modal (remark required). Also run `tsc --noEmit` and `eslint` clean.

**Manual QA table to fill before the demo:** each SD message (1 to 10), each alt branch, the opt branch, mobile width (375 px), keyboard-only submit, slow network (throttle in browser dev tools).

## 7. Task breakdown for you (checklist)

- [ ] Foundation: compose, config, DB, errors, security, deps, enums, Alembic, seed (Day 1)
- [ ] `User` hierarchy models + `Coordinator.assign_team` delegator (Day 1)
- [ ] `IncidentReport` ABC, 3 subclasses, factory, state machine, audit service (Day 2)
- [ ] `POST /incidents` with photos, duplicate check, tracking ref (Day 2 to 3)
- [ ] `NotificationService` + `Notification` class + channel filter (Day 3)
- [ ] Verify / reject / close endpoints + SD alt/opt notifications (Day 4)
- [ ] Track / edit / subscribe / citizen notifications endpoints (Day 4 to 5)
- [ ] Citizen pages: home, report form, confirmation, track, edit (Day 3 to 6)
- [ ] Coordinator queue + detail + modals (Day 6 to 7)
- [ ] Backend tests + frontend tests (Day 7 to 8)
- [ ] Full integration with B's dispatch; fix issues (Day 5, 8)
- [ ] README setup section, polish, demo rehearsal (Day 9 to 10)

## 8. Definition of done for your part
* All endpoints in §4.3 return the shared error format and have tests.
* Every SD message (1 to 10) is traceable to code with a comment.
* A brand-new clone runs with `docker compose up -d`, `alembic upgrade head`, `python -m app.seed`, `uvicorn app.main:app --reload` and the frontend `npm run dev`.
* Citizen form works at 375 px width and by keyboard only.
* No secret committed; `.env.example` is complete.
* You can explain, without notes: why `IncidentReport` is abstract, how the state machine prevents illegal transitions, how the duplicate check works, and how SE-3 is enforced.

## 9. Likely viva questions for your part
1. Why is `IncidentReport` an interface in the diagram and how did you model it in Python? *(ABC + polymorphic subclasses)*
2. Show the sequence diagram message 5 in code. *(`Notification.filter_by_channel`)*
3. What happens if a coordinator verifies an already rejected report? *(409 `INVALID_TRANSITION`)*
4. How do you keep citizens from seeing each other's reports? *(tracking ref + phone check, 404 otherwise)*
5. How do you handle the `opt [citizen subscribed]` fragment? *(`citizen_subscribed` flag checked in `transition()`)*

---

# SECTION 0: SHARED CONTRACT (identical in both files; read this fully before writing code)

> This section is the agreement between the two team members. **Do not change anything in it unilaterally.** If something must change, both people edit both files together. If this section and your own part ever disagree, this section wins.

## 0.1 What we are building

A **web-only** (no mobile app) implementation of the *Disaster Relief and Rescue Coordination Platform (DRRCP)*. The professor requires: at least 2 core modules, implemented exactly as per the **class diagram** and **sequence diagrams**, one module per member, and a demo of the **integrated** application.

| Module | Owner | Sequence diagram | SRS features |
|---|---|---|---|
| **Module 1: Incident Reporting & Verification** (plus Notification and the User hierarchy) | **Person A** | SD - Report and Verify Incident | 4.1 (Report.*), BR-1, SE-3, SE-5 |
| **Module 2: Rescue Team Dispatch** (plus the whole frontend foundation) | **Person B** | SD - Assign Rescue Team to Incident | 4.2 (Dispatch.*), BR-2, SF-2 |

Not implemented in Release 1 (but kept as stub classes where the class diagram needs them): Shelter, ShelterResource, FoodResource, MedicalResource, Resource, Volunteer behaviour, the "Shelter Occupancy and Resource Allocation" sequence diagram. Mention in the viva that these are the planned third module.

## 0.2 Technology stack (fixed, per SRS CO-1)

| Layer | Choice |
|---|---|
| Backend | Python 3.11+, **FastAPI**, **SQLAlchemy 2.x** (ORM), **Alembic** (migrations), Pydantic v2, `psycopg[binary]`, `PyJWT`, `passlib[bcrypt]`, `python-multipart`, `pytest`, `httpx` |
| Database | **PostgreSQL 15+** (run via Docker Compose) |
| Frontend | **React 18 + TypeScript**, **Vite**, React Router 6, **TanStack Query** (data fetching and polling), `axios`, `react-hook-form` + `zod` (forms and validation), **Tailwind CSS**, `react-leaflet` + `leaflet` (OpenStreetMap maps, WGS-84 per CO-2), `lucide-react` (icons), `date-fns` |
| Real-time | **Polling** with TanStack Query `refetchInterval` (5 to 10 s). No WebSockets, which keeps it simple and meets PE-3 (10 s refresh). |
| Notifications | In-app notification records in the DB plus a simulated SMS/push "gateway" that logs to console (real gateway = TBD-1 in the SRS). |

Everything runs in the browser. The rescue team's "mobile view" is just a **responsive web page** (SRS UI-3), not an app.

## 0.3 Repository layout and who owns what

One Git repository (monorepo). `(A)` and `(B)` mark the owner of each file/folder. **Never edit the other person's files without telling them**; open a small PR or message them instead.

```
drrcp/
├─ docker-compose.yml                  (A)  Postgres 15 (+ optional pgAdmin)
├─ README.md                           (A)  setup + run + demo (merge both parts' notes)
├─ backend/
│  ├─ requirements.txt                 (A)
│  ├─ .env.example                     (A)
│  ├─ alembic.ini, alembic/            (A)  one migration chain; B sends A the model files, A generates migrations
│  ├─ app/
│  │  ├─ main.py                       (A)  app factory, CORS, router registration, error handlers
│  │  ├─ core/
│  │  │  ├─ config.py                  (A)
│  │  │  ├─ database.py                (A)  engine, SessionLocal, get_db
│  │  │  ├─ security.py                (A)  hashing, JWT
│  │  │  ├─ deps.py                    (A)  get_current_user, require_role(...)
│  │  │  ├─ errors.py                  (A)  AppError + handlers (error format in 0.7)
│  │  │  └─ enums.py                   (A)  ALL shared enums (0.5), B reads only
│  │  ├─ models/
│  │  │  ├─ base.py                    (A)
│  │  │  ├─ user.py                    (A)  User, Citizen, Coordinator, SystemAdministrator, Volunteer
│  │  │  ├─ notification.py            (A)
│  │  │  ├─ incident.py                (A)  IncidentReport (abstract), FloodIncident, FireIncident, MedicalEmergencyIncident
│  │  │  ├─ audit_log.py               (A)
│  │  │  ├─ rescue_team.py             (B)  RescueTeam
│  │  │  ├─ rescue_team_member.py      (B)  RescueTeamMember(User)
│  │  │  ├─ team_assignment.py         (B)  TeamAssignment (the "responds to" association table)
│  │  │  └─ app_setting.py             (B)  key/value settings (overdue limit)
│  │  ├─ schemas/                      each person owns the schemas for their routers
│  │  ├─ services/
│  │  │  ├─ geo.py                     (A)  haversine_m(), shared by both
│  │  │  ├─ notification_service.py    (A)
│  │  │  ├─ audit_service.py           (A)
│  │  │  ├─ incident_service.py        (A)
│  │  │  └─ dispatch_service.py        (B)
│  │  ├─ routers/
│  │  │  ├─ auth.py, incidents.py, notifications.py     (A)
│  │  │  └─ teams.py, dispatch.py, team_portal.py       (B)
│  │  └─ seed.py                       (A) users/coordinator/citizens, (B) adds teams and members via seed_dispatch()
│  └─ tests/                           each person tests their own module (+ one shared integration test)
└─ frontend/
   ├─ package.json, vite.config.ts, tailwind.config.ts, tsconfig.json, index.html     (B)
   └─ src/
      ├─ main.tsx, App.tsx, routes.tsx                       (B)
      ├─ lib/ (api.ts, auth.tsx, types.ts, queryClient.ts, format.ts, geo.ts, offlineQueue.ts)  (B)
      ├─ components/ui/*          design system            (B)
      ├─ components/layout/*      AppShell, nav, guards    (B)
      ├─ components/map/*         MapView, LocationPicker  (B)
      ├─ features/auth/           login page               (B)
      ├─ features/notifications/  bell + dropdown + page   (B)
      ├─ features/dispatch/       coordinator dispatch UI  (B)
      ├─ features/rescue/         rescue team web view     (B)
      └─ features/incidents/      citizen + verification UI (A)
```

**Why this split is fair:** A carries more *backend* (database foundation, user hierarchy, auth, notification, incident state machine). B carries more *frontend* (the entire design system, shell, routing, maps, polling, offline queue) plus the dispatch backend. Both people write backend, frontend and tests, so both can demo end to end.

## 0.4 Class diagram → implementation map (all 15 classes)

| Class (diagram) | Implemented by | Notes |
|---|---|---|
| `«interface» User` (name, phone_number, email) | A | Abstract base `User` (SQLAlchemy single-table inheritance, discriminator `role`) |
| `Citizen` (citizen_id, submitReport(), trackStatus()) | A | Citizens need no password (SE-1): identified by phone number |
| `Volunteer` (volunteer_id, skills) | A | Stub only (class + columns, no screens) |
| `SystemAdministrator` (admin_id, manageAccounts(), configureSettings()) | A | Seeded account + minimal `POST /api/admin/users` (optional stretch) |
| `Coordinator` (coordinator_id, verifyReport(), assignTeam(), manageResource()) | A (class), B (`assignTeam` body lives in `DispatchService`) | `manageResource()` is a documented stub that raises `NotImplementedError("Release 2")` |
| `RescueTeamMember` (member_id, status, updateTaskStatus(), updateShelterOccupancy()) | B | `updateShelterOccupancy()` stub (belongs to the shelter module) |
| `Notification` (notification_id, message, channel, send(), filterByChannel()) | A | |
| `«interface» IncidentReport` (report_id, location, severity, status, submit(), verify(), reject()) | A | Python `ABC`; **cannot be instantiated** |
| `FloodIncident` (water_level) | A | |
| `FireIncident` (structure_type) | A | |
| `MedicalEmergencyIncident` (casualty_count) | A | |
| `RescueTeam` (team_id, team_type, status, updateStatus(), reportLocation()) | B | |
| `«interface» Resource`, `ShelterResource`, `FoodResource`, `MedicalResource`, `Shelter` | nobody (Release 2) | Do not build; mention as future module |

**Associations that must exist in code:** Citizen 1—0..* IncidentReport (*submits*); Coordinator 1—0..* IncidentReport (*verifies*); Coordinator 1—0..* RescueTeam (*assigns*); RescueTeam 0..*—0..* IncidentReport (*responds to*, implemented by `TeamAssignment`); RescueTeam 1—1..* RescueTeamMember (*includes*); Notification 0..*—0..* User (*sent to*).

## 0.5 Shared enums (exact string values; used in DB, API and `types.ts`)

Defined once in `backend/app/core/enums.py` (A) and mirrored in `frontend/src/lib/types.ts` (B). Values are lowercase snake_case strings.

| Enum | Values |
|---|---|
| `Role` | `citizen`, `coordinator`, `rescue_team_member`, `system_administrator`, `volunteer` |
| `IncidentType` | `flood`, `fire`, `medical` (matches the 3 subclasses in the class diagram) |
| `Severity` | `low`, `medium`, `high`, `critical` |
| `IncidentStatus` | `reported`, `verified`, `assigned`, `in_progress`, `resolved`, `rejected`, `closed` |
| `TeamType` | `fire`, `medical`, `ndrf`, `local` |
| `TeamStatus` | `available`, `deployed` (UI label: **"Dispatched"**, as in SRS BR-2; the code value is `deployed` to match the sequence diagram message `updateStatus(deployed)`) |
| `MemberStatus` | `available`, `assigned`, `en_route`, `on_site` |
| `AssignmentStatus` | `assigned`, `en_route`, `on_site`, `resolved`, `reassigned` |
| `Channel` | `sms`, `push`, `email`, `in_app` |
| `AlertType` | `new_report`, `verification`, `rejection`, `status_update`, `team_deployed`, `no_team_available`, `task_assigned`, `overdue`, `incident_resolved` |

## 0.6 Incident status state machine (single source of truth, owned by A, used by B)

```
reported ──verify──▶ verified ──assign──▶ assigned ──first team en_route──▶ in_progress ──all teams resolved──▶ resolved ──coordinator closes──▶ closed
   │                    │
   └────reject──────────┴──────reject──▶ rejected ──auto/coordinator──▶ closed
```

Allowed transitions (anything else → HTTP 409 `INVALID_TRANSITION`):

| From | To | Who triggers |
|---|---|---|
| reported | verified, rejected | Coordinator (BR-1; reject needs a remark) |
| verified | assigned, rejected | Coordinator (assign = dispatch service) |
| assigned | in_progress | Rescue team (first member marks `en_route`) |
| assigned | assigned | Reassign (history preserved) |
| in_progress | resolved | Rescue team (last active team marks `resolved` with closing note) |
| resolved | closed | Coordinator |
| rejected | closed | System (immediately on reject, or on coordinator action) |

`IncidentReport.transition(to, actor, remark=None)` (A) is the **only** way status may change. It validates the table above, writes the `audit_logs` row (SE-5) and returns the report. B calls it; B never sets `report.status` directly. Critical-severity reports must stay visible in queues until `resolved`/`rejected`/`closed` (SF-1).

## 0.7 API conventions

* Base path `/api`. JSON everywhere except photo upload (`multipart/form-data`). Datetimes ISO-8601 UTC (`2026-10-12T09:30:00Z`). Coordinates are `latitude`/`longitude` floats (WGS-84).
* **Auth:** `Authorization: Bearer <JWT>` (8 h expiry, claims: `sub` = user id, `role`). Citizens use **no login**; they use `tracking_ref` + phone number.
* **Success list format:** `{ "items": [...], "total": 42, "page": 1, "page_size": 20 }`
* **Error format (every error, every endpoint):**
  ```json
  { "error": { "code": "INVALID_TRANSITION", "message": "Cannot move report from reported to assigned", "details": {} } }
  ```
  Common codes: `VALIDATION_ERROR` (422), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `INVALID_TRANSITION` (409), `TEAM_NOT_AVAILABLE` (409), `NO_TEAM_AVAILABLE` (409), `REMARK_REQUIRED` (422), `REPORT_NOT_EDITABLE` (409).
* CORS: allow `http://localhost:5173`. Frontend dev server proxies `/api` to `http://localhost:8000` (`vite.config.ts`).

## 0.8 Database tables (one Postgres database `drrcp`)

All PKs are integer identity columns; public-facing codes are separate strings. Every table has `created_at` (default `now()`).

**`users`** (A): `id`, `role` (discriminator), `public_code` (`CIT-0001`, `COORD-0001`, `MEM-0001`, `ADM-0001`, `VOL-0001`), `name`, `phone_number` (indexed), `email`, `password_hash` (nullable, citizens have none), `is_active`, `skills` (volunteer only), `member_status` (member only, `MemberStatus`), `team_id` FK→`rescue_teams.id` (member only).

**`notifications`** (A): `id` (= notification_id), `message`, `channel`, `alert_type`, `recipient_user_id` (nullable FK→users), `recipient_phone` (for anonymous citizens), `related_report_id` (nullable FK), `is_read`, `delivery_status` (`queued`/`sent`/`failed`), `sent_at`.

**`incident_reports`** (A): `id` (= report_id), `tracking_ref` (unique, e.g. `DRR-2026-000123`), `incident_type` (discriminator), `location` (text address/description), `latitude`, `longitude`, `severity`, `status`, `description`, `reporter_user_id` FK→users, `reporter_phone`, `verified_by_id` FK→users (nullable), `remark` (rejection remark), `photos` (JSONB list of stored paths, max 3), `possible_duplicate` (bool), `duplicate_of_id` (nullable), `citizen_subscribed` (bool, default true), `closing_note`, `verified_at`, `resolved_at`, `updated_at`; **subclass columns:** `water_level` (text, flood), `structure_type` (text, fire), `casualty_count` (int, medical). All subclass columns nullable at DB level, required by the Pydantic schema of the matching type.

**`audit_logs`** (A): `id`, `actor_user_id` (nullable for citizens/system), `actor_label`, `action` (`create`, `verify`, `reject`, `assign`, `reassign`, `en_route`, `on_site`, `resolve`, `close`, `edit`), `entity_type`, `entity_id`, `from_status`, `to_status`, `remark`, `created_at`.

**`rescue_teams`** (B): `id` (= team_id), `public_code` (`TEAM-001`), `name`, `team_type`, `status` (`available`/`deployed`), `latitude`, `longitude`, `last_location_at`, `base_location` (text), `assigned_by_id` FK→users (the coordinator who last assigned it).

**`team_assignments`** (B): `id`, `report_id` FK, `team_id` FK, `assigned_by_id` FK, `status` (`AssignmentStatus`), `assigned_at`, `en_route_at`, `on_site_at`, `resolved_at`, `closing_note`, `replaced_by_id` (nullable self-FK, for reassign history), `reassign_reason`, `overdue_notified` (bool, default false).

**`app_settings`** (B): `key` PK, `value`. Seeded: `overdue_minutes = 30`.

## 0.9 Cross-module interfaces (the integration contract)

These are the function signatures the two halves call on each other. **Freeze these on Day 1.**

**A provides to B**

```python
# app/core/deps.py
def get_current_user(...) -> User                          # JWT → User
def require_role(*roles: Role)                             # FastAPI dependency, raises FORBIDDEN

# app/services/notification_service.py
class NotificationService:
    def __init__(self, db: Session): ...
    def send(self, alert_type: AlertType, message: str, recipients: list[User | str],
             report: IncidentReport | None = None,
             channel: Channel | None = None) -> list[Notification]
        # Creates Notification rows. A str recipient = raw phone number (anonymous citizen).
        # Internally calls Notification.filter_by_channel() to choose SMS/push/in-app.

# app/services/audit_service.py
def log(db, actor, action: str, entity_type: str, entity_id: int,
        from_status: str | None = None, to_status: str | None = None, remark: str | None = None) -> None

# app/models/incident.py
class IncidentReport(Base, ABC):
    def transition(self, to: IncidentStatus, actor: User | None, remark: str | None = None) -> "IncidentReport"
    # raises AppError(INVALID_TRANSITION)

# app/services/geo.py
def haversine_m(lat1, lon1, lat2, lon2) -> float           # metres

# app/models/user.py
class Coordinator(User):
    def verify_report(self, db, report_id) -> IncidentReport       # A
    def assign_team(self, db, report_id, team_ids=None) -> list     # thin delegator → DispatchService (B)
    def manage_resource(self, *a, **k): raise NotImplementedError
```

**B provides to A**

```python
# app/services/dispatch_service.py
class DispatchService:
    def __init__(self, db: Session): ...
    def assign_team(self, coordinator: Coordinator, report_id: int, team_ids: list[int] | None = None) -> list[TeamAssignment]

# frontend: reusable pieces A imports (delivered by end of Day 2)
#   src/components/ui/*, src/components/map/MapView.tsx, src/components/map/LocationPicker.tsx,
#   src/lib/api.ts (axios instance with token + error mapping), src/lib/auth.tsx (useAuth), src/lib/types.ts
```

## 0.10 Seed data and demo accounts (A writes `seed.py`, B adds teams and members in `seed_dispatch()`)

| Role | Login | Password |
|---|---|---|
| Coordinator | `coordinator@drrcp.test` | `Coord@123` |
| Coordinator #2 | `coordinator2@drrcp.test` | `Coord@123` |
| System Administrator | `admin@drrcp.test` | `Admin@123` |
| Rescue member (Fire Team Alpha) | `fire.alpha1@drrcp.test` | `Rescue@123` |
| Rescue member (Medical Team Bravo) | `med.bravo1@drrcp.test` | `Rescue@123` |
| Rescue member (NDRF Team Charlie) | `ndrf.charlie1@drrcp.test` | `Rescue@123` |

Seed at least: 5 teams (2 fire, 1 medical, 1 NDRF, 1 local) each with 2 to 3 members, spread across Mumbai coordinates (e.g. Andheri 19.1136, 72.8697; Dadar 19.0178, 72.8478; Bandra 19.0596, 72.8295; Kurla 19.0726, 72.8845; Borivali 19.2307, 72.8567), and 6 sample incidents in various statuses so dashboards are never empty.

## 0.11 Git workflow and integration milestones

* Branches: `main` (always runnable) ← `feature/incident-module` (A), `feature/dispatch-module` (B). Merge to `main` via PR reviewed by the *other* person. Commit small and often.
* **Milestones (10 working days; adjust to your deadline):**

| Day | A delivers | B delivers | Joint |
|---|---|---|---|
| 1 | Repo, docker-compose, DB, Alembic baseline, `enums.py`, `User` hierarchy, JWT login, `NotificationService` + `AuditService` stubs with the final signatures | Vite+TS+Tailwind scaffold, routing skeleton, `api.ts`, `types.ts`, `auth.tsx` | **Contract freeze meeting (30 min)** |
| 2 | `IncidentReport` + 3 subclasses, state machine, `POST /incidents` working | Design system (`components/ui`), AppShell, Login page, MapView | B shares UI kit with A |
| 3–5 | Citizen report, track, edit, verify/reject, duplicates, notifications | RescueTeam/Member/Assignment models, `DispatchService`, available-teams, assign | **Mid-point integration: verify → assign works end to end** |
| 6–7 | Verification queue and detail UI, history, subscribe/notify | Dispatch console, active operations, rescue team view, location reporting | |
| 8 | Tests, bug fixes, i18n stretch | Tests, offline queue, overdue alerts, operations map | **Full integration + demo rehearsal** |
| 9–10 | README, polish, edge cases | Polish, responsive checks, accessibility pass | **Final demo dry-run** |

## 0.12 Combined demo script (about 6 minutes; both people present their own part)

1. **(A)** Citizen opens the home page on a phone-sized window, fills the report form (Flood, location picked on map, severity High, water level "knee-deep"), attaches a photo, submits. Shows the tracking reference and the on-screen confirmation.
2. **(A)** Submit a second report 100 m away → show the *possible duplicate* flag in the coordinator queue.
3. **(A)** Citizen opens *Track report* with the reference and phone → status **Reported**.
4. **(A)** Coordinator logs in, sees the colour-coded queue (the new report highlighted), opens it, verifies it. Citizen's tracking page now shows **Verified** and an in-app notification. Reject the duplicate with a mandatory remark.
5. **(B)** Coordinator clicks **Dispatch** → ranked list of available teams (distance, type match). Selects a team, confirms. Team flips to **Dispatched**, report to **Assigned**, members notified.
6. **(B)** In another window, a rescue member logs in, sees the task card, taps **En route** → **On site** → **Resolved** (closing note required). Coordinator board updates within 10 s; report **In progress** → **Resolved**; team returns to **Available**.
7. **(B)** Show **overdue alert** (set `overdue_minutes` low) and **reassign**.
8. **(A)** Coordinator closes the report; show the audit history timeline (SE-5) and notification inbox.
9. **(Both)** Open the class diagram and sequence diagrams and point at the matching files (use the mapping tables in your part).

## 0.13 Assumptions to confirm with your professor (decided here so you can proceed)

1. Incident categories in the UI are **Flood, Fire, Medical** (exactly the 3 subclasses in the class diagram). SRS also lists "building collapse/other"; add those only if you also add subclasses, otherwise the code stops matching the diagram.
2. `RescueTeam.status` code value is `deployed` (diagram wording); UI shows "Dispatched" (SRS wording).
3. Notifications are stored and shown in-app; SMS/push are simulated (console log) because the real gateway is TBD-1.
4. Only one city (Mumbai demo data), as per SRS CO-4.

---
