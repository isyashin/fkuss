import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { editOrderItems } from "@/lib/admin-order-edit";
import { applyAdminOrderStatus } from "@/lib/order-status-service";

// Только одноразовая БД. Тест создаёт и удаляет собственные данные.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const prefix = `edit-${crypto.randomUUID()}`;
const settings = JSON.parse(readFileSync(resolve(process.cwd(), "content/settings.json"), "utf8"));
settings.delivery.minOrder = 300;
settings.delivery.zones = [{ name: "Тестовая зона", price: 150, freeFrom: 1000 }];
settings.loyalty = { cashbackPercent: 5, maxSpendPercent: 20 };

beforeAll(async () => {
  await prisma.settings.create({ data: { key: "settings", value: settings } });
  await prisma.category.create({ data: { id: `${prefix}-category`, name: "Тест" } });
  await prisma.dish.createMany({ data: [
    { id: `${prefix}-a`, categoryId: `${prefix}-category`, name: "Первое", price: 400 },
    { id: `${prefix}-b`, categoryId: `${prefix}-category`, name: "Второе", price: 250 },
    { id: `${prefix}-off`, categoryId: `${prefix}-category`, name: "Нет в наличии", price: 100, available: false },
  ] });
  await prisma.deliveryOption.create({ data: {
    id: `${prefix}-option`, name: "Курьер", mode: "asap", days: [0, 1, 2, 3, 4, 5, 6],
    price: 180, freeFrom: 1000, exceptions: [],
  } });
});

afterAll(async () => {
  await prisma.bonusTransaction.deleteMany({ where: { customer: { email: { startsWith: prefix } } } });
  const orders = await prisma.order.findMany({ where: { customer: { email: { startsWith: prefix } } }, select: { id: true } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orders.map((order) => order.id) } } });
  await prisma.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
  await prisma.customer.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.deliveryOption.delete({ where: { id: `${prefix}-option` } });
  await prisma.dish.deleteMany({ where: { categoryId: `${prefix}-category` } });
  await prisma.category.delete({ where: { id: `${prefix}-category` } });
  await prisma.settings.delete({ where: { key: "settings" } });
  await prisma.$disconnect();
});

async function makeOrder(options: {
  type?: "pickup" | "delivery"; bonusSpent?: number; paymentMethod?: "cash" | "online";
  paymentStatus?: string; status?: string; deliveryOptionName?: string;
} = {}) {
  const customer = await prisma.customer.create({ data: { email: `${prefix}-${crypto.randomUUID()}@example.com` } });
  const order = await prisma.order.create({ data: {
    customerId: customer.id, customerName: "Тест", customerPhone: "+70000000000",
    type: options.type ?? "pickup", status: options.status ?? "new", paymentMethod: options.paymentMethod ?? "cash",
    paymentStatus: options.paymentStatus ?? "none", itemsTotal: 800,
    deliveryPrice: options.type === "delivery" ? 150 : 0,
    bonusSpent: options.bonusSpent ?? 0, bonusAccrued: 40,
    total: 800 + (options.type === "delivery" ? 150 : 0) - (options.bonusSpent ?? 0),
    deliveryOptionName: options.deliveryOptionName ?? null,
    items: { create: [
      { dishId: `${prefix}-a`, name: "Первое", price: 400, quantity: 1, total: 400 },
      { dishId: `${prefix}-a`, name: "Первое", price: 400, quantity: 1, total: 400 },
    ] },
  }, include: { items: true } });
  if (options.bonusSpent) {
    await prisma.bonusTransaction.create({ data: { customerId: customer.id, type: "accrual", amount: 200 } });
    await prisma.bonusTransaction.create({ data: { customerId: customer.id, orderId: order.id, type: "spend", amount: -options.bonusSpent } });
  }
  return order;
}

describe("admin order composition edit on PostgreSQL", () => {
  it("changes quantity, removes a line, adds an available dish and saves server prices", async () => {
    const order = await makeOrder();
    const result = await editOrderItems(prisma, {
      orderId: order.id, expectedUpdatedAt: order.updatedAt.toISOString(),
      lines: [
        { kind: "existing", itemId: order.items[0].id, quantity: 2 },
        { kind: "new", dishId: `${prefix}-b`, modifierIds: [], quantity: 1 },
      ], deliveryChoice: null,
    });
    expect(result).toMatchObject({ itemsTotal: 1050, deliveryPrice: 0, bonusSpent: 0, total: 1050, bonusAccrued: 52 });
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(saved.items.map((item) => [item.dishId, item.quantity, item.total]).sort()).toEqual([
      [`${prefix}-a`, 2, 800], [`${prefix}-b`, 1, 250],
    ].sort());
    expect(await prisma.bonusTransaction.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("recalculates zone delivery, caps bonuses, records a refund and cancels without double refund", async () => {
    const order = await makeOrder({ type: "delivery", bonusSpent: 160 });
    const result = await editOrderItems(prisma, {
      orderId: order.id, expectedUpdatedAt: order.updatedAt.toISOString(),
      lines: [{ kind: "existing", itemId: order.items[0].id, quantity: 1 }],
      deliveryChoice: { kind: "zone", name: "Тестовая зона" },
    });
    expect(result).toMatchObject({ itemsTotal: 400, deliveryPrice: 150, bonusSpent: 80, total: 470, bonusAccrued: 23 });
    expect(await prisma.bonusTransaction.aggregate({ where: { orderId: order.id }, _sum: { amount: true } })).toMatchObject({ _sum: { amount: -80 } });
    await applyAdminOrderStatus(prisma, order.id, "cancelled");
    expect(await prisma.bonusTransaction.aggregate({ where: { orderId: order.id }, _sum: { amount: true } })).toMatchObject({ _sum: { amount: 0 } });
  });

  it("uses the current delivery option and rejects a stale version atomically", async () => {
    const order = await makeOrder({ type: "delivery", deliveryOptionName: "Курьер" });
    const input = {
      orderId: order.id, expectedUpdatedAt: order.updatedAt.toISOString(),
      lines: [{ kind: "existing" as const, itemId: order.items[0].id, quantity: 2 },
        { kind: "existing" as const, itemId: order.items[1].id, quantity: 1 }],
      deliveryChoice: { kind: "option" as const, id: `${prefix}-option` },
    };
    const result = await editOrderItems(prisma, input);
    expect(result).toMatchObject({ itemsTotal: 1200, deliveryPrice: 0, total: 1200 });
    await expect(editOrderItems(prisma, input)).rejects.toThrow("Обновите страницу");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).total).toBe(1200);
  });

  it.each([
    { paymentMethod: "online" as const, paymentStatus: "pending" },
    { paymentMethod: "online" as const, paymentStatus: "paid" },
    { status: "cancelled" },
    { status: "issued" },
  ])("blocks settled or uneditable order %j without changing rows", async (options) => {
    const order = await makeOrder(options);
    await expect(editOrderItems(prisma, {
      orderId: order.id, expectedUpdatedAt: order.updatedAt.toISOString(),
      lines: [{ kind: "existing", itemId: order.items[0].id, quantity: 2 }], deliveryChoice: null,
    })).rejects.toThrow("Редактирование");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).itemsTotal).toBe(800);
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("rejects unavailable additions and minimum order violations without partial writes", async () => {
    const order = await makeOrder({ type: "delivery" });
    const version = order.updatedAt.toISOString();
    await expect(editOrderItems(prisma, {
      orderId: order.id, expectedUpdatedAt: version,
      lines: [{ kind: "new", dishId: `${prefix}-off`, modifierIds: [], quantity: 1 }],
      deliveryChoice: { kind: "zone", name: "Тестовая зона" },
    })).rejects.toThrow("недоступно");
    await expect(editOrderItems(prisma, {
      orderId: order.id, expectedUpdatedAt: version,
      lines: [{ kind: "new", dishId: `${prefix}-b`, modifierIds: [], quantity: 1 }],
      deliveryChoice: { kind: "zone", name: "Тестовая зона" },
    })).rejects.toThrow("Минимальная");
    await prisma.dish.update({ where: { id: `${prefix}-a` }, data: { available: false } });
    try {
      await expect(editOrderItems(prisma, {
        orderId: order.id, expectedUpdatedAt: version,
        lines: [{ kind: "existing", itemId: order.items[0].id, quantity: 2 }],
        deliveryChoice: { kind: "zone", name: "Тестовая зона" },
      })).rejects.toThrow("недоступно");
    } finally {
      await prisma.dish.update({ where: { id: `${prefix}-a` }, data: { available: true } });
    }
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(2);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).total).toBe(950);
  });
});
