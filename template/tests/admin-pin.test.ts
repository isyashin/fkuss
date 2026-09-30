import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  generateOwnerPin,
  getOwnerPin,
  ownerPinSchema,
  setOwnerPin,
  verifyOwnerPin,
  pinAttemptsLeft,
} from "@/lib/admin-pin";

// PIN владельца: хранение, проверка, rate limit. Только одноразовая PostgreSQL.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

afterAll(async () => {
  await prisma.settings.deleteMany({ where: { key: "ownerPin" } });
  await prisma.$disconnect();
});

describe("owner PIN", () => {
  it("stores and returns a valid PIN", async () => {
    expect(ownerPinSchema.test("12345")).toBe(true);
    expect(ownerPinSchema.test("123")).toBe(false);
    expect(ownerPinSchema.test("1234567")).toBe(false);
    expect(ownerPinSchema.test("12a45")).toBe(false);
    await setOwnerPin("4242");
    expect(await getOwnerPin()).toBe("4242");
    await setOwnerPin("12345");
    expect(await getOwnerPin()).toBe("12345");
    expect(generateOwnerPin()).toMatch(/^\d{4,6}$/);
  });

  it("accepts the right PIN and rejects wrong ones", async () => {
    await setOwnerPin("99999");
    const actor = randomBytes(8).toString("hex");
    const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.5`;
    expect((await verifyOwnerPin("99999", actor, ip)).ok).toBe(true);
    expect((await verifyOwnerPin("99998", actor, ip)).ok).toBe(false);
    // Пустой сохранённый PIN ничего не открывает
    await prisma.settings.deleteMany({ where: { key: "ownerPin" } });
    expect((await verifyOwnerPin("99999", actor, ip)).ok).toBe(false);
  });

  it("blocks after 5 attempts within the window", async () => {
    await setOwnerPin("55555");
    const actor = randomBytes(8).toString("hex");
    const ip = `10.99.${Math.floor(Math.random() * 200) + 1}.9`;
    for (let i = 0; i < 5; i++) {
      const result = await verifyOwnerPin("00000", actor, ip);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Неверный PIN");
    }
    const blocked = await verifyOwnerPin("55555", actor, ip);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain("Слишком много попыток");
    expect(pinAttemptsLeft(`${actor}:${ip}`)).toBe(0);
  });
});
