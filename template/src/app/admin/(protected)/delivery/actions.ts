"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export interface DeliveryOptionInput {
  id?: string;
  name: string;
  mode: "asap" | "scheduled";
  enabled: boolean;
  days: number[];
  hoursFrom: string;
  hoursTo: string;
  slotMinutes: number;
  minAheadMinutes: number;
  daysAhead: number;
  price: number;
  freeFrom: number | null;
  exceptions: string[];
}

export async function saveDeliveryOption(input: DeliveryOptionInput): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const id = input.id ?? `opt-${Date.now().toString(36)}`;
  const max = await prisma.deliveryOption.aggregate({ _max: { position: true } });
  await prisma.deliveryOption.upsert({
    where: { id },
    create: { ...input, id, position: (max._max.position ?? -1) + 1 },
    update: input,
  });
  revalidatePath("/admin/delivery");
}

export async function deleteDeliveryOption(id: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.deliveryOption.delete({ where: { id } });
  revalidatePath("/admin/delivery");
}
