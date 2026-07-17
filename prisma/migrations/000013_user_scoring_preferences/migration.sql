CREATE TABLE "UserScoringPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelSource" TEXT NOT NULL,
    "scoringFormulaGk" TEXT,
    "scoringFormulaDef" TEXT,
    "scoringFormulaMid" TEXT,
    "scoringFormulaFwd" TEXT,
    "scoringFormulaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "alternativeFormulaGk" TEXT,
    "alternativeFormulaDef" TEXT,
    "alternativeFormulaMid" TEXT,
    "alternativeFormulaFwd" TEXT,
    "alternativeFormulaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserScoringPreference_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserScoringPreference_modelSource_check" CHECK ("modelSource" IN ('WYSCOUT', 'MACHETE'))
);

CREATE UNIQUE INDEX "UserScoringPreference_userId_modelSource_key"
    ON "UserScoringPreference"("userId", "modelSource");

CREATE INDEX "UserScoringPreference_modelSource_updatedAt_idx"
    ON "UserScoringPreference"("modelSource", "updatedAt");

ALTER TABLE "UserScoringPreference"
    ADD CONSTRAINT "UserScoringPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
