"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { getSessionCustomer } from "@/lib/auth";

async function requireCustomer() {
  const customer = await getSessionCustomer();
  if (!customer) throw new Error("Forbidden");
  return customer;
}

/** Отмена своей брони (только new/confirmed) */
export async function cancelBooking(id: string): Promise<void> {
  const customer = await requireCustomer();
  const prisma = getPrisma();
  const booking = await prisma.reservation.findUnique({ where: { id } });
  if (!booking || booking.customerId !== customer.id) throw new Error("Forbidden");
  if (!["new", "confirmed"].includes(booking.status)) throw new Error("Бронь уже нельзя отменить");

  await prisma.reservation.update({ where: { id }, data: { status: "cancelled" } });
  revalidatePath("/account");
}

const addressSchema = z.object({
  label: z.string().max(50).default(""),
  street: z.string().min(3).max(300),
  entrance: z.string().max(20).default(""),
  floor: z.string().max(10).default(""),
  apartment: z.string().max(20).default(""),
  comment: z.string().max(300).default(""),
});

export async function addAddress(input: z.infer<typeof addressSchema>): Promise<void> {
  const customer = await requireCustomer();
  const parsed = addressSchema.parse(input);
  const prisma = getPrisma();
  await prisma.address.create({
    data: { customerId: customer.id, ...parsed },
  });
  revalidatePath("/account");
}

export async function deleteAddress(id: string): Promise<void> {
  const customer = await requireCustomer();
  const prisma = getPrisma();
  await prisma.address.deleteMany({ where: { id, customerId: customer.id } });
  revalidatePath("/account");
}
