-- @spec spec://modules/machete/FEAT-006-sports-popularity#data
-- @spec spec://modules/telegram/FEAT-007-deadline-assistant#data
-- @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
-- CreateTable
CREATE TABLE "sports_trend_sources" (
    "id" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL DEFAULT 'ARTICLE',
    "title" TEXT,
    "source_published_at" TIMESTAMP(3),
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL,
    "parse_status" TEXT NOT NULL DEFAULT 'PENDING',
    "parse_error" TEXT,
    "source_round_label" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_trend_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_trend_snapshots" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
    "season" TEXT NOT NULL,
    "provider_round_id" TEXT,
    "round_ordinal" INTEGER,
    "category" TEXT NOT NULL,
    "metric_kind" TEXT NOT NULL DEFAULT 'reported_count',
    "unit" TEXT NOT NULL DEFAULT 'players',
    "population_scope" TEXT NOT NULL DEFAULT 'ALL_MANAGERS',
    "section_key" TEXT NOT NULL DEFAULT '',
    "source_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "status_reason" TEXT,
    "source_entry_count" INTEGER,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "source_published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_trend_entries" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "source_rank" INTEGER NOT NULL,
    "provider_player_id" TEXT,
    "player_id" BIGINT,
    "source_name" TEXT NOT NULL,
    "source_team" TEXT,
    "source_position" TEXT,
    "value" DOUBLE PRECISION,
    "value_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_trend_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "consent_at" TIMESTAMP(3),
    "link_version" INTEGER NOT NULL DEFAULT 1,
    "link_session_id" TEXT,
    "pending_expires_at" TIMESTAMP(3),
    "last_inbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_link_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_challenges" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "code_digest" TEXT,
    "secret_digest" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_subscriptions" (
    "id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "league_id" BIGINT NOT NULL,
    "season" TEXT NOT NULL,
    "squad_id" TEXT,
    "provider_squad_id" TEXT,
    "source_preference" TEXT NOT NULL DEFAULT 'SPORTS_PUBLISHED',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_inbox" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "update_id" BIGINT NOT NULL,
    "update_type" TEXT,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "telegram_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_rate_limits" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject_hash" TEXT NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadline_campaigns" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SPORTS_RU',
    "contest_id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "provider_round_id" TEXT NOT NULL,
    "round_key" TEXT,
    "round_label" TEXT,
    "deadline_at" TIMESTAMP(3),
    "deadline_source" TEXT,
    "verified_at" TIMESTAMP(3),
    "schedule_version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "input_version" INTEGER NOT NULL DEFAULT 1,
    "report_date" TEXT,
    "is_early_deadline" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadline_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadline_stage_jobs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "input_version" INTEGER NOT NULL,
    "shard_key" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "fence" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "result" JSONB,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadline_stage_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadline_data_snapshots" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "input_version" INTEGER NOT NULL,
    "dataset" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "revision" TEXT,
    "coverage" JSONB,
    "freshness" JSONB,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadline_data_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadline_user_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "report_version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "render_hash" TEXT NOT NULL,
    "parts_count" INTEGER NOT NULL DEFAULT 1,
    "findings" JSONB,
    "inputRefs" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadline_user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_outbox" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "report_kind" TEXT NOT NULL DEFAULT 'DEADLINE_REPORT',
    "part_number" INTEGER NOT NULL DEFAULT 1,
    "parts_count" INTEGER NOT NULL DEFAULT 1,
    "report_version" INTEGER NOT NULL DEFAULT 1,
    "link_version" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "telegram_message_id" TEXT,
    "text" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sports_trend_sources_canonical_url_key" ON "sports_trend_sources"("canonical_url");

-- CreateIndex
CREATE INDEX "sports_trend_sources_status_updated_idx" ON "sports_trend_sources"("parse_status", "updated_at");

-- CreateIndex
CREATE INDEX "sports_trend_snapshots_lookup_idx" ON "sports_trend_snapshots"("contest_id", "season", "provider_round_id", "category", "observed_at");

-- CreateIndex
CREATE INDEX "sports_trend_snapshots_contest_category_idx" ON "sports_trend_snapshots"("contest_id", "category", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "sports_trend_snapshot_source_revision_section_key" ON "sports_trend_snapshots"("source_id", "revision", "category", "population_scope", "section_key");

-- CreateIndex
CREATE UNIQUE INDEX "sports_trend_snapshot_contest_section_observed_key" ON "sports_trend_snapshots"("contest_id", "category", "population_scope", "section_key", "observed_at");

-- CreateIndex
CREATE INDEX "sports_trend_entries_player_idx" ON "sports_trend_entries"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "sports_trend_entries_snapshot_rank_key" ON "sports_trend_entries"("snapshot_id", "source_rank");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_user_id_key" ON "telegram_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_telegram_user_id_key" ON "telegram_links"("telegram_user_id");

-- CreateIndex
CREATE INDEX "telegram_links_state_pending_idx" ON "telegram_links"("state", "pending_expires_at");

-- CreateIndex
CREATE INDEX "telegram_link_sessions_user_state_idx" ON "telegram_link_sessions"("user_id", "state");

-- CreateIndex
CREATE INDEX "telegram_link_sessions_expires_idx" ON "telegram_link_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_challenges_code_digest_key" ON "telegram_link_challenges"("code_digest");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_challenges_secret_digest_key" ON "telegram_link_challenges"("secret_digest");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_challenges_session_slot_key" ON "telegram_link_challenges"("session_id", "slot");

-- CreateIndex
CREATE INDEX "telegram_subscriptions_contest_enabled_idx" ON "telegram_subscriptions"("contest_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_subscriptions_user_contest_key" ON "telegram_subscriptions"("user_id", "contest_id");

-- CreateIndex
CREATE INDEX "telegram_inbox_state_received_idx" ON "telegram_inbox"("state", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_inbox_bot_update_key" ON "telegram_inbox"("bot_id", "update_id");

-- CreateIndex
CREATE INDEX "telegram_rate_limits_locked_idx" ON "telegram_rate_limits"("locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_rate_limits_action_subject_key" ON "telegram_rate_limits"("action", "subject_hash");

-- CreateIndex
CREATE INDEX "deadline_campaigns_status_deadline_idx" ON "deadline_campaigns"("status", "deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "deadline_campaigns_contest_season_round_key" ON "deadline_campaigns"("contest_id", "season", "provider_round_id");

-- CreateIndex
CREATE INDEX "deadline_stage_jobs_status_next_idx" ON "deadline_stage_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "deadline_stage_jobs_campaign_stage_version_shard_key" ON "deadline_stage_jobs"("campaign_id", "stage", "input_version", "shard_key");

-- CreateIndex
CREATE UNIQUE INDEX "deadline_data_snapshots_campaign_version_dataset_key" ON "deadline_data_snapshots"("campaign_id", "input_version", "dataset");

-- CreateIndex
CREATE INDEX "deadline_user_reports_campaign_status_idx" ON "deadline_user_reports"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deadline_user_reports_user_campaign_version_key" ON "deadline_user_reports"("user_id", "campaign_id", "report_version");

-- CreateIndex
CREATE INDEX "telegram_outbox_state_next_idx" ON "telegram_outbox"("state", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_outbox_user_campaign_kind_part_key" ON "telegram_outbox"("user_id", "campaign_id", "report_kind", "part_number");

-- AddForeignKey
ALTER TABLE "sports_trend_snapshots" ADD CONSTRAINT "sports_trend_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sports_trend_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports_trend_entries" ADD CONSTRAINT "sports_trend_entries_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "sports_trend_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link_challenges" ADD CONSTRAINT "telegram_link_challenges_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "telegram_link_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_subscriptions" ADD CONSTRAINT "telegram_subscriptions_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "telegram_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_subscriptions" ADD CONSTRAINT "telegram_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_stage_jobs" ADD CONSTRAINT "deadline_stage_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "deadline_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_data_snapshots" ADD CONSTRAINT "deadline_data_snapshots_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "deadline_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_user_reports" ADD CONSTRAINT "deadline_user_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_user_reports" ADD CONSTRAINT "deadline_user_reports_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "deadline_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_outbox" ADD CONSTRAINT "telegram_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_outbox" ADD CONSTRAINT "telegram_outbox_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "deadline_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
