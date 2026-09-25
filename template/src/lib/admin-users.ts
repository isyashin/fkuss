import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { hashAdminPassword, verifyAdminPassword } from "./admin-password";

export const adminLoginSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,49}$/, "Логин: 3–50 латинских букв, цифр, точек или дефисов");
export const adminNameSchema = z.string().trim().min(1).max(100);
export const adminPasswordSchema = z.string().min(12, "Пароль должен содержать не меньше 12 символов").max(200);
export const adminRoleSchema = z.enum(["owner", "staff"]);
export type AdminRole = z.infer<typeof adminRoleSchema>;
export type AdminPermission = "orders" | "bookings" | "manage";
export type AdminActor = { id: string; login: string; name: string; role: AdminRole };

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function hasAdminPermission(actor: AdminActor, permission: AdminPermission): boolean {
  return actor.role === "owner" || permission === "orders" || permission === "bookings";
}

export async function createAdminUser(prisma: PrismaClient, input: { login: string; name: string; role: AdminRole; password: string }) {
  const login = adminLoginSchema.parse(input.login);
  const name = adminNameSchema.parse(input.name);
  const role = adminRoleSchema.parse(input.role);
  const password = adminPasswordSchema.parse(input.password);
  return prisma.adminUser.create({ data: { login, name, role, passwordHash: await hashAdminPassword(password) },
    select: { id: true, login: true, name: true, role: true, active: true } });
}

/** Запускается только явной командой перед первым включением новой админки. */
export async function bootstrapAdminOwner(prisma: PrismaClient, input: { login: string; name: string; password: string }) {
  const login = adminLoginSchema.parse(input.login);
  const name = adminNameSchema.parse(input.name);
  const password = adminPasswordSchema.parse(input.password);
  const passwordHash = await hashAdminPassword(password);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin-bootstrap-owner'))`;
    if (await tx.adminUser.count() !== 0) throw new Error("Владелец уже создан. Первичная настройка недоступна.");
    return tx.adminUser.create({ data: { login, name, role: "owner", passwordHash },
      select: { id: true, login: true, name: true, role: true } });
  });
}

export async function authenticateAdmin(prisma: PrismaClient, loginRaw: string, password: string): Promise<{ actor: AdminActor; token: string } | null> {
  const parsed = adminLoginSchema.safeParse(loginRaw);
  const user = parsed.success ? await prisma.adminUser.findUnique({ where: { login: parsed.data } }) : null;
  if (!user || !user.active || !adminRoleSchema.safeParse(user.role).success) {
    // Одинаковая дорогая операция для неизвестного и известного логина.
    await hashAdminPassword(password);
    return null;
  }
  if (!(await verifyAdminPassword(password, user.passwordHash))) return null;
  const token = randomBytes(32).toString("base64url");
  const issued = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AdminUser" WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.adminUser.findUnique({ where: { id: user.id } });
    if (!current || !current.active || current.passwordHash !== user.passwordHash || current.role !== user.role) return false;
    await tx.adminSession.create({ data: { tokenHash: tokenHash(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
    return true;
  });
  if (!issued) return null;
  return { actor: { id: user.id, login: user.login, name: user.name, role: user.role as AdminRole }, token };
}

export async function resolveAdminSession(prisma: PrismaClient, token: string | undefined): Promise<AdminActor | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await prisma.adminSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  const role = adminRoleSchema.safeParse(session.user.role);
  if (!role.success) return null;
  return { id: session.user.id, login: session.user.login, name: session.user.name, role: role.data };
}

export async function revokeAdminSession(prisma: PrismaClient, token: string | undefined): Promise<void> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await prisma.adminSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

export async function updateAdminUser(prisma: PrismaClient, userId: string, input: { name?: string; role?: AdminRole; active?: boolean; password?: string }) {
  const name = input.name === undefined ? undefined : adminNameSchema.parse(input.name);
  const role = input.role === undefined ? undefined : adminRoleSchema.parse(input.role);
  const passwordHash = input.password === undefined ? undefined : await hashAdminPassword(adminPasswordSchema.parse(input.password));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin-users-management'))`;
    const current = await tx.adminUser.findUnique({ where: { id: userId } });
    if (!current) throw new Error("Сотрудник не найден");
    if (current.active && current.role === "owner" && (role === "staff" || input.active === false)) {
      const owners = await tx.adminUser.count({ where: { role: "owner", active: true } });
      if (owners <= 1) throw new Error("Нельзя отключить последнего владельца");
    }
    const updated = await tx.adminUser.update({ where: { id: userId }, data: { name, role, active: input.active, passwordHash },
      select: { id: true, login: true, name: true, role: true, active: true } });
    if (role !== undefined || input.active !== undefined || passwordHash !== undefined) {
      await tx.adminSession.deleteMany({ where: { userId } });
    }
    return updated;
  });
}
