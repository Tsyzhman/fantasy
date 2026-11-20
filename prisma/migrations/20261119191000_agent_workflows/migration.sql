-- @spec spec://modules/agents/FEAT-017-squad-workflows#root
CREATE TABLE "agent_workflows" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "agent_workflows_user_id_id_idx" ON "agent_workflows"("user_id", "id");

CREATE TABLE "agent_workflow_versions" (
    "workflow_id" TEXT NOT NULL REFERENCES "agent_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    PRIMARY KEY ("workflow_id", "version")
);

CREATE TABLE "agent_workflow_runs" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "workflow_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "expected_squad_version" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("workflow_id", "version") REFERENCES "agent_workflow_versions"("workflow_id", "version") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_workflow_runs_user_id_idempotency_key_key" ON "agent_workflow_runs"("user_id", "idempotency_key");
CREATE INDEX "agent_workflow_runs_user_id_workflow_id_id_idx" ON "agent_workflow_runs"("user_id", "workflow_id", "id");
