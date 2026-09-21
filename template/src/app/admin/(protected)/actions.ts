"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { accrueOrderBonus, reverseOrderBonus } from "@/lib/loyalty";
import { parseAdminInput, adminIdSchema } from "@/lib/admin-validation";
import { z } from "zod";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

const ORDER_FLOW: Record<string, string[]> = {
  new: ["accepted", "cancelled"],
  accepted: ["cooking", "cancelled"],
  cooking: ["delivering", "done", "cancelled"],
  delivering: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export async function setOrderStatus(orderId: string, status: string): Promise<void> {
  await guard();
  parseAdminInput(adminIdSchema, orderId);
  parseAdminInput(z.enum(["accepted", "cancelled", "cooking", "delivering", "done"]), status);
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Заказ не найден");
  if (!ORDER_FLOW[order.status]?.includes(status)) {
    throw new Error(`Недопустимый переход: ${order.status} → ${status}`);
  }

  await prisma.order.update({ where: { id: orderId }, data: { status } });

  // Лояльность: начисление при «выполнен», сторно при «отменён»
  if (status === "done") await accrueOrderBonus(prisma, orderId);
  if (status === "cancelled") await reverseOrderBonus(prisma, orderId);

  revalidatePath("/admin");
}

export async function setBookingStatus(id: string, status: string): Promise<void> {
  await guard();
  parseAdminInput(adminIdSchema, id);
  parseAdminInput(z.enum(["confirmed", "rejected", "cancelled"]), status);
  if (!["confirmed", "rejected", "cancelled"].includes(status)) {
    throw new Error("Недопустимый статус брони");
  }
  const prisma = getPrisma();
  await prisma.reservation.update({ where: { id }, data: { status } });
  revalidatePath("/admin/bookings");
}
