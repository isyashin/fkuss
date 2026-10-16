import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { runBillingDaily } from "@/lib/billing-job";
import { applyPaidTopup } from "@/lib/billing-ledger";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const slug = `pause-${crypto.randomUUID()}`;
const tariffId = `${slug}-tariff`;
afterAll(async () => {
  await prisma.balanceTransaction.deleteMany({ where: { siteId: slug } });
  await prisma.payment.deleteMany({ where: { siteId: slug } });
  await prisma.invoice.deleteMany({ where: { siteId: slug } });
  await prisma.site.deleteMany({ where: { slug } });
  await prisma.tariff.deleteMany({ where: { id: tariffId } });
  await prisma.$disconnect();
});

describe("manual pause with real PostgreSQL", () => {
  it("survives billing, paid topup and duplicate webhook, but financial suspension can resume", async () => {
    await prisma.tariff.create({ data: { id: tariffId, name: "QA", monthlyPrice: 3000 } });
    await prisma.site.create({ data: { slug, name: "QA", port: 59997, siteKey: slug, domains: [], tariffId, state: "suspended", manualSuspended: true } });
    await prisma.balanceTransaction.create({ data: { siteId: slug, type: "topup", amount: 100_000 } });
    await runBillingDaily();
    expect((await prisma.site.findUniqueOrThrow({ where: { slug } })).state).toBe("suspended");
    expect(await prisma.balanceTransaction.count({ where: { siteId: slug, type: "charge" } })).toBe(0);
    const invoice = await prisma.invoice.create({ data: { siteId: slug, amount: 50_000 } });
    const payment = await prisma.payment.create({ data: { siteId: slug, invoiceId: invoice.id, amount: 50_000 } });
    expect(await applyPaidTopup(prisma, invoice.id, "qa-provider")).toBe(true);
    expect(await applyPaidTopup(prisma, invoice.id, "qa-provider")).toBe(false);
    const paused = await prisma.site.findUniqueOrThrow({ where: { slug } });
    expect(paused.state).toBe("suspended");
    expect(paused.manualSuspended).toBe(true);
    expect(await prisma.balanceTransaction.count({ where: { dedupeKey: `topup:${payment.id}` } })).toBe(1);
    await prisma.site.update({ where: { slug }, data: { manualSuspended: false } });
    await runBillingDaily();
    expect((await prisma.site.findUniqueOrThrow({ where: { slug } })).state).toBe("active");
  });
});
