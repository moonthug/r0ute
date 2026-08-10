-- CreateTable
CREATE TABLE "AdvertLocation" (
    "publicKey" TEXT NOT NULL,
    "name" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "advertTimestamp" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvertLocation_pkey" PRIMARY KEY ("publicKey")
);

-- CreateIndex
CREATE INDEX "AdvertLocation_name_idx" ON "AdvertLocation"("name");
