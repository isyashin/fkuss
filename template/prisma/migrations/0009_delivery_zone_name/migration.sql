-- Зоны доставки на карте: снимок имени зоны в заказе (геоданные API не храним)
ALTER TABLE "Order" ADD COLUMN "deliveryZoneName" TEXT;
