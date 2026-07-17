SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "beta_test_runs"
  ADD CONSTRAINT "beta_test_runs_real_valid_requires_submission_check"
  CHECK (
    "synthetic" IS TRUE
    OR "valid" IS DISTINCT FROM TRUE
    OR "submitted_at" IS NOT NULL
  ) NOT VALID;

RESET statement_timeout;
RESET lock_timeout;
