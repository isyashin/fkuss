ALTER TABLE "Site" ADD COLUMN "manualSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "exportReadyAt" TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN "exportExpiresAt" TIMESTAMP(3);

-- Сохраняем подтверждённые ручные паузы прежней версии по журналу действий.
UPDATE "Site" s SET "manualSuspended" = true
WHERE s.state = 'suspended' AND (
  SELECT b.comment FROM "BalanceTransaction" b
  WHERE b."siteId" = s.slug AND b.amount = 0 AND b.comment LIKE 'Состояние → %'
  ORDER BY b."createdAt" DESC, b.id DESC LIMIT 1
) LIKE 'Состояние → suspended:%';

-- Старым архивам не продлеваем срок при обновлении.
UPDATE "Site"
SET "exportReadyAt" = "exportRequestedAt",
    "exportExpiresAt" = "exportRequestedAt" + INTERVAL '24 hours'
WHERE "exportReadyPath" IS NOT NULL AND "exportRequestedAt" IS NOT NULL;
