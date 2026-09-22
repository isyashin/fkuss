-- backfill-yandex-ids.sql — обратная заливка externalId/site для сайтов,
-- наполненных инжестом до этапа ТЗ-1 (ids вида dish-<edaId>/cat-<edaId>,
-- externalId=NULL, source='manual').
--
-- Применение (на хосте, контейнер template-db-1):
--   docker exec -i template-db-1 psql -U resto -d <site_db> -f - < backfill-yandex-ids.sql
--
-- Идемпотентно: трогает только строки с незаполненным externalId.
-- После заливки sync (POST /api/jobs/sync-menu) сопоставляет блюда по externalId
-- вместо CREATE с конфликтом Dish_pkey.

BEGIN;

-- Предпросмотр (должны совпасть с ожиданиями по числу блюд/категорий):
-- SELECT count(*) FROM "Dish"  WHERE id LIKE 'dish-%' AND "externalId" IS NULL;
-- SELECT count(*) FROM "Category" WHERE id LIKE 'cat-%'  AND "externalId" IS NULL;

UPDATE "Dish"
SET "externalId" = substring(id from 6),  -- 'dish-<edaId>' -> '<edaId>'
    source       = 'yandex',
    "yandexAvailable" = true
WHERE id LIKE 'dish-%'
  AND "externalId" IS NULL;

UPDATE "Category"
SET "externalId" = substring(id from 5)   -- 'cat-<edaId>' -> '<edaId>'
WHERE id LIKE 'cat-%'
  AND "externalId" IS NULL;

COMMIT;

-- Проверка: незаполненных не осталось
-- SELECT count(*) FROM "Dish"  WHERE "externalId" IS NULL;
-- SELECT count(*) FROM "Category" WHERE "externalId" IS NULL;
