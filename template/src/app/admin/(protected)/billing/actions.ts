"use server";

import { headers } from "next/headers";
import { isAdmin } from "@/lib/admin-auth";
import { requestTopup } from "@/lib/platform";
import { parseAdminInput, adminMoneySchema } from "@/lib/admin-validation";

export async function topupAction(amountRub: number): Promise<{ confirmationUrl?: string; error?: string }> {
  if (!(await isAdmin())) return { error: "Forbidden" };
  amountRub = parseAdminInput(adminMoneySchema, amountRub);
  // Возврат после оплаты — обратно в раздел подписки этого сайта
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const returnUrl = host ? `${proto}://${host}/admin/billing` : undefined;
  return requestTopup(amountRub, returnUrl);
}
