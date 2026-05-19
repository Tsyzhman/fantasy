import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  scoringSchemaPromise?: Promise<void>;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function ensureDatabaseSchema() {
  if (process.env.NEXT_PHASE === "phase-production-build") return Promise.resolve();
  if (!process.env.DATABASE_URL) return Promise.resolve();

  globalForPrisma.scoringSchemaPromise ??= prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF to_regclass('"PlayerSnapshot"') IS NOT NULL THEN
    ALTER TABLE "PlayerSnapshot" ADD COLUMN IF NOT EXISTS "scoringScore" DOUBLE PRECISION;
    CREATE INDEX IF NOT EXISTS "PlayerSnapshot_scoringScore_idx" ON "PlayerSnapshot"("scoringScore");
  END IF;

  IF to_regclass('"MachetePlayerSnapshot"') IS NOT NULL THEN
    ALTER TABLE "MachetePlayerSnapshot" ADD COLUMN IF NOT EXISTS "scoringScore" DOUBLE PRECISION;

    WITH ranked_snapshots AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "playerId", COALESCE("leagueId", ''), COALESCE("teamId", '')
          ORDER BY "createdAt" DESC, id DESC
        ) AS row_number
      FROM "MachetePlayerSnapshot"
      WHERE "periodFrom" IS NULL AND "periodTo" IS NULL
    )
    DELETE FROM "MachetePlayerSnapshot"
    WHERE id IN (
      SELECT id FROM ranked_snapshots WHERE row_number > 1
    );

    CREATE INDEX IF NOT EXISTS "MachetePlayerSnapshot_scoringScore_idx" ON "MachetePlayerSnapshot"("scoringScore");
    CREATE UNIQUE INDEX IF NOT EXISTS "MachetePlayerSnapshot_current_unique_idx"
      ON "MachetePlayerSnapshot"("playerId", (COALESCE("leagueId", '')), (COALESCE("teamId", '')))
      WHERE "periodFrom" IS NULL AND "periodTo" IS NULL;
  END IF;

  IF to_regclass('"FantasyModel"') IS NOT NULL THEN
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaGk" TEXT;
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaDef" TEXT;
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaMid" TEXT;
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaFwd" TEXT;
    ALTER TABLE "FantasyModel" ADD COLUMN IF NOT EXISTS "scoringFormulaEnabled" BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
  END IF;

  IF to_regclass('"UserSession"') IS NULL THEN
    CREATE TABLE "UserSession" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
    CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");
    CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
    ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

END $$;
`)
    .then(() => undefined)
    .catch((error) => {
      console.error("[db] Failed to ensure database schema.", error);
    });

  return globalForPrisma.scoringSchemaPromise;
}
