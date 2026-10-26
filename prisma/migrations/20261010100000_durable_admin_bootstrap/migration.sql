-- @spec spec://common/FEAT-009-session-authentication#bootstrap
SET lock_timeout = '5s';
SET statement_timeout = '30s';
CREATE TABLE "AuthBootstrapState" (
  "id" TEXT PRIMARY KEY,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "AuthBootstrapState" ("id", "completedAt")
SELECT 'first-admin', CASE WHEN EXISTS (
  SELECT 1 FROM "User" WHERE "role" = 'ADMIN' AND "passwordHash" IS NOT NULL
) THEN CURRENT_TIMESTAMP ELSE NULL END;
