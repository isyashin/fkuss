-- Состав блюда: отдельное поле («Ингредиенты» из Яндекс.Еды / ручной ввод админки)
ALTER TABLE "Dish" ADD COLUMN "composition" TEXT NOT NULL DEFAULT '';
