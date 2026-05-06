-- CreateTable
CREATE TABLE "baby_growth" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "height_mm" INTEGER,
    "weight_grams" INTEGER,
    "head_circumference_mm" INTEGER,
    "notes" TEXT,
    "measured_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "baby_growth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "baby_growth_baby_id_measured_at_idx" ON "baby_growth"("baby_id", "measured_at");

-- AddForeignKey
ALTER TABLE "baby_growth" ADD CONSTRAINT "baby_growth_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
