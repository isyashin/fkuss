"use server";

import { revalidatePath } from "next/cache";
import { getSessionOwner } from "@/lib/owner-auth";
import { getPrisma } from "@/lib/db";

/** Помечает сайт как «запрошен экспорт»; обрабатывает cron на хосте. */
export async function requestExportAction(slug: string): Promise<void> {
  const owner = await getSessionOwner();
  if (!owner || owner.siteId !== slug) throw new Error("Forbidden");

  const prisma = getPrisma();
  await prisma.site.update({
    where: { slug },
    data: { exportRequestedAt: new Date() },
  });
  revalidatePath("/cabinet");
}
