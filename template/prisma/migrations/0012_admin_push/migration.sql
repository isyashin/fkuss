-- Web push для админки: подписки устройств и outbox доставок.
CREATE TABLE "AdminPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminPushDelivery" (
    "eventId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPushDelivery_pkey" PRIMARY KEY ("eventId", "subscriptionId")
);

CREATE UNIQUE INDEX "AdminPushSubscription_endpoint_key" ON "AdminPushSubscription"("endpoint");
CREATE INDEX "AdminPushSubscription_userId_idx" ON "AdminPushSubscription"("userId");
CREATE INDEX "AdminPushSubscription_installId_idx" ON "AdminPushSubscription"("installId");
CREATE INDEX "AdminPushDelivery_status_nextAttemptAt_idx" ON "AdminPushDelivery"("status", "nextAttemptAt");

ALTER TABLE "AdminPushSubscription" ADD CONSTRAINT "AdminPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminPushDelivery" ADD CONSTRAINT "AdminPushDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AdminEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminPushDelivery" ADD CONSTRAINT "AdminPushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AdminPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
