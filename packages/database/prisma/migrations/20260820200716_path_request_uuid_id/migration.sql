-- DropForeignKey
ALTER TABLE "PathHop" DROP CONSTRAINT "PathHop_pathRequestId_fkey";

-- AlterTable
ALTER TABLE "PathHop" DROP CONSTRAINT "PathHop_pkey",
ALTER COLUMN "pathRequestId" SET DATA TYPE TEXT,
ADD CONSTRAINT "PathHop_pkey" PRIMARY KEY ("pathRequestId", "position");

-- AlterTable
ALTER TABLE "PathRequest" DROP CONSTRAINT "PathRequest_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "PathRequest_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "PathRequest_id_seq";

-- AddForeignKey
ALTER TABLE "PathHop" ADD CONSTRAINT "PathHop_pathRequestId_fkey" FOREIGN KEY ("pathRequestId") REFERENCES "PathRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
