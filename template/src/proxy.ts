import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|content-asset).*)"],
};
