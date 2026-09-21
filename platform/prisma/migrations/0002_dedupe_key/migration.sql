-- Добавление dedupeKey с уникальным индексом (идемпотентность списаний/пополнений)
ALTER TABLE "BalanceTransaction" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "BalanceTransaction_dedupeKey_key" ON "BalanceTransaction"("dedupeKey");