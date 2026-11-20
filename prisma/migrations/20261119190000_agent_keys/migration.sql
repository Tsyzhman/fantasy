-- @spec spec://modules/agents/FEAT-016-personal-agent-api#keys
CREATE TABLE "AgentKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "secretHash" CHAR(64) NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "AgentKey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentKey_secretHash_key" ON "AgentKey"("secretHash");
CREATE INDEX "AgentKey_userId_createdAt_id_idx" ON "AgentKey"("userId", "createdAt", "id");

-- @spec spec://modules/agents/FEAT-016-personal-agent-api#authorization
CREATE TABLE "AgentCallAudit" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "transport" VARCHAR(8) NOT NULL,
    "operation" VARCHAR(128) NOT NULL,
    "outcome" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentCallAudit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentCallAudit_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "AgentKey"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AgentCallAudit_keyId_createdAt_idx" ON "AgentCallAudit"("keyId", "createdAt");
