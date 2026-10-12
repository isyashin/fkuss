import { getAdminActor } from "@/lib/admin-auth";
import type { AdminActor } from "@/lib/admin-users";

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Все методы push доступны только действующему администратору. */
export async function requirePushActor(request: Request): Promise<AdminActor | null> {
  void request;
  return getAdminActor();
}

/** CSRF-гигиена для мутаций: Origin обязан совпадать с Host сайта. */
export function originMatches(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    return Boolean(host) && url.host === host && (url.protocol === "https:" || url.protocol === "http:");
  } catch {
    return false;
  }
}

/** JSON-тело с жёстким лимитом размера: читаем поток по кускам и обрываем при
 *  превышении (запрос без Content-Length не читаем целиком). null — отклонить. */
export async function readJsonBody(request: Request, maxBytes = 4096): Promise<unknown | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) return null;
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8")) as unknown;
  } catch {
    return null;
  }
}
