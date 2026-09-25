import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Только одноразовая PostgreSQL после миграции 0007.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const ids: string[] = [];

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("guest contact preference in the restaurant database", () => {
  it("persists the guest's selected channel and keeps old rows nullable", async () => {
    const selected = await prisma.order.create({ data: {
      type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+79035552392", preferredChannel: "whatsapp",
    } });
    const legacy = await prisma.order.create({ data: {
      type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+79035552392",
    } });
    ids.push(selected.id, legacy.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: selected.id } })).preferredChannel).toBe("whatsapp");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: legacy.id } })).preferredChannel).toBeNull();
  });

  it("rejects an unknown channel at the database boundary", async () => {
    await expect(prisma.order.create({ data: {
      type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+79035552392", preferredChannel: "email",
    } })).rejects.toThrow();
  });
});
