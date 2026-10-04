-- Мультименю: группы меню («Хинкальная», «Пироги и пицца») и пометка
-- группы в позициях заказа. Аддитивно: сайты без групп не меняются.

CREATE TABLE "MenuGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Category" ADD COLUMN "menuId" TEXT;

ALTER TABLE "OrderItem" ADD COLUMN "menuName" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Category" ADD CONSTRAINT "Category_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "MenuGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Category_menuId_idx" ON "Category"("menuId");
