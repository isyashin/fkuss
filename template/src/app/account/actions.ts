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

export async function updateAddress(id: string, input: z.infer<typeof addressSchema>): Promise<void> {
  const customer = await requireCustomer();
  const parsed = addressSchema.parse(input);
  const prisma = getPrisma();
  await prisma.address.updateMany({ where: { id, customerId: customer.id }, data: parsed });
  revalidatePath("/account");
}

const profileSchema = z.object({
  name: z.string().min(1, "Укажите имя").max(100),
  phone: z.string().min(5, "Укажите телефон").max(20),
});

export async function updateProfile(input: z.infer<typeof profileSchema>): Promise<{ ok: boolean; error?: string }> {
  const customer = await requireCustomer();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const prisma = getPrisma();
  await prisma.customer.update({ where: { id: customer.id }, data: parsed.data });
  revalidatePath("/account");
  return { ok: true };
}

/**
 * Гость отменяет свой заказ, пока он новый. Возвращаем потраченные бонусы
 * (ledger refund) — начисленных при статусе new ещё не было.
 */
export async function cancelMyOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const customer = await requireCustomer();
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== customer.id) return { ok: false, error: "Заказ не найден" };
  if (order.status !== "new") return { ok: false, error: "Этот заказ уже нельзя отменить самостоятельно — позвоните нам" };
  if (order.paymentStatus === "paid") return { ok: false, error: "Оплаченный заказ отменяется через ресторан" };

  const { reverseOrderBonus } = await import("@/lib/loyalty");
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
    await reverseOrderBonus(tx, order.id);
  });
  revalidatePath("/account");
  revalidatePath(`/account/orders/${orderId}`);
  return { ok: true };
}

/** Повторить заказ: актуальные цены и доступность из БД; вернём готовые позиции корзины и пропущенные. */
export async function repeatOrder(orderId: string): Promise<{
  ok: boolean;
  items: { dishId: string; name: string; price: number; quantity: number; modifiers: { id: string; name: string; price: number }[] }[];
  skipped: string[];
  error?: string;
}> {
  const customer = await requireCustomer();
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.customerId !== customer.id) return { ok: false, items: [], skipped: [], error: "Заказ не найден" };

  const items: { dishId: string; name: string; price: number; quantity: number; modifiers: { id: string; name: string; price: number }[] }[] = [];
  const skipped: string[] = [];

  for (const item of order.items) {
    const dish = await prisma.dish.findUnique({
      where: { id: item.dishId },
      include: { modifierGroups: { include: { modifiers: true } } },
    });
    if (!dish || !dish.available) { skipped.push(item.name); continue; }

    // Модификаторы из снимка проверяем по актуальному меню: живые остаются, мёртвые отбрасываются.
    const snapshot = (item.modifiers ?? []) as { id: string; name: string; price: number }[];
    const alive = snapshot.filter((m) =>
      dish.modifierGroups.some((g) => g.modifiers.some((mod) => mod.id === m.id)),
    );
    items.push({ dishId: dish.id, name: dish.name, price: dish.price, quantity: item.quantity, modifiers: alive });
  }

  return { ok: true, items, skipped };
}
