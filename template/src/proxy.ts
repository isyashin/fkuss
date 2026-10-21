import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GUEST_SESSION_COOKIE, ADMIN_SESSION_COOKIE, ORDER_CONFIRMATION_COOKIE, GUEST_ORDER_COOKIE } from "./lib/auth-cookie-names";

const BOT_UA = /bot|crawler|spider|preview|pingdom|lighthouse|headless/i;
const EXCLUDED = ["/admin", "/account", "/api", "/payment", "/manifest.webmanifest"];

/**
 * Счёт просмотров витрины (BUG-027): только гостевые страницы,
 * без админки, кабинета, API и служебных маршрутов.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPage =
    request.method === "GET" &&
    (request.headers.get("accept") ?? "").includes("text/html") &&
    !EXCLUDED.some((p) => pathname.startsWith(p)) &&
    !BOT_UA.test(request.headers.get("user-agent") ?? "");

  if (isPage) {
    // fire-and-forget: просмотры не должны тормозить страницу.
    // Через внутренний роут — в proxy нельзя тянуть pg напрямую (edge-runtime)
    void fetch(new URL("/api/pv", request.url), { method: "POST" }).catch(() => {});
  }

  // Путь для root layout: фон витрины не применяется в /admin
  // Путь+query — для редиректа на вход с возвратом (?next=) после истёкшей сессии.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  headers.set("x-search", request.nextUrl.search);
  const response = NextResponse.next({ request: { headers } });
  // The public storefront can embed the guest's last address/bonus balance.
  // Cookie presence is a conservative cache rule, not an authorization check.
  if ([GUEST_SESSION_COOKIE, ADMIN_SESSION_COOKIE, ORDER_CONFIRMATION_COOKIE, GUEST_ORDER_COOKIE].some((name) => request.cookies.has(name))) {
    response.headers.set("x-fkuss-cache", "private");
  } else {
    response.headers.set("x-fkuss-cache", "public");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|content-asset).*)"],
};
