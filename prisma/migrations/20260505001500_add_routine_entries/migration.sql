-- CreateEnum
CREATE TYPE "routine_meal_type" AS ENUM ('breastfeed', 'breastMilk', 'formula', 'solid');

-- CreateEnum
CREATE TYPE "routine_diaper_type" AS ENUM ('wet', 'dirty', 'both', 'dry');

-- CreateEnum
CREATE TYPE "routine_diaper_color" AS ENUM ('green', 'brown', 'yellow', 'black');

-- CreateEnum
CREATE TYPE "sleep_type" AS ENUM ('nap', 'nighttime');

-- CreateTable
CREATE TABLE "routine_meal_events" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL,
    "meal_type" "routine_meal_type" NOT NULL,
    "amount_ml" INTEGER,
    "duration_minutes" INTEGER,
    "amount_bowl" DECIMAL(4,2),
    "amount_grams" INTEGER,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "routine_meal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_diaper_events" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "logged_at" TIMESTAMPTZ(6) NOT NULL,
    "diaper_type" "routine_diaper_type" NOT NULL,
    "color" "routine_diaper_color",
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "routine_diaper_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sleep_sessions" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "sleep_type" "sleep_type" NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sleep_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_routine_summaries" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "summary_date" DATE NOT NULL,
    "meal_summary_json" JSONB NOT NULL,
    "diaper_summary_json" JSONB NOT NULL,
    "sleep_summary_json" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_routine_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routine_meal_events_baby_id_logged_at_idx" ON "routine_meal_events"("baby_id", "logged_at");

-- CreateIndex
CREATE INDEX "routine_meal_events_created_by_idx" ON "routine_meal_events"("created_by");

-- CreateIndex
CREATE INDEX "routine_diaper_events_baby_id_logged_at_idx" ON "routine_diaper_events"("baby_id", "logged_at");

-- CreateIndex
CREATE INDEX "routine_diaper_events_created_by_idx" ON "routine_diaper_events"("created_by");

-- CreateIndex
CREATE INDEX "sleep_sessions_baby_id_start_time_idx" ON "sleep_sessions"("baby_id", "start_time");

-- CreateIndex
CREATE INDEX "sleep_sessions_baby_id_end_time_idx" ON "sleep_sessions"("baby_id", "end_time");

-- CreateIndex
CREATE INDEX "sleep_sessions_created_by_idx" ON "sleep_sessions"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "daily_routine_summaries_baby_id_summary_date_key" ON "daily_routine_summaries"("baby_id", "summary_date");

-- CreateIndex
CREATE INDEX "daily_routine_summaries_baby_id_summary_date_idx" ON "daily_routine_summaries"("baby_id", "summary_date");

-- AddForeignKey
ALTER TABLE "routine_meal_events" ADD CONSTRAINT "routine_meal_events_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_meal_events" ADD CONSTRAINT "routine_meal_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_diaper_events" ADD CONSTRAINT "routine_diaper_events_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_diaper_events" ADD CONSTRAINT "routine_diaper_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sleep_sessions" ADD CONSTRAINT "sleep_sessions_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sleep_sessions" ADD CONSTRAINT "sleep_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_routine_summaries" ADD CONSTRAINT "daily_routine_summaries_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
