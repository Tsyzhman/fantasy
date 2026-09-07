-- AlterTable
ALTER TABLE "khl_contests" ADD COLUMN     "calendarFrom" TIMESTAMP(3),
ADD COLUMN     "calendarTo" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "khl_forecast_revisions" ADD COLUMN     "dataRevision" INTEGER;
