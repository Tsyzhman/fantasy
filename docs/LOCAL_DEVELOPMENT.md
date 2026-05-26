# Local Development

The included Docker Compose service exposes PostgreSQL on port `5433` to avoid colliding with an existing local database on `5432`.

Use Node.js `>=20.9.0`; this matches the installed Next.js engine requirement
and the GitHub Actions check. If you use nvm, run `nvm use` to pick the
version from `.nvmrc`.

```bash
docker compose up -d postgres
copy .env.example .env
npm install
npm run prisma:push
npm run db:seed
npm run dev
```

If `/login` shows `Database is not configured`, make sure `.env` exists,
contains `DATABASE_URL`, and restart `npm run dev`.

Open:

- Admin leagues: `http://localhost:3000/admin/leagues`
- Premier League workspace: `http://localhost:3000/admin/leagues/premier-league`
- Published players: `http://localhost:3000/players`

Before pushing changes, run:

```bash
npm run check
```

This runs tests, lint, typecheck, and production build sequentially so Next.js
type generation and `.next` writes do not race each other.
