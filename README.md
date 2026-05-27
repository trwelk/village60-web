# Village60 web (slice 01 — foundation)

This Next.js app provides administrator email and password sign-in, encrypted cookie sessions with an idle-oriented TTL, failed-login lockout, and persisted authentication events, backed by SQLite via Drizzle.

## Prerequisites

- Node.js 20 or newer
- npm

## First-time setup

1. `cd web`
2. `cp .env.example .env.local` (on Windows, copy the file manually) and set `SESSION_PASSWORD` to a random string **at least 32 characters** long.
3. `npm install`
4. `npm run db:migrate` — creates the SQLite file and applies migrations.
5. Create an initial login (pick one):
   - **Admin only:** `npm run db:seed:admin` — inserts `admin@example.com` (password `admin` unless you set `SEED_ADMIN_PASSWORD` in `.env.local`).
   - **Full demo data:** `npm run db:seed` — rich sample dataset (same default admin credentials as `.env.example` comments; seed uses password `admin`).

To wipe the SQLite file and re-run migrations only: `npm run db:reset` (stop `npm run dev` first if the DB is busy). Then run `db:seed:admin` or `db:seed` again.

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should be redirected to `/login`, then to `/dashboard` after a successful sign-in.

## Scripts

| Script            | Purpose                          |
| ----------------- | -------------------------------- |
| `npm run dev`     | Development server               |
| `npm run build`   | Production build                 |
| `npm run test`    | Vitest (password + lockout IAM)  |
| `npm run db:migrate` | Apply SQL migrations          |
| `npm run db:seed:admin` | Insert only `admin@example.com` |
| `npm run db:seed` | Insert full demo data         |
| `npm run db:reset` | Delete local DB + migrate     |
| `npm run db:backup`  | Copy SQLite DB to `BACKUP_DIR`, prune backups older than 7 days |
| `npm run db:generate` | Regenerate migrations from `src/db/schema.ts` |

## Security notes

- Use strong passwords for any seeded or default accounts before any real deployment.
- In production, serve the app over HTTPS so the session cookie’s `Secure` flag is effective (`NODE_ENV=production`).
