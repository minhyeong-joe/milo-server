DROP INDEX IF EXISTS "baby_growth_baby_id_measured_at_idx";

ALTER TABLE "baby_growth" DROP COLUMN "measured_at";
