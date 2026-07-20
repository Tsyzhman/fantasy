ALTER TABLE "FantasyModel"
ADD COLUMN "projectionFormulaConfig" JSONB;

ALTER TABLE "UserScoringPreference"
ADD COLUMN "alternativeProjectionFormulaConfig" JSONB;
