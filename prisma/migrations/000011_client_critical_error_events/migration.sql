CREATE TABLE "client_critical_error_events" (
  "id" BIGSERIAL NOT NULL,
  "kind" TEXT NOT NULL,
  "route_group" TEXT NOT NULL,
  "occurred_minute" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "client_critical_error_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_critical_error_events_kind_check" CHECK ("kind" IN ('WINDOW_ERROR', 'UNHANDLED_REJECTION', 'REACT_ERROR_BOUNDARY')),
  CONSTRAINT "client_critical_error_events_route_group_check" CHECK ("route_group" IN ('root', 'login', 'setup', 'machete', 'admin', 'beta-test', 'other')),
  CONSTRAINT "client_critical_error_events_count_check" CHECK ("count" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "client_critical_error_events_kind_route_group_occurred_minute_key"
  ON "client_critical_error_events"("kind", "route_group", "occurred_minute");

CREATE INDEX "client_critical_error_events_occurred_minute_idx"
  ON "client_critical_error_events"("occurred_minute");
