import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { readSettingsRev, writeSettingsVersioned } from "@/lib/admin-settings-version";

// Только с одноразовой PostgreSQL (DATABASE_URL) — как остальные *-integration.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const KEY = "settings";
let before: { value: unknown } | null = null;

afterAll(async () => {
  // Возвращаем строку настроек в исходное состояние (без инкремента ревизии).
  if (before) {
    const value = before.value as object;
    await prisma.settings.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  } else {
    await prisma.settings.delete({ where: { key: KEY } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("writeSettingsVersioned (F04/P1: атомарная версионированная запись)", () => {
  it("последовательные записи принимают возвращённую ревизию без ложного конфликта", async () => {
    const row = await prisma.settings.findUnique({ where: { key: KEY } });
    before = before ?? row;
    const startRev = readSettingsRev(row?.value ?? null);

    const first = await writeSettingsVersioned(prisma, (current) => ({ ...current, __seqTest: 1 }), startRev);
    expect(first).toBe(startRev + 1);

    // «Вторая вкладка-та же вкладка»: клиент обязан передать ревизию первой записи.
    const second = await writeSettingsVersioned(prisma, (current) => ({ ...current, __seqTest: 2 }), first as number);
    expect(second).toBe(startRev + 2);
    const after2 = await prisma.settings.findUnique({ where: { key: KEY } });
    expect(readSettingsRev(after2?.value ?? null)).toBe(startRev + 2);
    expect((after2?.value as Record<string, unknown>).__seqTest).toBe(2);

    await writeSettingsVersioned(prisma, (current) => {
      const rest = { ...current };
      delete rest.__seqTest;
      return rest;
    }, second as number);
  });

  it("одновременные записи с одной исходной ревизией: успевает ровно одна", async () => {
    const row = await prisma.settings.findUnique({ where: { key: KEY } });
    const startRev = readSettingsRev(row?.value ?? null);
    const attempts = 5;

    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        writeSettingsVersioned(prisma, (current) => ({ ...current, __raceTest: `win-${i}` }), startRev),
      ),
    );

    const winners = results.filter((r) => r !== "conflict");
    const conflicts = results.filter((r) => r === "conflict");
    expect(winners).toHaveLength(1);
    expect(conflicts).toHaveLength(attempts - 1);
    expect(winners[0]).toBe(startRev + 1);

    // Ревизия выросла ровно на один шаг, данные принадлежат победителю.
    const after = await prisma.settings.findUnique({ where: { key: KEY } });
    expect(readSettingsRev(after?.value ?? null)).toBe(startRev + 1);
    const winnerIndex = results.findIndex((r) => r !== "conflict");
    expect((after?.value as Record<string, unknown>).__raceTest).toBe(`win-${winnerIndex}`);

    await writeSettingsVersioned(prisma, (current) => {
      const rest = { ...current };
      delete rest.__raceTest;
      return rest;
    }, startRev + 1);
  });

  it("force обходит проверку и возвращает новую ревизию", async () => {
    const row = await prisma.settings.findUnique({ where: { key: KEY } });
    const startRev = readSettingsRev(row?.value ?? null);
    const rev = await writeSettingsVersioned(prisma, (current) => current, startRev - 1, true);
    expect(rev).toBe(startRev + 1);
  });

  it("устаревшая ревизия без force отклоняется значением conflict", async () => {
    const row = await prisma.settings.findUnique({ where: { key: KEY } });
    const startRev = readSettingsRev(row?.value ?? null);
    await expect(writeSettingsVersioned(prisma, (current) => current, startRev - 1)).resolves.toBe("conflict");
  });
});
