-- lat/lon become the writable columns; "point" is regenerated from them by postgres
ALTER TABLE "Location" ADD COLUMN "lat" DOUBLE PRECISION, ADD COLUMN "lon" DOUBLE PRECISION;
UPDATE "Location" SET "lat" = ST_Y("point"::geometry), "lon" = ST_X("point"::geometry);
ALTER TABLE "Location" ALTER COLUMN "lat" SET NOT NULL, ALTER COLUMN "lon" SET NOT NULL;

DROP INDEX "Location_point_idx";
ALTER TABLE "Location" DROP COLUMN "point";
ALTER TABLE "Location" ADD COLUMN "point" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography) STORED NOT NULL;
CREATE INDEX "Location_point_idx" ON "Location" USING GIST ("point");
