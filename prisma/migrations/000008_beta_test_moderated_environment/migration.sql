ALTER TABLE "beta_test_runs"
  ADD COLUMN "moderated_environment" TEXT;

ALTER TABLE "beta_test_runs"
  ADD CONSTRAINT "beta_test_runs_moderated_environment_check"
  CHECK (
    "moderated_environment" IS NULL
    OR "moderated_environment" IN (
      'DESKTOP_BROWSER',
      'IOS_SAFARI_PHYSICAL',
      'ANDROID_CHROME_PHYSICAL',
      'OTHER_MOBILE'
    )
  );
