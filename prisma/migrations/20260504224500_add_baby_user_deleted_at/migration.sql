-- Add soft-delete support to baby access rows.
ALTER TABLE "baby_users" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
