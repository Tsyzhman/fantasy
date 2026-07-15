CREATE TABLE "beta_test_runs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "device_class" TEXT NOT NULL,
  "viewport_width" INTEGER NOT NULL,
  "synthetic" BOOLEAN NOT NULL DEFAULT false,
  "valid" BOOLEAN,
  "without_help" BOOLEAN,
  "transfer_reason_understood" BOOLEAN,
  "usability_rating" INTEGER,
  "critical_issue" BOOLEAN,
  "invalid_reason" TEXT,
  "moderator_notes" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "beta_test_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_test_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "beta_test_runs_viewport_width_check" CHECK ("viewport_width" BETWEEN 240 AND 10000),
  CONSTRAINT "beta_test_runs_usability_rating_check" CHECK ("usability_rating" IS NULL OR "usability_rating" BETWEEN 1 AND 5)
);

CREATE TABLE "beta_test_observations" (
  "id" BIGSERIAL NOT NULL,
  "run_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "route" TEXT NOT NULL DEFAULT '',
  "value" DOUBLE PRECISION,
  "rating" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "beta_test_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "beta_test_observations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "beta_test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "beta_test_observations_count_check" CHECK ("count" > 0),
  CONSTRAINT "beta_test_observations_value_check" CHECK ("value" IS NULL OR ("value" >= 0 AND "value" <= 1000000))
);

CREATE UNIQUE INDEX "beta_test_observations_run_id_kind_name_route_key"
  ON "beta_test_observations"("run_id", "kind", "name", "route");

CREATE INDEX "beta_test_runs_user_id_started_at_idx"
  ON "beta_test_runs"("user_id", "started_at");

CREATE INDEX "beta_test_runs_synthetic_valid_started_at_idx"
  ON "beta_test_runs"("synthetic", "valid", "started_at");

CREATE INDEX "beta_test_observations_kind_name_created_at_idx"
  ON "beta_test_observations"("kind", "name", "created_at");

CREATE INDEX "beta_test_observations_run_id_created_at_idx"
  ON "beta_test_observations"("run_id", "created_at");
