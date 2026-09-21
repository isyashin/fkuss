"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import { printMaterialDesignSchema, type PrintMaterialDesign } from "@/lib/print-materials";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function savePrintMaterial(input: PrintMaterialDesign): Promise<void> {
  await guard();
  const design = printMaterialDesignSchema.parse(input);
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "printMaterials" } });
  const current = row?.value && typeof row.value === "object" && !Array.isArray(row.value)
    ? (row.value as Record<string, unknown>)
    : {};
  const next = { ...current, [design.kind]: design };

  await prisma.settings.upsert({
    where: { key: "printMaterials" },
    create: { key: "printMaterials", value: JSON.parse(JSON.stringify(next)) },
    update: { value: JSON.parse(JSON.stringify(next)) },
  });
  revalidatePath("/admin/print-materials");
}
