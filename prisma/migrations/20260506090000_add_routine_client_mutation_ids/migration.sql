ALTER TABLE "routine_meal_events"
ADD COLUMN "client_mutation_id" TEXT;

ALTER TABLE "routine_diaper_events"
ADD COLUMN "client_mutation_id" TEXT;

ALTER TABLE "sleep_sessions"
ADD COLUMN "client_mutation_id" TEXT;

CREATE UNIQUE INDEX "routine_meal_events_client_mutation_id_key"
ON "routine_meal_events"("client_mutation_id");

CREATE UNIQUE INDEX "routine_diaper_events_client_mutation_id_key"
ON "routine_diaper_events"("client_mutation_id");

CREATE UNIQUE INDEX "sleep_sessions_client_mutation_id_key"
ON "sleep_sessions"("client_mutation_id");
