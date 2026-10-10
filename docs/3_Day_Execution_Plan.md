# DRRCP — 3-Day Execution Plan (Saturday · Monday · Wednesday)

**Project:** Disaster Relief and Rescue Coordination Platform (web only: FastAPI + React/TypeScript + PostgreSQL)
**Team:** **Person A** = Incident Reporting & Verification + backend foundation · **Person B** (you) = Rescue Team Dispatch + frontend foundation
**Commit days:** Day 1 = **Saturday 10 Oct (tonight)** · Day 2 = **Monday 12 Oct** · Day 3 = **Wednesday 14 Oct**

> Read this together with `Part1_PersonA_Incident_Module.md` and `Part2_PersonB_Dispatch_Module.md`. Those files say **what** each class, endpoint and page must do. This file says **when** each thing gets built. Section 0 (shared contract) in those files is still the rulebook for enums, tables, endpoints and function signatures.

---

## 0. How this differs from the 10-day plan (deliberate changes to fit 3 days)

| Change | Why |
|---|---|
| **No Alembic.** Use `Base.metadata.create_all()` through `python -m app.init_db` and re-run `python -m app.seed` whenever models change. | Removes the "A generates migrations for B" bottleneck. Add Alembic only if you have spare time at the end. |
| **Scope is tiered** (Must / Should / Cut, see §5). | Three days cannot hold everything. The *Must* list covers the whole demo script. |
| **Saturday is a short, foundation-only day** (about 4 to 5 hours each, because it starts late at night). Monday and Wednesday are full days (about 8 hours each). | Keeps the plan realistic. If you have more or less time on any day, tell me and I'll rebalance. |
| **Each person pushes a feature branch daily, the other reviews for 10 minutes, then it is merged to `main` the same day.** | Gives the daily GitHub commits you need without blocking each other. |

---

## 1. Rules for working in parallel (read once, follow all 3 days)

1. **Own your files.** The `(A)` / `(B)` ownership in the folder architecture still applies. Do not edit the other person's files. Message them instead.
2. **Shared files are frozen** unless both agree: `core/enums.py` (A) and `lib/types.ts` (B). If an enum changes, change both on the same day.
3. **Handoff deadlines matter more than anything else** (table in §2). If you will miss one, tell the other person *before* it is due.
4. **Start every day with a 15-minute sync:** pull `main`, say what you finished, what is blocked, what you need from the other person.
5. **End every day with a 30 to 45 minute integration session:** merge both branches into `main`, run the app together, run the day's "Done when" checks, fix breakages, then push.
6. **Git commands** (use every day):
   ```bash
   # first time only
   git checkout -b feature/incident-module      # Person A
   git checkout -b feature/dispatch-module      # Person B

   # during the day (commit small and often)
   git add -A
   git commit -m "feat(dispatch): rank available teams by distance"
   git push -u origin <your-branch>

   # end of day: open a Pull Request on GitHub → other person reviews → Merge into main
   git checkout main && git pull

   # next morning, bring main into your branch
   git checkout <your-branch> && git merge main
   ```
   Commit message format: `feat(area): ...`, `fix(area): ...`, `test(area): ...`, `docs: ...`, where area is one of `incident`, `dispatch`, `auth`, `notify`, `ui`, `db`, `rescue`, `infra`.
7. **Never commit** `.env`, `node_modules/`, `__pycache__/`, `backend/uploads/`, `venv/`. Make sure `.gitignore` covers them (A does this first).
8. If the other person's code is not ready yet, **build against the contract** in Section 0 (use mock data) and swap in the real thing after the next merge.

---

## 2. Handoff deadlines (who needs what from whom, and when)

| When | From → To | What | Why it is needed |
|---|---|---|---|
| Sat, **first ~1.5 h** | A → B | `main` has repo skeleton + `core/*`, `models/base.py`, `models/user.py`, `enums.py` | B's `RescueTeamMember(User)` and dispatch models extend these |
| Sat, end | B → A | Frontend scaffold, `types.ts`, `api.ts`, routes with placeholder pages, UI kit v1, `LocationPicker` | A drops citizen pages into the router and uses the UI kit on Monday |
| Sat, end | A → B | `POST /api/auth/login`, `GET /api/auth/me`, seeded accounts | B's login page and role guards |
| **Mon, 10:30** | B → A | UI kit v2 (`Stepper`, `Timeline`, `DataTable`, `Pagination`, `Tabs`) | A's track page and coordinator queue |
| **Mon, 12:00** | A → B | `verify`, `reject` endpoints, `GET /api/incidents`, `GET /api/incidents/{id}`, `GET /api/notifications` (+ `read`, `read-all`), `IncidentReport.transition()` fully working | B tests assign on real verified reports and builds the notification bell |
| Mon, end | both | First full integration: submit → verify → assign → en route → on site → resolved | Mid-point proof |
| Wed, 11:00 | A → B | `history`, `nearby`, `close` endpoints | Used by Operations pages and the joint integration test |
| Wed, 15:00 | both | Code freeze for new features. Only bug fixes after this | Leaves time for demo rehearsal |

---

# DAY 1 — SATURDAY (tonight): Foundations

**Goal:** Both halves exist, run, and can talk to each other. Nothing fancy yet.
**Time budget:** about 4 to 5 hours each.

## 1A. Both together (first 20 to 30 minutes)

- [ ] Read Section 0 of both docs together; agree it is final.
- [ ] A creates the GitHub repo (`drrcp`), adds B as collaborator, pushes an empty `main` with `README.md` and `.gitignore`.
- [ ] B clones it. Both create their branches (`feature/incident-module`, `feature/dispatch-module`).
- [ ] Agree on commit message format and the "own your files" rule.
- [ ] Confirm the three decisions: Alembic skipped (`create_all`), category list = Flood / Fire / Medical, team status code `deployed` shown as "Dispatched".

## 1B. Person A — Saturday work (about 4.75 h)

| Block | Time | Task | Details |
|---|---|---|---|
| **A1** | ~60 min | **Repo and infrastructure** | Create `backend/` and `frontend/` folders (empty frontend folder is fine; B fills it). `docker-compose.yml` with `postgres:15` (db `drrcp`). `.gitignore`, `requirements.txt` (fastapi, uvicorn, sqlalchemy, psycopg[binary], pydantic-settings, pyjwt, passlib[bcrypt], python-multipart, pytest, httpx), `.env.example`. Create venv, install, run `uvicorn app.main:app --reload`, confirm `http://localhost:8000/docs` opens. CORS for `http://localhost:5173` |
| **A2** | ~60 min | **Core package** | `core/config.py`, `core/database.py` (engine, `SessionLocal`, `get_db`), `core/errors.py` (`AppError` + handlers producing the shared error JSON, including validation errors → `VALIDATION_ERROR`), `core/security.py` (bcrypt, JWT 8 h), `core/deps.py` (`get_current_user`, `require_role`), `core/enums.py` (every enum from Section 0.5, exact strings). **Push this skeleton to `main` as soon as it runs (target: within first ~2 h) and message B** |
| **A3** | ~90 min | **Models = class diagram** | `models/base.py`; `models/user.py`: `User` (single-table inheritance, `role` discriminator), `Citizen`, `Coordinator` (with `verify_report`, and `assign_team` delegating to `DispatchService` via lazy import, `manage_resource` raising `NotImplementedError`), `SystemAdministrator`, `Volunteer` (stub). `models/incident.py`: abstract `IncidentReport` (ABC, cannot be instantiated) + `FloodIncident`, `FireIncident`, `MedicalEmergencyIncident`, an `IncidentFactory`, and **`transition(to, actor, remark)` with the full state-machine table** from Section 0.6. `models/notification.py` (`Notification.send`, `filter_by_channel`). `models/audit_log.py` |
| **A4** | ~45 min | **Services, auth, seed** | `services/geo.py` (`haversine_m`), `services/audit_service.py` (`log`), `services/notification_service.py` (`NotificationService.send` with the **final signature**, a simple working version that stores rows and logs "SMS" to console). `routers/auth.py`: `POST /api/auth/login`, `GET /api/auth/me`. `app/init_db.py` (create all tables) and `app/seed.py` (2 coordinators, 1 admin, 3 citizens, 6 sample incidents in mixed statuses incl. at least 2 in `verified`) |
| **A5** | ~30 min | **First incident endpoint** | `POST /api/incidents` (JSON only, photos come Monday): validates, builds the right subclass through the factory, creates/finds the citizen by phone, generates `tracking_ref`, returns `{report_id, tracking_ref, status, possible_duplicate:false}`. Verify in Swagger `/docs` |

**A — Done when (check before pushing):**
- [ ] `docker compose up -d`, `python -m app.init_db`, `python -m app.seed`, `uvicorn` all work from a clean terminal.
- [ ] Login as `coordinator@drrcp.test` in Swagger returns a token; `/api/auth/me` works with it.
- [ ] `POST /api/incidents` with `incident_type: flood` creates a `FloodIncident`; sending `fire` fields on a flood returns 422 in the shared error format.
- [ ] Trying `IncidentReport()` raises an error (abstract).
- [ ] PR opened and merged into `main`.

## 1C. Person B (you) — Saturday work (about 4.5 h)

| Block | Time | Task | Details |
|---|---|---|---|
| **B1** | ~45 min | **Frontend scaffold** | `npm create vite@latest frontend -- --template react-ts`. Install: `tailwindcss postcss autoprefixer react-router-dom @tanstack/react-query axios react-hook-form zod @hookform/resolvers react-leaflet leaflet lucide-react date-fns`. Configure Tailwind, `vite.config.ts` proxy for `/api` and `/uploads` → `http://localhost:8000`. Create the folder tree from the architecture (`lib/`, `components/ui|layout|map`, `features/*`). `lib/types.ts` (all enums + API types), `lib/queryClient.ts`, `lib/api.ts` (axios + Bearer token + `ApiError` mapping + auto-logout on 401), `lib/auth.tsx` (`AuthProvider`, `useAuth`) |
| **B2** | ~75 min | **Design system v1** | Tailwind design tokens (palette, radius, focus ring). Components in `components/ui/`: `Button` (variants + loading), `Input`, `Textarea`, `Select`, `FormField`, `Card`, `Badge`, `SeverityBadge` (low green, medium amber, high orange, critical red, always with text), `StatusBadge`, `Modal`, `ConfirmDialog`, `Toast`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorBanner` |
| **B3** | ~45 min | **Shell, routes, login** | `components/layout/AppShell` (top bar, role-based nav, user menu, placeholder for the notification bell, Help link), `PublicShell`, `RequireRole`. `routes.tsx` with **every route in the route table as a placeholder page** (so A can drop real pages in without touching your files). `features/auth/pages/LoginPage` wired to `POST /api/auth/login` (needs A's push), redirect by role |
| **B4** | ~45 min | **Maps** | `components/map/MapView` (markers with colour, popup, fit bounds, default center Mumbai) and `LocationPicker` (click to place pin, "Use my location", returns `{lat, lng}`). Fix Leaflet default marker icon under Vite |
| **B5** | ~60 min | **Dispatch models** | `models/rescue_team.py` (`RescueTeam`: `update_status`, `report_location`, `is_available`), `models/rescue_team_member.py` (`RescueTeamMember(User)`, `update_task_status`, `update_shelter_occupancy` stub), `models/team_assignment.py`, `models/app_setting.py`. Add `seed_dispatch()`: 5 teams (2 fire, 1 medical, 1 NDRF, 1 local) with 2 to 3 members each at Mumbai coordinates (Andheri, Dadar, Bandra, Kurla, Borivali) and the demo rescue accounts from Section 0.10. Pull A's skeleton as soon as it lands and run `init_db` to confirm all tables are created. **If A's skeleton is not pushed yet, write the models against the contract and test after you pull** |
| *(if time remains)* | ~30 min | Early dispatch read endpoint | `GET /api/teams` and `list_available_teams` ranking (haversine × 1.3) tested in Swagger |

**B — Done when (check before pushing):**
- [ ] `npm run dev` opens; `npm run build` has zero TypeScript errors.
- [ ] Log in from the UI as the coordinator and as a rescue member; you land on the correct role route; wrong password shows a friendly error.
- [ ] Visiting a coordinator route while logged out redirects to `/login`; visiting it as a rescue member shows the 403 page.
- [ ] A map with a draggable/clickable pin renders on a test page and returns coordinates.
- [ ] After pulling A's code, `init_db` + `seed` create the teams and members (check in a DB client or Swagger).
- [ ] PR opened and merged into `main`.

## 1D. Saturday joint wrap-up (last 20 to 30 minutes)

- [ ] Merge both PRs into `main`, pull on both machines.
- [ ] Fresh run: DB up → `init_db` → `seed` → backend → frontend → log in from the UI.
- [ ] Write in the group chat: what is ready, what Monday starts with, any contract change.

---

# DAY 2 — MONDAY: Core flows end to end

**Goal:** The main story works: a citizen reports → coordinator verifies → coordinator dispatches → rescue team updates status. By the end of Monday you can click through the whole story, even if screens are rough.
**Time budget:** about 8 hours each.

## 2A. Morning sync (15 minutes)
- [ ] Pull `main`, merge into your branch, run everything, confirm Saturday's "Done when".
- [ ] Review each other's open items; confirm the 10:30 and 12:00 handoffs.

## 2B. Person A — Monday work (about 8 h)

| Block | Time | Task | Details |
|---|---|---|---|
| **A6** | ~2.5 h | **Incident backend, complete** (finish the 12:00 items first) | **Verify / reject / close** endpoints with BR-1 (coordinator only), `REMARK_REQUIRED` on reject, `verify()` / `reject()` on the model, `transition()` writes audit log rows. **Notifications for SD messages 4, 5, 7, 9:** new-report alert to all coordinators + confirmation to the citizen on submit; `filter_by_channel` inside `send`; verification and rejection alerts to the citizen. `GET /api/incidents` (filters `status`, `severity`, `incident_type`, `q`; critical-first then oldest; pagination; critical never hidden until resolved/rejected/closed), `GET /api/incidents/{id}`. `GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`. **Push to `main` by 12:00 and tell B** |
| **A7** | ~1 h | **Report enrichments** | Photo upload (multipart: `data` JSON + up to 3 files; jpeg/png/webp, ≤ 5 MB, random UUID filenames, static mount at `/uploads`). Full validation (phone regex, text lengths, lat/lng ranges, type-specific field required). **Duplicate check** (200 m, last 2 h, same type, bounding box then haversine → `possible_duplicate`, `duplicate_of_id`). `GET /api/incidents/track/{tracking_ref}?phone=` (wrong phone → 404, SE-3) |
| **A8** | ~2.5 h | **Citizen frontend** (`features/incidents/`) | `HomePage` (big "Report an emergency" and "Track my report"). `ReportPage`: 3-step form with `react-hook-form` + `zod`: incident type cards → location (use B's `LocationPicker`, "Use my location", address box) → severity cards, description with counter, type-specific field, phone, optional name, photo uploader (max 3, thumbnails, inline errors); submit button with spinner and double-submit protection. `ReportSuccessPage` (tracking ref + Copy button + duplicate notice). `TrackPage` basic (ref + phone → status + simple list). Mobile-first at 375 px |
| **A9** | ~2 h | **Coordinator frontend** | `IncidentQueuePage`: filter bar, severity badges, **row colour by severity and age**, critical-first sort, auto-refresh every 10 s with "updated x s ago", loading/empty/error states, pagination (uses B's `DataTable`). `IncidentDetailPage`: header, map pin, photo gallery, type-specific details, **Verify** and **Reject** (with `RejectModal`, remark required), **Dispatch** button (visible when `verified`; navigates to `/coordinator/dispatch/:id`, B's page; buttons disabled with tooltip when not allowed) |

**A — Done when:**
- [ ] From the browser at phone width, a citizen submits a flood report with a photo and sees a tracking reference.
- [ ] A second report 100 m away is flagged as possible duplicate in the coordinator queue.
- [ ] Coordinator logs in, sees the report at the top if critical, opens it, **verifies** it; rejecting without a remark is blocked in UI and API.
- [ ] Notification rows exist in the DB for coordinators (new report) and the citizen (received, verified, rejected).
- [ ] Console shows the simulated SMS lines.

## 2C. Person B (you) — Monday work (about 7.5 h)

| Block | Time | Task | Details |
|---|---|---|---|
| **B6** | ~45 min | **UI kit v2 (push by 10:30)** | `Stepper` (Reported → Verified → Assigned → In progress → Resolved/Closed), `Timeline`, `DataTable` (columns, row click, loading skeleton), `Pagination`, `Tabs`. Tell A when pushed |
| **B7** | ~2.5 h | **`DispatchService` + endpoints** (core of your module) | `list_available_teams` (available teams with an available member, distance = haversine × 1.3, suitable-type bonus, returns `team_id, name, team_type, distance_km, member_count, suitable`). **`assign_team`** in one transaction following SD messages 3 to 10: lock report and teams `FOR UPDATE`, report must be `verified`, **BR-2** re-check (`TEAM_NOT_AVAILABLE`), **no team → send `no_team_available` alert and return 409 `NO_TEAM_AVAILABLE`**, for each team `update_status(deployed)`, create `TeamAssignment`, **loop** members calling `update_task_status(assigned)`, `report_location()`, `report.transition(assigned)`, send `team_deployed` alert, audit log. **`update_task_status`** for the member: `en_route` (report → `in_progress`), `on_site`, `resolved` (closing note required; team and members back to `available`; report → `resolved` when all assignments done; SD msg 11), repeating a status is idempotent. `update_location`. Routers: `GET /api/teams`, `GET /api/incidents/{id}/available-teams`, `POST /api/incidents/{id}/assign`, `GET /api/team/my-task`, `POST /api/team/tasks/{assignment_id}/status`, `POST /api/team/location`. Test in Swagger with the seeded `verified` incidents until A's verify endpoint lands at 12:00 |
| **B8** | ~2 h | **Dispatch Console + notifications UI** | `DispatchConsolePage` (`/coordinator/dispatch/:incidentId`): incident summary panel, map with incident pin and team markers, ranked team list with distance and "Best match", checkboxes, confirm dialog, states: loading, **no team available**, report not verified, `TEAM_NOT_AVAILABLE` toast + refresh, success panel. `NotificationBell` in the shell (polls every 15 s, unread count, dropdown, mark all read; needs A's 12:00 push) and `NotificationsPage` |
| **B9** | ~1.5 h | **Rescue team web view (basic)** | `/team` page: team header, `TaskCard` (type, severity, location, "Open in maps" link, call reporter), polling `my-task` every 10 s, standby empty state, large buttons for **En route → On site → Resolved** (only the next valid step enabled), closing-note bottom sheet (required), basic location sharing with `watchPosition` every 30 s |
| **B10** | ~30 min | **Self-check** | Run through assign and status updates against A's real verified reports; fix mismatches in the contract |

**B — Done when:**
- [ ] Coordinator opens a verified report, clicks Dispatch, sees ranked teams with distances, assigns a team: team shows **Dispatched**, report shows **Assigned**.
- [ ] Assigning an already dispatched team gives the friendly "just dispatched" message (BR-2); dispatching with all teams busy shows the **no team available** state and creates the alert.
- [ ] Rescue member logs in on a phone-width window, sees the task, taps En route → On site → Resolved (note required); team becomes **Available** again and the report becomes **Resolved**.
- [ ] The bell shows real notifications.

## 2D. Monday joint integration (last 30 to 45 minutes)

- [ ] Merge both PRs into `main`, pull on both machines, fresh DB (`init_db` + `seed`).
- [ ] Run the story once together: submit → verify → dispatch → en route → on site → resolved.
- [ ] Write a bug list (who owns each bug) for Tuesday and Wednesday morning.
- [ ] Both push to GitHub.

> **Tuesday (no commit required):** if you have spare hours, use them for bugs from the list, or start the Wednesday items.

---

# DAY 3 — WEDNESDAY: Completion, tests, polish, demo

**Goal:** Everything in the *Must* and *Should* lists works; tests pass; a fresh clone runs from the README; the full demo script succeeds twice in a row.
**Time budget:** about 8 hours each. **Code freeze for new features at 15:00.**

## 3A. Morning sync (15 minutes)
- [ ] Pull `main`, merge into your branch, go through the bug list, confirm the 11:00 handoff.

## 3B. Person A — Wednesday work (about 8 h)

| Block | Time | Task | Details |
|---|---|---|---|
| **A10** | ~1.5 h | **Backend remainder** (push `history`, `nearby`, `close` by 11:00) | `GET /api/incidents/{id}/history` (audit timeline), `GET /api/incidents/{id}/nearby` (200 m / 2 h), `POST /api/incidents/{id}/close` (resolved → closed), `PATCH /api/incidents/track/{ref}?phone=` (edit location/description only while `reported`, else 409 `REPORT_NOT_EDITABLE`), `POST .../subscription` and **SD message 10**: send `status_update` on every later status change when `citizen_subscribed` (implemented inside `transition()` so B's dispatch changes trigger it), `GET .../track/{ref}/notifications`, `GET /api/stats/incidents` |
| **A11** | ~2 h | **Frontend remainder** | `TrackPage` full: status `Stepper`, timeline, notifications received, subscribe toggle, rejected state with remark. `EditReportPage` (with 409 message handling). Coordinator detail: **nearby similar reports** card, **audit history** timeline, **Close** button when `resolved`. Queue: stat cards (Reported, Verified, In progress, Critical open), "possible duplicates only" filter |
| **A12** | ~2 h | **Tests** | Backend (`pytest`, separate test DB): abstract class cannot be instantiated; factory and per-type validation; anonymous submit + tracking ref format; duplicate check (150 m / 1 h flagged, 300 m or 3 h not); verify as coordinator vs citizen (BR-1); reject needs remark; invalid transition → 409; edit allowed in `reported` only; wrong phone → 404; audit rows created; notification rules incl. the subscribed/unsubscribed `opt` branch; photo rules. Frontend: Vitest for report form validation and reject modal. Run `tsc --noEmit` and `eslint` on your files |
| **A13** | ~1 h | **README and clean-clone test** | Root `README.md`: prerequisites, `docker compose up -d`, backend setup, `init_db`, `seed`, run, frontend setup, demo accounts table, folder map, link to the diagrams. **Test it on a brand-new clone in a different folder** and fix whatever breaks |
| **A14** | ~1.5 h | **Demo prep** | Rehearse demo steps 1 to 4 and 8 from the combined demo script. Add `# SD msg N` comments next to every sequence-diagram message in code. Prepare answers to the viva questions in your part. Fix remaining bugs |

**A — Done when:**
- [ ] Every item in Part 1 §8 (Definition of done) is true, except the explicitly cut items in §5 of this file.
- [ ] `pytest` green for your tests.
- [ ] Fresh clone runs from the README with no hidden steps.

## 3C. Person B (you) — Wednesday work (about 8 h)

| Block | Time | Task | Details |
|---|---|---|---|
| **B11** | ~1.5 h | **Backend remainder** | `reassign` (old assignment → `reassigned` with reason and `replaced_by_id`, old team and members → `available`, new team goes through the assign steps, report stays `assigned`, history preserved), `GET /api/dispatch/assignments`, `GET /api/dispatch/overdue` (assigned_at + `overdue_minutes` passed and no `on_site_at`; create one `overdue` notification via `overdue_notified`), `GET/PUT /api/dispatch/settings` (1 to 600 min), `GET /api/dispatch/map`, `GET /api/teams/{id}`. Role checks: members can only update **their own team's** task |
| **B12** | ~2 h | **Coordinator frontend remainder** | `OperationsBoardPage`: active assignments with progress `Stepper`, elapsed time, **Overdue** red badge, **Reassign** modal (reason required), tabs Active / Overdue / Resolved today, settings drawer for `overdue_minutes`, banner on new overdue alert (polls every 10 s). `OperationsMapPage` (incident markers by severity, team markers by type/status, legend, filters) — *Should*. `TeamsPage` + simple `TeamDetailPage` (members, history) — *Should* |
| **B13** | ~1 h | **Rescue view polish and offline (SF-2)** | `lib/offlineQueue.ts` + `OfflineBanner`: failed status taps are stored with a `client_update_id`, shown as "Pending sync", retried on the `online` event and every 15 s (backend is idempotent). Larger touch targets (≥ 56 px), "Sharing location" indicator, permission-denied message. **Help drawer** content for each role (short step list, UI-4) |
| **B14** | ~1.5 h | **Tests** | Backend: ranking order; assign happy path (team `deployed`, members `assigned`, report `assigned`); **BR-2 race test** (two parallel assigns, exactly one succeeds); no team → 409 + alert; assign on unverified → 409; status order and idempotency; resolved needs note → team free, report `resolved`; reassign keeps history; overdue honours settings; role checks. Frontend: Vitest for `RequireRole`, rescue buttons enabling only the next step, closing-note required, offline queue retry. **Write the shared `test_integration_flow.py` together with A** (report → verify → assign → en route → on site → resolved → close, checking final statuses, audit entries and notifications) |
| **B15** | ~1 h | **Responsive and quality pass** | Check 375 / 768 / 1280 px on every page you own; loading, empty and error state on every data view; keyboard use of modals (focus trap, Esc); `tsc --noEmit`, `eslint`, `npm run build` all clean; no `any` types |
| **B16** | ~1 h | **Demo prep** | Rehearse demo steps 5 to 7. Add `# SD msg N` comments in `dispatch_service.py` for messages 1 to 11. Prepare answers to the viva questions in your part. Add a "Frontend setup" section to the README (send it to A) |

**B — Done when:**
- [ ] Every item in Part 2 §9 (Definition of done) is true, except the explicitly cut items in §5.
- [ ] Reassign works and keeps the old team in the history; overdue badge and alert appear after lowering the minutes in settings.
- [ ] Airplane-mode test: a status tap while offline syncs when back online, with no duplicates.
- [ ] `pytest` and `vitest` green for your tests; `npm run build` clean.

## 3D. Wednesday joint finish (last 1.5 to 2 hours, after the 15:00 code freeze)

- [ ] Merge both PRs into `main`; both pull; **fresh DB** (`init_db` + `seed`).
- [ ] **Run the full demo script (Section 0.12 of the Part docs) end to end, twice in a row**, with two browser windows (coordinator and rescue) and one phone-width window (citizen).
- [ ] Open the class diagram and the sequence diagrams and point at the matching files; check that both of you can explain your own half and the other half in one sentence.
- [ ] Final push; create a GitHub release or tag `v1.0-demo`; download a ZIP of `main` as a backup.
- [ ] Put the demo accounts, the run commands and the diagrams in the README so anyone can run it.

---

## 4. Daily acceptance summary (what your GitHub commit must show)

| Day | Person A pushes | Person B pushes | The app can do |
|---|---|---|---|
| **Sat** | Backend skeleton, all core + user + incident + notification models, auth, seed, first `POST /incidents` | Frontend scaffold, design system v1, shell, routes, login, maps, dispatch models and seed | Log in from the browser as coordinator and rescue member; create an incident through Swagger; maps render |
| **Mon** | Complete incident backend, citizen report flow, coordinator queue and detail with verify/reject, notifications backend | `DispatchService`, assign and status endpoints, Dispatch Console, notification bell, basic rescue view | Citizen reports → coordinator verifies → coordinator dispatches → rescue team updates to resolved |
| **Wed** | Edit/subscribe/history/nearby/close, full tracking UI, tests, README | Reassign, overdue, operations board/map/teams, offline queue, help drawer, tests, polish | Entire demo script, tests green, clean-clone setup |

---

## 5. Priority tiers and what to cut if you fall behind

**Must (never cut; the professor checks these):**
- Class diagram classes as specified, including the abstract `IncidentReport` and the three subclasses, `RescueTeam`, `RescueTeamMember`, `Notification`, user hierarchy.
- **Every message and fragment** of the two sequence diagrams (Report and Verify Incident; Assign Rescue Team to Incident), traceable in code.
- State machine, BR-1 (only coordinators verify/reject), BR-2 (no double-booking), audit log, shared error format.
- Citizen report + track, coordinator queue/verify/reject, dispatch console, rescue team status flow, notifications.
- Both parts run integrated from a single README.

**Should (build if the Must list is healthy by Wednesday 11:00):**
- Edit report, subscription toggle, nearby duplicates card, history timeline.
- Operations board with overdue and reassign, Operations Map, Teams pages.
- Offline queue UI (the idempotent backend endpoint stays in either case).

**Cut in this order if time runs short (note them as "future work" in the viva):**
1. Hindi/Marathi translations (i18n)
2. `POST /api/admin/users` and `POST /api/teams` (use seed data instead)
3. Request rate limiting
4. Teams detail page
5. Operations Map page
6. Frontend unit tests (keep the backend tests)
7. Overdue settings drawer (keep the default 30 minutes)

**Time-check rule:** at Wednesday 11:00, if the Must list is not green, stop all *Should* work and put both people on the Must list and the integration test.

---

## 6. Risks and how to handle them

| Risk | Mitigation |
|---|---|
| A's skeleton is late on Saturday and blocks B's models | B writes models against the contract and tests after pulling; A pushes the skeleton first (A2) before anything else |
| A and B both edit `enums.py` / `types.ts` | Only A edits `enums.py`, only B edits `types.ts`; announce changes in chat the same minute |
| Database schema drifts between your machines | Everyone runs `python -m app.init_db` then `python -m app.seed` after every pull that touches `models/`. If it breaks, drop the DB volume (`docker compose down -v`) and recreate |
| Merge conflicts | Own your files; pull `main` into your branch every morning; keep commits small; never force-push `main` |
| Leaflet marker icons or map CSS missing | Import `leaflet/dist/leaflet.css` once in `main.tsx`; fix marker icon URLs in `MapView` |
| Browser blocks geolocation | Works on `localhost`; keep the manual map pin as the fallback |
| One person is stuck | Say so within 30 minutes. Swap tasks rather than waiting |
| Demo day surprises | Run the demo script on a fresh clone twice on Wednesday; keep a ZIP backup of `main` |

---

## 7. Quick command reference (both people)

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # then edit values if needed
docker compose up -d                                   # from repo root: starts PostgreSQL
python -m app.init_db                                  # create tables
python -m app.seed                                     # demo users, teams, incidents
uvicorn app.main:app --reload                          # http://localhost:8000/docs
pytest                                                 # run backend tests

# Frontend
cd frontend
npm install
npm run dev                                            # http://localhost:5173
npm run build                                          # must be error-free before every push
npx tsc --noEmit && npx eslint src                     # type and lint checks
npx vitest run                                         # frontend tests

# Reset everything if the database gets messy
docker compose down -v && docker compose up -d && python -m app.init_db && python -m app.seed
```

**Demo accounts** (from the shared contract): `coordinator@drrcp.test` / `Coord@123`, `admin@drrcp.test` / `Admin@123`, `fire.alpha1@drrcp.test` / `Rescue@123`, `med.bravo1@drrcp.test` / `Rescue@123`, `ndrf.charlie1@drrcp.test` / `Rescue@123`.
