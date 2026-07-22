CREATE TYPE "UserFranchise" AS ENUM ('MACHETE', 'BALTIKA');

ALTER TABLE "User"
    ADD COLUMN "franchise" "UserFranchise";
