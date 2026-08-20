-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('CHAT', 'REPEATER', 'ROOM', 'SENSOR');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN "nodeType" "NodeType";
