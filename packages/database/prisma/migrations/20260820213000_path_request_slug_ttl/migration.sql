-- add short link slug; the volatile default backfills existing rows with a
-- random 6-char hex token, then new rows must supply their own
ALTER TABLE "PathRequest" ADD COLUMN "slug" TEXT NOT NULL DEFAULT substr(md5(random()::text), 1, 6);
ALTER TABLE "PathRequest" ALTER COLUMN "slug" DROP DEFAULT;

-- 28-day TTL; existing rows expire 28 days after they were received
ALTER TABLE "PathRequest" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "PathRequest" SET "expiresAt" = "receivedAt" + interval '28 days';
ALTER TABLE "PathRequest" ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PathRequest_slug_key" ON "PathRequest"("slug");

-- CreateIndex
CREATE INDEX "PathRequest_expiresAt_idx" ON "PathRequest"("expiresAt");
