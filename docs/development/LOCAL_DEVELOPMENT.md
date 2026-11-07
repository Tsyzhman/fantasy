# Local development

Use the Node.js 24 LTS patch pinned in [`.nvmrc`](../../.nvmrc) and npm.
With nvm, run `nvm use` from the repository root. Docker Compose starts
local PostgreSQL on port `5433`. The standard PostgreSQL port remains
available for other instances.

## Set up the app

Copy `.env.example` to `.env` and configure `DATABASE_URL` for the local
database. Use `Copy-Item .env.example .env` in PowerShell or
`cp .env.example .env` on macOS and Linux.

```sh
docker compose up -d postgres
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run db:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000). The first account is created
through `/setup`. Import provider data from the admin ingestion screen or
run the documented FotMob job. [FotMob import](../integrations/MACHETE_FOTMOB_IMPORT.md)

If `/login` shows `Database is not configured`, check `DATABASE_URL` in
`.env` and restart the dev server.

## Checks

Run `npm run check` for the version check, unit tests, lint, type generation,
and the production build. Keep these steps sequential because type generation
and the build both write to `.next`.

CI runs database tests serially against separate disposable PostgreSQL 16
databases. For local integration checks, migrate a fresh database in each group
and run only the corresponding files with `tsx --test --test-concurrency=1`.

| Group | CI database | Tests |
|---|---|---|
| Common | `fantasy_scout_test_ci` | `*.db-test.ts` under `src/` outside Arena and KHL |
| Arena | `fantasy_betting_test_ci` | `src/betting/*.db-test.ts` |
| KHL | `khl_test_ci` | `*.db-test.ts` under `src/khl` and `src/server/khl` |

Use loopback port `55439` and set the PostgreSQL session timezone to `UTC`
as in CI. Set `CI=true` and set `KHL_TEST_DATABASE=true`
only for the KHL group. Some tests check the exact host, port and database
name. For migration drift use a separate disposable shadow schema with
`SHADOW_DATABASE_URL`. [CI check workflow](../../.github/workflows/check.yml)

`npm run test:e2e -- --list` lists browser scenarios. For authenticated smoke
tests, use the QA account and settings from the browser guide.
[Browser checks](../testing/BROWSER_BETA_CHECK.md)

## Clean generated files

Stop the local dev server or build. Preview and remove generated Next.js and
Playwright files with these commands.

```sh
npm run clean:dev -- --dry-run
npm run clean:dev
```

The command targets the Next.js output, TypeScript cache, and dedicated test
result folders. Local databases, Playwright sign-in state, backups, and
user-generated exports stay available. Historical repository evidence is
indexed separately. [Documentation archive](../archive/README.md#historical-evidence)
