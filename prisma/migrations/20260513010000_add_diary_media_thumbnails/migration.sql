ALTER TABLE "diary_media"
ADD COLUMN "thumbnail_object_key" TEXT,
ADD COLUMN "thumbnail_file_type" TEXT,
ADD COLUMN "thumbnail_size_bytes" INTEGER;

CREATE INDEX "diary_media_thumbnail_object_key_idx" ON "diary_media"("thumbnail_object_key");
