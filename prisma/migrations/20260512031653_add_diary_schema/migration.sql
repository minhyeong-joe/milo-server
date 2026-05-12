-- CreateTable
CREATE TABLE "diary_entries" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "diary_date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "diary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_media" (
    "id" UUID NOT NULL,
    "diary_id" UUID NOT NULL,
    "file_type" TEXT NOT NULL,
    "description" TEXT,
    "object_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,

    CONSTRAINT "diary_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_tags" (
    "id" UUID NOT NULL,
    "diary_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "diary_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diary_entries_baby_id_diary_date_created_at_idx" ON "diary_entries"("baby_id", "diary_date", "created_at");

-- CreateIndex
CREATE INDEX "diary_entries_created_by_idx" ON "diary_entries"("created_by");

-- CreateIndex
CREATE INDEX "diary_entries_updated_by_idx" ON "diary_entries"("updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "diary_media_object_key_key" ON "diary_media"("object_key");

-- CreateIndex
CREATE INDEX "diary_media_diary_id_idx" ON "diary_media"("diary_id");

-- CreateIndex
CREATE INDEX "tags_baby_id_idx" ON "tags"("baby_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_baby_id_type_name_key" ON "tags"("baby_id", "type", "name");

-- CreateIndex
CREATE INDEX "diary_tags_tag_id_idx" ON "diary_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "diary_tags_diary_id_tag_id_key" ON "diary_tags"("diary_id", "tag_id");

-- AddForeignKey
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_media" ADD CONSTRAINT "diary_media_diary_id_fkey" FOREIGN KEY ("diary_id") REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_tags" ADD CONSTRAINT "diary_tags_diary_id_fkey" FOREIGN KEY ("diary_id") REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_tags" ADD CONSTRAINT "diary_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
