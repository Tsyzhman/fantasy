# Local Development

The included Docker Compose service exposes PostgreSQL on port `5433` to avoid colliding with an existing local database on `5432`.

```bash
docker compose up -d
copy .env.example .env
npm install
npm run prisma:push
npm run db:seed
npm run dev
```

Open:

- Admin leagues: `http://localhost:3000/admin/leagues`
- Championship workspace: `http://localhost:3000/admin/leagues/championship`
- Published players: `http://localhost:3000/players`
