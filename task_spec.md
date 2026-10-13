# Issue #73 (isyashin/fkuss#73): админ-UI для настроек предзаказа
## Контекст
PR #71 добавил settings.preOrder {enabled, slots[], daysAhead, minAheadMinutes} + чекаут. В админке UI нет — функция мертва без SQL. Схема: template/src/lib/content-schema.ts (preOrder), логика: src/lib/order/preorder.ts.
## Задача
Раздел «Предзаказ» в настройках (рядом с доставкой/заказами — по смыслу существующей структуры): чекбокс включения; редактор слотов HH:MM (список, добавить/удалить); daysAhead (0-14); minAheadMinutes. Паттерн: как остальные секции настроек (zod-схема уже есть — используй её), {ok,error} без throw на ожидаемых ошибках, revalidatePath. Сохранение не должно затирать другие ключи settings.
## Acceptance
- Владелец включает предзаказ и задаёт слоты в админке → чекаут показывает их (на витрине уже работает).
- Тесты зелёные + unit если выделяется логика. Минимум комментариев.
## Сдача
НЕ жди локальные e2e (нет PG). commit -A → пуш в hermes/issue-73-preorder-ui → gh pr create --title "feat(admin): настройки предзаказа в админке (fixes #73)" → gh pr checks --watch → при падении почини → при зелёном CI squash-merge и удали ветку. Ответь: URL PR, статус CI, смержено ли.
