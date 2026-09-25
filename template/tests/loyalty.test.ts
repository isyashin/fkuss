import { describe, it, expect, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { accrueOrderBonus, reverseOrderBonus, getBonusBalance } from "@/lib/loyalty";

// Запускать только против одноразовой тестовой БД (scripts/test-with-db.sh)
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function makeOrder(overrides: Partial<{ total: number; bonusAccrued: number; bonusSpent: number }> = {}) {
  const customer = await prisma.customer.create({
    data: { email: `test-${crypto.randomUUID()}@example.com`, name: "Тест", phone: "+7000" },
  });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      type: "pickup",
      status: "issued",
      itemsTotal: overrides.total ?? 1000,
      total: overrides.total ?? 1000,
      bonusAccrued: overrides.bonusAccrued ?? 50,
      bonusSpent: overrides.bonusSpent ?? 0,
      customerName: "Тест",
      customerPhone: "+7000",
      items: {
        create: [{ dishId: "d1", name: "Тест", price: 1000, quantity: 1, total: 1000 }],
      },
    },
  });
  return { customer, order };
}

async function cleanup(customerId: string) {
  await prisma.bonusTransaction.deleteMany({ where: { customerId } });
  const orders = await prisma.order.findMany({ where: { customerId }, select: { id: true } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await prisma.order.deleteMany({ where: { customerId } });
  await prisma.customer.delete({ where: { id: customerId } });
}

describe("loyalty ledger", () => {

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("начисление после выдачи заказа", async () => {
    const { customer, order } = await makeOrder();
    await accrueOrderBonus(prisma, order.id);
    const balance = await getBonusBalance(prisma, customer.id);
    expect(balance).toBe(50);
    await cleanup(customer.id);
  });

  it("повторное начисление по тому же заказу запрещено (идемпотентность)", async () => {
    const { customer, order } = await makeOrder();
    await accrueOrderBonus(prisma, order.id);
    await accrueOrderBonus(prisma, order.id);
    expect(await getBonusBalance(prisma, customer.id)).toBe(50);
    await cleanup(customer.id);
  });

  it("сторнирование при отмене заказа", async () => {
    const { customer, order } = await makeOrder();
    await accrueOrderBonus(prisma, order.id);
    await reverseOrderBonus(prisma, order.id);
    expect(await getBonusBalance(prisma, customer.id)).toBe(0);
    await cleanup(customer.id);
  });

  it("при отмене возвращаются потраченные бонусы и сторнируется начисление", async () => {
    const { customer, order } = await makeOrder({ bonusSpent: 200, bonusAccrued: 40 });
    // имитируем списание при оформлении
    await prisma.bonusTransaction.create({
      data: { customerId: customer.id, orderId: order.id, type: "spend", amount: -200 },
    });
    await accrueOrderBonus(prisma, order.id); // +40 → баланс -160
    await reverseOrderBonus(prisma, order.id); // сторно -40, возврат +200 → 0
    expect(await getBonusBalance(prisma, customer.id)).toBe(0);
    const txns = await prisma.bonusTransaction.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "asc" },
    });
    expect(txns.map((t) => `${t.type}:${t.amount}`)).toEqual([
      "spend:-200",
      "accrual:40",
      "reversal:-40",
      "refund:200",
    ]);
    await cleanup(customer.id);
  });

  it("заказ без клиента — начисления нет, но и не падает", async () => {
    const order = await prisma.order.create({
      data: {
        type: "pickup",
        itemsTotal: 100,
        total: 100,
        customerName: "Аноним",
        customerPhone: "+7000",
        items: { create: [{ dishId: "d1", name: "Тест", price: 100, quantity: 1, total: 100 }] },
      },
    });
    await accrueOrderBonus(prisma, order.id); // не должно падать
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
  });
});
