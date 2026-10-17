# Опросник: сбор манифеста site-input.json

Манифест — единый входной артефакт пайплайна (схема:
`template/scripts/schemas/site-input.ts`, пример: `scripts/site-input.example.json`).
Задай вопросы **батчами** (question-инструмент), заполни манифест, покажи
сводку на REVIEW. Правило прежнее: не выдумывай — если данных нет, поле
остаётся пустым и уходит в `decisions.gaps` (публикация с пробелами).

## Вопрос 0 — источник (контракт на весь прогон)

**«Меню брать из Яндекс.Еды (URL) или из папки/файлов?»**

- Выбранное — контракт: если Еда, данные добираются по лестнице устойчивости
  инжеста, к папке НЕ переключаемся без явной команды пользователя.
- Папку попросить структурой content/ (шесть JSON + images/); если её нет —
  скелет: `npx tsx template/scripts/new-content.ts <dir> --slug <slug> --name "<Название>"`.
- Мультименю (несколько заведений Еды на одном сайте) — вне assemble-content:
  инжест вручную с `--menu-id` по docs/CASE-MULTI-MENU.md, деплой — всё равно
  через provision-site.sh (гейт approvedBy действует и там).

## Батч A — обязательное (стоп до ответа)

1. Публичное название (`identity.name`) — как на сайте.
2. Slug и домен (`identity.slug`, `identity.domain`) — дефолт `<slug>.fkuss.ru`.
3. Адрес точки (`contacts.address`) — для папки обязателен; для Еды сверить с картой.
4. Телефон (`contacts.phone`) — **всегда обязателен**; источник: владелец или
   совпадение двух независимых (карта + сайт точки) → `phoneConfirmedBy`.
5. Кухня (`identity.cuisine`) — короткая строка («пицца, суши»).

## Батч B — решения владельца (подставить дефолты, показать)

6. Доставка: включена? зона (`business.deliveryZoneName`) и цена
   (`business.deliveryPrice`)? минимальный заказ (`business.minOrder`)?
   → при сомнениях дефолт + запись в `decisions.gaps` («уточнить условия»).
7. Самовывоз (`business.pickupEnabled`, дефолт вкл).
8. Бронь столов (`business.bookingEnabled`, дефолт вкл).
9. Оплата: пока только при получении (карты/наличные) — зафиксировать в текстах.
10. Лояльность: кэшбэк/списание (дефолт 5%/20%).

## Батч C — подтверждения и опциональное

11. Часы работы (`contacts.hours[]` + `source`: owner/eda/maps) — при
    расхождении источников: оба значения в `decisions.notes`, выбранное — в часы.
12. Email (`contacts.email`) — нет → служебный `<slug>@fkuss.ru`, канал выключен,
    запись в gaps.
13. Соцсети (`contacts.socials`) — только подтверждённые ссылки.
14. Тексты: авторские `content.about` / `content.deliveryText` или шаблоны.
15. Тема (`theme`) — дефолт warm; для пиццерий/гриля красный акцент хорошо читается.

## REVIEW → approvedBy

Покажи сводку: источник, статистика меню, контакты с confirmedBy, решения,
пробелы. После «да» запиши `"approvedBy": "<кто> <дата>"` в манифест —
без него `provision-site.sh` не стартует (гейт).

## Дальше по пайплайну

```bash
# BUILD + VALIDATE (локально, из template/)
npx tsx scripts/assemble-content.ts --input <manifest.json> --out ../sites/<slug>/content
# REVIEW сводки, затем:
tar -czf content.tar.gz -C ../sites/<slug> content
scp content.tar.gz <prod>:/tmp/
ssh <prod> "bash ~/resto/src/scripts/provision-site.sh <slug> /tmp/content.tar.gz"
```
