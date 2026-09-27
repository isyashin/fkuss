-- Канал уведомлений владельца сайта о балансе (email | telegram)
ALTER TABLE "OwnerAccount" ADD COLUMN "notifyChannel" TEXT NOT NULL DEFAULT 'email';
-- Chat id в Telegram (нужен, только если канал telegram)
ALTER TABLE "OwnerAccount" ADD COLUMN "notifyTelegramChatId" TEXT NOT NULL DEFAULT '';
