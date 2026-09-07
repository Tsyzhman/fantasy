-- CreateTable
CREATE TABLE "khl_transfer_scenarios" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "dataRevision" INTEGER NOT NULL,
    "weekId" TEXT NOT NULL,
    "weekRevision" INTEGER NOT NULL,
    "baselineHash" TEXT NOT NULL,
    "quoteHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "steps" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "khl_transfer_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "khl_transfer_scenarios_userId_status_expiresAt_idx" ON "khl_transfer_scenarios"("userId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "khl_transfer_scenarios_userId_idempotencyKey_key" ON "khl_transfer_scenarios"("userId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "khl_transfer_scenarios" ADD CONSTRAINT "khl_transfer_scenarios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khl_transfer_scenarios" ADD CONSTRAINT "khl_transfer_scenarios_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "khl_user_squads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
