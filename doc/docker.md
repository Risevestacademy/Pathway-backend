# Local PostgreSQL (Docker)

Every developer runs the same Postgres setup locally via Docker Compose, configured entirely through environment variables — no credentials are hardcoded or committed.

## First-time setup

1. Copy `.env.example` to `.env` in the repo root:
   ```bash
   cp .env.example .env
   ```
2. `.env` is already gitignored — confirm it's in `.gitignore` if you're not sure. Edit the values in your own `.env` if you want (e.g. a different local password), but the defaults work fine for local dev.
3. Start the database:
   ```bash
   docker compose up -d
   ```
   The `-d` runs it in the background. Docker Compose automatically reads variables from `.env` in the same directory — you don't need to export anything manually.

## Everyday commands

| Action | Command |
|---|---|
| Start the database | `docker compose up -d` |
| Stop the database (keeps data) | `docker compose stop` |
| Stop and remove the container (keeps data — volume persists) | `docker compose down` |
| Stop and **wipe all data** | `docker compose down -v` |
| View logs | `docker compose logs -f postgres` |
| Check container status | `docker compose ps` |

## Inspecting the database

**Via `psql` inside the container:**
```bash
docker compose exec postgres psql -U pathway_user -d pathway_dev
```
(Replace user/db name if you changed them in `.env`.)

Useful psql commands once inside:
- `\dt` — list tables
- `\d "TableName"` — describe a table
- `\q` — quit

**Via a GUI client** (TablePlus, DBeaver, Postico, etc.): connect using the same values as `DATABASE_URL` — host `localhost`, port from `POSTGRES_PORT` (default `5432`), and the user/password/db from your `.env`.

## Verifying it's working

```bash
docker compose ps
```
Should show the container as `healthy` (the healthcheck runs `pg_isready` every 5s).

## Connecting the app

The app reads `DATABASE_URL` from `.env` (via `ConfigModule`, once that ticket lands — for now, Prisma reads it directly). It's already set in `.env.example` to match the Postgres service values by default. If you change `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, or `POSTGRES_PORT`, update `DATABASE_URL` to match — they're not auto-linked, they just happen to reference the same values.

## Data persistence

Data is stored in a named Docker volume (`postgres_data`), not inside the container itself. That means:
- `docker compose down` (without `-v`) — container is removed, **data survives**, next `docker compose up` reattaches to the same volume.
- Container restarts (`docker compose restart`, or a crash) — **data survives**, nothing special needed.
- `docker compose down -v` — this **deletes the volume and all data**. Only do this intentionally (e.g. you want a clean slate).
