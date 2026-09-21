ALTER TABLE "BanquetHall" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "BanquetHall" SET "images" = ARRAY["image"] WHERE "image" <> '';