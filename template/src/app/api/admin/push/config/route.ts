import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { findActivePushInstall, getVapidConfig, isPushConfigured } from "@/lib/admin-push";
import { requirePushActor } from "../shared";

export const dynamic = "force-dynamic";

const INSTALL_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Runtime-конфигурация push текущего tenant-а: публичный ключ нельзя печь
 * в NEXT_PUBLIC_* (образ общий), поэтому клиент берёт его здесь.
 * Подписка смотрится по installId текущего устройства.
 */
export async function GET(request: Request) {
  const actor = await requirePushActor(request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const rawInstallId = url.searchParams.get("installId");
  const installId = rawInstallId && INSTALL_ID.test(rawInstallId) ? rawInstallId : null;

  const config = getVapidConfig();
  let subscribed = false;
  let stale = false;
  if (installId && config) {
    const found = await findActivePushInstall(getPrisma(), actor.id, installId);
    subscribed = Boolean(found);
    stale = found?.stale ?? false;
  }

  return NextResponse.json(
    {
      enabled: isPushConfigured(),
      publicKey: config?.publicKey ?? null,
      subscribed,
      stale,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
