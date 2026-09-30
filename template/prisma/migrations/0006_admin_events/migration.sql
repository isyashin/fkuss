BEGIN;

CREATE TABLE "AdminEvent" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminEvent_kind_check" CHECK ("kind" IN ('order', 'booking'))
);

CREATE UNIQUE INDEX "AdminEvent_kind_reference_key" ON "AdminEvent"("kind", "reference");
CREATE INDEX "AdminEvent_createdAt_idx" ON "AdminEvent"("createdAt");

CREATE TABLE "AdminEventReceipt" (
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminEventReceipt_pkey" PRIMARY KEY ("eventId", "userId"),
  CONSTRAINT "AdminEventReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AdminEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdminEventReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AdminEventReceipt_userId_idx" ON "AdminEventReceipt"("userId");

COMMIT;
