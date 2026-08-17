-- Rename table (preserves data)
ALTER TABLE "AdvertLocation" RENAME TO "Location";
ALTER TABLE "Location" RENAME CONSTRAINT "AdvertLocation_pkey" TO "Location_pkey";
ALTER INDEX "AdvertLocation_name_idx" RENAME TO "Location_name_idx";
