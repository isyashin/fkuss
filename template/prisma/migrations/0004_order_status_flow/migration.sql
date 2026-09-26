-- Атомарная миграция старых статусов заказов без пересоздания БД или seed.
-- Неизвестные типы/статусы приводят к ошибке и откату всей миграции.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Order" WHERE "type" NOT IN ('delivery', 'pickup')) THEN
    RAISE EXCEPTION 'Order status migration: unknown order type';
  END IF;
  IF EXISTS (SELECT 1 FROM "Order" WHERE "status" NOT IN (
    'new', 'accepted', 'cooking', 'delivering', 'done', 'cancelled',
    'ready', 'handed_to_courier', 'delivered', 'issued'
  )) THEN
    RAISE EXCEPTION 'Order status migration: unknown order status';
  END IF;
END $$;

UPDATE "Order"
SET "status" = CASE
  WHEN "status" = 'delivering' AND "type" = 'delivery' THEN 'handed_to_courier'
  WHEN "status" = 'delivering' AND "type" = 'pickup' THEN 'ready'
  WHEN "status" = 'done' AND "type" = 'delivery' THEN 'delivered'
  WHEN "status" = 'done' AND "type" = 'pickup' THEN 'issued'
  ELSE "status"
END
WHERE "status" IN ('delivering', 'done');

ALTER TABLE "Order" ADD CONSTRAINT "Order_type_status_check" CHECK (
  ("type" = 'delivery' AND "status" IN (
    'new', 'accepted', 'cooking', 'ready', 'handed_to_courier', 'delivered', 'cancelled'
  )) OR
  ("type" = 'pickup' AND "status" IN (
    'new', 'accepted', 'cooking', 'ready', 'issued', 'cancelled'
  ))
);

COMMIT;
