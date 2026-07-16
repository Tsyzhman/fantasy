ALTER TABLE "matches"
  ADD COLUMN "raw_received_at" TIMESTAMP(3),
  ADD COLUMN "normalized_at" TIMESTAMP(3);

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_promotion_timestamps_pair_check"
  CHECK (
    ("raw_received_at" IS NULL AND "normalized_at" IS NULL)
    OR (
      "raw_received_at" IS NOT NULL
      AND "normalized_at" IS NOT NULL
      AND "normalized_at" >= "raw_received_at"
    )
  );
