CREATE TABLE "user_external_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "profile_url" TEXT NOT NULL,
    "last_imported_at" TIMESTAMP(3),
    "last_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_external_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_external_profiles_user_id_provider_key"
    ON "user_external_profiles"("user_id", "provider");

CREATE INDEX "user_external_profiles_provider_provider_user_id_idx"
    ON "user_external_profiles"("provider", "provider_user_id");

ALTER TABLE "user_external_profiles"
    ADD CONSTRAINT "user_external_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
