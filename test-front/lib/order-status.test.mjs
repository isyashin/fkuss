import assert from "node:assert/strict";
import test from "node:test";
import { changeOrderStatus, orderStatusesFor } from "./order-status.mjs";

test("an order status can move backward and forward without changing other orders", () => {
  const orders = [{ id: 1, type: "Доставка", status: "Готов" }, { id: 2, type: "Самовывоз", status: "Новый" }];
  const reverted = changeOrderStatus(orders, 1, "Готовится");
  assert.deepEqual(reverted, [{ id: 1, type: "Доставка", status: "Готовится" }, { id: 2, type: "Самовывоз", status: "Новый" }]);
  assert.deepEqual(changeOrderStatus(reverted, 1, "Доставлен"), [{ id: 1, type: "Доставка", status: "Доставлен" }, { id: 2, type: "Самовывоз", status: "Новый" }]);
  assert.equal(orders[0].status, "Готов");
});

test("delivery and pickup offer different final stages", () => {
  assert.deepEqual(orderStatusesFor("Доставка"), ["Новый", "Принят", "Готовится", "Готов", "Передан курьеру", "Доставлен", "Отменён"]);
  assert.deepEqual(orderStatusesFor("Самовывоз"), ["Новый", "Принят", "Готовится", "Готов", "Выдан", "Отменён"]);
});

test("pickup cannot be assigned a courier or delivery status", () => {
  const orders = [{ id: 1, type: "Самовывоз", status: "Готов" }];
  assert.throws(() => changeOrderStatus(orders, 1, "Передан курьеру"));
  assert.throws(() => changeOrderStatus(orders, 1, "Доставлен"));
  assert.equal(changeOrderStatus(orders, 1, "Выдан")[0].status, "Выдан");
  assert.equal(changeOrderStatus(orders, 1, "Новый")[0].status, "Новый");
});
