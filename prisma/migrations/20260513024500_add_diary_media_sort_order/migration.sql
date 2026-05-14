ALTER TABLE "diary_media" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "diary_media_diary_id_sort_order_idx" ON "diary_media"("diary_id", "sort_order");
