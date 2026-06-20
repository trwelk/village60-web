# Operations runbook (slice 10)

Short reference for production-style deployment: HTTPS, secrets, SQLite backups, and restore.

## HTTPS

- Terminate TLS at your host (reverse proxy, load balancer, or PaaS). The app sets the session cookie `Secure` when `NODE_ENV=production`, so browsers only send it over HTTPS.
- Smoke test: open the site with `https://` and confirm login works.

## Secrets

- **Never** commit real secrets. Use `.env.example` as the key list; set values in the host environment or a secret manager.
- Required in production: `SESSION_PASSWORD` (≥32 characters). **Do not** set `ALLOW_INSECURE_SESSION_PASSWORD` in production—the server refuses to start if it is set.
- Optional: `DATABASE_PATH`, `BACKUP_DIR` (see below).

## Daily backups (7-day retention)

- This app uses file-based SQLite. Run **`npm run db:backup`** on a schedule (cron, systemd timer, or your platform’s job runner) **once per day**.
- Backups are written under `BACKUP_DIR` (default `./data/backups`) as `village60-YYYY-MM-DDTHH-MM-SS.sqlite` (UTC). The same command **deletes** backup files in that folder older than **7 days** (by file mtime).
- **Verify**: after the first run, confirm new files appear under the backup directory. Keep monitoring as part of your ops checklist.

## Restore procedure

1. Stop the application process so nothing writes to the database file.
2. Copy the chosen backup file over the live DB path (`DATABASE_PATH`, or default `./data/village60.sqlite`). Prefer a copy while the app is stopped; you can rename the broken file aside first.
3. If you deploy from a newer app version than when the backup was taken, run `npm run db:push` before starting (syncs schema from `src/db/schema.ts`).
4. Start the app and smoke test login and a critical read/write path.

## Restore drill (acceptance)

- Schedule a **time-boxed** restore test (e.g. on a staging VM or disposable instance): backup → intentional “break” → restore from yesterday’s file → confirm access. Record date and outcome for the team.
