-- @spec spec://modules/agents/FEAT-017-squad-workflows#squads
CREATE TABLE "agent_squad_saves" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "squad_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "agent_squad_saves_user_id_idempotency_key_key" ON "agent_squad_saves"("user_id", "idempotency_key");
