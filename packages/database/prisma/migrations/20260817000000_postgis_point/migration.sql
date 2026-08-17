-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Replace lat/lon with a single geography point (lon, lat order per PostGIS)
ALTER TABLE "Location" ADD COLUMN "point" geography(Point, 4326);
UPDATE "Location" SET "point" = ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography;
ALTER TABLE "Location" ALTER COLUMN "point" SET NOT NULL;
ALTER TABLE "Location" DROP COLUMN "lat", DROP COLUMN "lon";

-- Spatial index
CREATE INDEX "Location_point_idx" ON "Location" USING GIST ("point");
