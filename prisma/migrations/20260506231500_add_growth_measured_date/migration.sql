ALTER TABLE "baby_growth" ADD COLUMN "measured_date" DATE;

UPDATE "baby_growth"
SET "measured_date" = ("measured_at" AT TIME ZONE 'UTC')::date
WHERE "measured_date" IS NULL;

ALTER TABLE "baby_growth" ALTER COLUMN "measured_date" SET NOT NULL;

CREATE UNIQUE INDEX "baby_growth_baby_id_measured_date_key" ON "baby_growth"("baby_id", "measured_date");
