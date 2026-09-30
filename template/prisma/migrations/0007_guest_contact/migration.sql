BEGIN;

ALTER TABLE "Order" ADD COLUMN "preferredChannel" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_preferredChannel_check"
  CHECK ("preferredChannel" IS NULL OR "preferredChannel" IN ('phone', 'whatsapp', 'telegram'));

COMMIT;
