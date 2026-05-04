-- CreateEnum
CREATE TYPE "baby_sex" AS ENUM ('GIRL', 'BOY');

-- CreateEnum
CREATE TYPE "baby_user_role" AS ENUM ('FATHER', 'MOTHER', 'CAREGIVER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "auth_provider" TEXT NOT NULL,
    "auth_provider_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "babies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "birthdate" DATE NOT NULL,
    "sex" "baby_sex" NOT NULL DEFAULT 'BOY',
    "timezone" TEXT NOT NULL,
    "avatar_object_key" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "babies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baby_users" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "baby_user_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "baby_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_auth_provider_user_id_key" ON "users"("auth_provider", "auth_provider_user_id");

-- CreateIndex
CREATE INDEX "babies_created_by_idx" ON "babies"("created_by");

-- CreateIndex
CREATE INDEX "baby_users_user_id_idx" ON "baby_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "baby_users_baby_id_user_id_key" ON "baby_users"("baby_id", "user_id");

-- AddForeignKey
ALTER TABLE "babies" ADD CONSTRAINT "babies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baby_users" ADD CONSTRAINT "baby_users_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baby_users" ADD CONSTRAINT "baby_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
