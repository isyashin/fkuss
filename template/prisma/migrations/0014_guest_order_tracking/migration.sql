-- Anonymous order ownership is additive. Existing orders and totals are untouched.
CREATE TABLE "GuestOrderSession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestOrderSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GuestCheckout" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "confirmationUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestCheckout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestCheckout_orderId_key" ON "GuestCheckout"("orderId");
CREATE UNIQUE INDEX "GuestCheckout_sessionId_requestKey_key" ON "GuestCheckout"("sessionId", "requestKey");
CREATE INDEX "GuestOrderSession_expiresAt_idx" ON "GuestOrderSession"("expiresAt");
ALTER TABLE "GuestCheckout" ADD CONSTRAINT "GuestCheckout_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuestOrderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestCheckout" ADD CONSTRAINT "GuestCheckout_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
