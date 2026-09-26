import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { bootstrapAdminOwner, createAdminUser, authenticateAdmin, hasAdminPermission, resolveAdminSession, revokeAdminSession, updateAdminUser } from "@/lib/admin-users";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/admin-password";

// Только одноразовые БД. Второй URL задаётся адресным тестовым прогоном.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const other = process.env.TEST_DATABASE_URL_2
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL_2 }) }) : null;
const prefix = `staff-${crypto.randomUUID()}`;
const password = randomBytes(32).toString("base64url");
let ownerId: string;
let staffId: string;

beforeAll(async () => {
  const owner = await bootstrapAdminOwner(prisma, { login: `${prefix}-owner`, name: "Владелец теста", password });
  ownerId = owner.id;
  const staff = await createAdminUser(prisma, { login: `${prefix}-staff`, name: "Сотрудник теста", role: "staff", password });
  staffId = staff.id;
});

afterAll(async () => {
  await prisma.adminSession.deleteMany({ where: { userId: { in: [ownerId, staffId] } } });
  await prisma.adminUser.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
  await prisma.$disconnect();
  await other?.$disconnect();
});

describe("restaurant staff authentication", () => {
  it("stores salted password hashes and rejects wrong credentials", async () => {
    const hash = await hashAdminPassword(password);
    expect(hash).not.toContain(password);
    expect(await verifyAdminPassword(password, hash)).toBe(true);
    expect(await verifyAdminPassword(`${password}-wrong`, hash)).toBe(false);
    expect(await authenticateAdmin(prisma, `${prefix}-staff`, `${password}-wrong`)).toBeNull();
    expect(await authenticateAdmin(prisma, `${prefix}-missing`, password)).toBeNull();
  });

  it("creates an opaque session, checks role and revokes on logout", async () => {
    const result = await authenticateAdmin(prisma, `${prefix}-staff`, password);
    expect(result).not.toBeNull();
    const token = result!.token;
    expect(token).toHaveLength(43);
    expect((await prisma.adminSession.findFirst({ where: { userId: staffId } }))?.tokenHash).not.toBe(token);
    const actor = await resolveAdminSession(prisma, token);
    expect(actor).toMatchObject({ id: staffId, name: "Сотрудник теста", role: "staff" });
    expect(hasAdminPermission(actor!, "orders")).toBe(true);
    expect(hasAdminPermission(actor!, "bookings")).toBe(true);
    expect(hasAdminPermission(actor!, "manage")).toBe(false);
    await revokeAdminSession(prisma, token);
    expect(await resolveAdminSession(prisma, token)).toBeNull();
  });

  it("invalidates sessions when password or active state changes", async () => {
    const first = await authenticateAdmin(prisma, `${prefix}-staff`, password);
    const newer = randomBytes(32).toString("base64url");
    await updateAdminUser(prisma, staffId, { password: newer });
    expect(await resolveAdminSession(prisma, first!.token)).toBeNull();
    expect(await authenticateAdmin(prisma, `${prefix}-staff`, password)).toBeNull();
    const second = await authenticateAdmin(prisma, `${prefix}-staff`, newer);
    expect(second).not.toBeNull();
    await updateAdminUser(prisma, staffId, { active: false });
    expect(await resolveAdminSession(prisma, second!.token)).toBeNull();
    expect(await authenticateAdmin(prisma, `${prefix}-staff`, newer)).toBeNull();
  });

  it("protects the last owner and closes bootstrap after first account", async () => {
    await expect(updateAdminUser(prisma, ownerId, { active: false })).rejects.toThrow("последнего владельца");
    await expect(bootstrapAdminOwner(prisma, { login: `${prefix}-second`, name: "Другой", password })).rejects.toThrow("уже создан");
    const owner = await authenticateAdmin(prisma, `${prefix}-owner`, password);
    expect(hasAdminPermission(owner!.actor, "manage")).toBe(true);
  });

  it.skipIf(!other)("does not accept an account or cookie token from another tenant database", async () => {
    const session = await authenticateAdmin(prisma, `${prefix}-owner`, password);
    expect(await authenticateAdmin(other!, `${prefix}-owner`, password)).toBeNull();
    expect(await resolveAdminSession(other!, session!.token)).toBeNull();
    expect(await resolveAdminSession(prisma, session!.token)).toMatchObject({ id: ownerId });
  });
});
