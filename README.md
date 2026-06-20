# Village60 web (slice 01 — foundation)

This Next.js app provides administrator email and password sign-in, encrypted cookie sessions with an idle-oriented TTL, failed-login lockout, and persisted authentication events, backed by SQLite via Drizzle.

## Prerequisites

- Node.js 20 or newer
- npm

## First-time setup

1. `cd web`
2. `cp .env.example .env.local` (on Windows, copy the file manually) and set `SESSION_PASSWORD` to a random string **at least 32 characters** long.
3. `npm install`
4. `npm run db:push` — creates the SQLite file and tables from `src/db/schema.ts`.
5. `npm run db:seed` — inserts demo homes, residents, staff, medicine catalog, and `admin@example.com` (password `admin`).

To wipe the SQLite file and recreate schema: `npm run db:reset` (stop `npm run dev` first if the DB is busy). Then run `npm run db:seed` again.

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
| `npm run db:push` | Create or sync tables from `src/db/schema.ts` |
| `npm run db:seed` | Insert demo data (admin, homes, residents, staff, medicine) |
| `npm run db:reset` | Delete local DB + push schema     |
| `npm run db:backup`  | Copy SQLite DB to `BACKUP_DIR`, prune backups older than 7 days |
| `npm run db:generate` | Generate SQL migrations from schema (optional) |

## Security notes

- Use strong passwords for any seeded or default accounts before any real deployment.
- In production, serve the app over HTTPS so the session cookie’s `Secure` flag is effective (`NODE_ENV=production`).
