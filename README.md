# DRRCP: Disaster Relief and Rescue Coordination Platform

Web app: FastAPI + PostgreSQL backend, React/TypeScript frontend (frontend is added by Person B).

## Prerequisites
- Python 3.11+ , Docker Desktop, Git, Node.js 18+ (for the frontend)

## Run the backend
```bash
docker compose up -d                       # PostgreSQL 15 (from repo root)
cd backend
python -m venv venv
venv\Scripts\activate                      # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                     # macOS/Linux: cp .env.example .env
python -m app.init_db                      # create tables
python -m app.seed                         # demo users + sample incidents
uvicorn app.main:app --reload              # http://localhost:8000/docs
```

Reset everything: `docker compose down -v && docker compose up -d && python -m app.init_db && python -m app.seed`

## Demo accounts
| Role | Login | Password |
|---|---|---|
| Coordinator | coordinator@drrcp.test | Coord@123 |
| Coordinator 2 | coordinator2@drrcp.test | Coord@123 |
| System Administrator | admin@drrcp.test | Admin@123 |

(Rescue team accounts are added by Person B's seed.)

## Docs
See `docs/` for the module split, execution plan and diagrams.
