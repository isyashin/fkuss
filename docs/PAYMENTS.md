# PAYMENTS.md — оплата

## Абстракция

```
src/lib/payments/
├── types.ts      # PaymentProvider: createPayment / handleWebhook / getStatus
├── yookassa.ts   # ЮKassa (первая реализация)
└── mock.ts       # для тестов
```

Провайдер выбирается в настройках ресторана (`settings.json` →
`payment.provider`), ключи — в `secrets/sites/<slug>.env`
(в настройках хранятся только имена переменных).

## Правила

1. Сумма платежа ВСЕГДА пересчитывается на сервере по БД.
   Клиент присылает только состав (id блюд, количество, модификаторы).
2. Вебхук: проверка подлинности по документации провайдера
   (подпись/allowlist IP), идемпотентность обработки.
3. Статусы заказа и платежа разделены: заказ может быть «принят»
   до оплаты (при получении) или после webhook.
4. «Оплата при получении» — всегда доступный fallback.
5. Вся логика денег — TDD (см. AGENTS.md): создание платежа, webhook,
   возврат/отмена, взаимодействие с бонусами.

## ЮKassa (этап 5)

- Регистрация магазина: shopId + секретный ключ.
- Создание платежа: POST https://api.yookassa.ru/v3/payments
  (сумма, confirmation: redirect, idempotence key = orderId).
- Webhook на `/api/payments/webhook/yookassa`: payment.succeeded /
  payment.canceled. Проверка по allowlist IP ЮKassa.
- Тестирование: sandbox-режим ЮKassa.
- Способы: банковские карты, СБП, SberPay (включаются в личном кабинете
  ЮKassa магазина).

## Добавление нового провайдера

Реализовать интерфейс `PaymentProvider`, добавить значение в enum
провайдеров настроек, написать тесты по аналогии с mock/yookassa.
