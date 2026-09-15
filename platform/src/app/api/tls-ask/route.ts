import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

/**
 * Ask-эндпоинт для on-demand TLS (Caddy спрашивает, можно ли выпускать
 * сертификат для домена). Разрешено только для доменов из реестра сайтов.
 * GET /api/tls-ask?domain=example.ru
 */
export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain") ?? "";
  if (!domain) return NextResponse.json({ error: "domain?" }, { status: 400 });

  const prisma = getPrisma();
  const site = await prisma.site.findFirst({
    where: { domains: { has: domain }, state: { not: "suspended" } },
  });

  if (!site) {
    return NextResponse.json({ error: "Домен не разрешён" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
