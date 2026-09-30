import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "./db";
import { authenticateAdmin, hasAdminPermission, resolveAdminSession, revokeAdminSession, type AdminActor, type AdminPermission } from "./admin-users";

const ADMIN_COOKIE = "resto_admin_v2";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function loginAdmin(login: string, password: string): Promise<boolean> {
  const result = await authenticateAdmin(getPrisma(), login, password);
  if (!result) return false;
  (await cookies()).set(ADMIN_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_HTTP !== "1",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return true;
}

export async function getAdminActor(): Promise<AdminActor | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return resolveAdminSession(getPrisma(), token);
}

export async function isAdmin(permission: AdminPermission = "manage"): Promise<boolean> {
  const actor = await getAdminActor();
  return actor !== null && hasAdminPermission(actor, permission);
}

export async function requireAdminPermission(permission: AdminPermission): Promise<AdminActor> {
  const actor = await getAdminActor();
  if (!actor) redirect("/admin/login");
  if (!hasAdminPermission(actor, permission)) redirect("/admin");
  return actor;
}

export async function logoutAdmin(): Promise<void> {
  const jar = await cookies();
  await revokeAdminSession(getPrisma(), jar.get(ADMIN_COOKIE)?.value);
  jar.delete(ADMIN_COOKIE);
}
