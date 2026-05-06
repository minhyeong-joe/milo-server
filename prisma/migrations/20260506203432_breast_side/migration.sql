-- CreateEnum
CREATE TYPE "breast_side" AS ENUM ('left', 'right');

-- AlterTable
ALTER TABLE "routine_meal_events" ADD COLUMN     "breast_side" "breast_side";
