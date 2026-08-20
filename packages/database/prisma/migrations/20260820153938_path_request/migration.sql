-- CreateTable
CREATE TABLE "PathRequest" (
    "id" SERIAL NOT NULL,
    "channelId" INTEGER NOT NULL,
    "userName" TEXT NOT NULL,
    "requestTimestamp" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PathRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathHop" (
    "pathRequestId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "locationPublicKey" TEXT,

    CONSTRAINT "PathHop_pkey" PRIMARY KEY ("pathRequestId","position")
);

-- CreateIndex
CREATE INDEX "PathRequest_receivedAt_idx" ON "PathRequest"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PathRequest_channelId_userName_requestTimestamp_key" ON "PathRequest"("channelId", "userName", "requestTimestamp");

-- CreateIndex
CREATE INDEX "PathHop_locationPublicKey_idx" ON "PathHop"("locationPublicKey");

-- AddForeignKey
ALTER TABLE "PathHop" ADD CONSTRAINT "PathHop_pathRequestId_fkey" FOREIGN KEY ("pathRequestId") REFERENCES "PathRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathHop" ADD CONSTRAINT "PathHop_locationPublicKey_fkey" FOREIGN KEY ("locationPublicKey") REFERENCES "Location"("publicKey") ON DELETE SET NULL ON UPDATE CASCADE;
