-- События выдаются каждой вкладке отдельно: добавляем tabId к receipt.
ALTER TABLE "AdminEventReceipt" ADD COLUMN "tabId" TEXT NOT NULL DEFAULT '';

-- Старая PK (eventId, userId) заменяется на (eventId, userId, tabId)
ALTER TABLE "AdminEventReceipt" DROP CONSTRAINT "AdminEventReceipt_pkey";
ALTER TABLE "AdminEventReceipt" ADD CONSTRAINT "AdminEventReceipt_pkey" PRIMARY KEY ("eventId", "userId", "tabId");
