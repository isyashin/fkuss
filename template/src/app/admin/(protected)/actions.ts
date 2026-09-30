"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import type { AdminPermission } from "@/lib/admin-users";
import { applyAdminOrderStatus } from "@/lib/order-status-service";
import { applyAdminBookingStatus } from "@/lib/admin-bookings-service";
import { editOrderItems, orderEditSchema, type OrderEditInput } from "@/lib/admin-order-edit";
import { ORDER_STATUS_CODES } from "@/lib/order-status";
import { parseAdminInput, adminIdSchema } from "@/lib/admin-validation";
import { z } from "zod";

async function guard(permission: AdminPermission) {
  if (!(await isAdmin(permission))) throw new Error("Forbidden");
}

export async function setOrderStatus(orderId: string, status: string): Promise<void> {
  await guard("orders");
  parseAdminInput(adminIdSchema, orderId);
  const target = parseAdminInput(z.enum(ORDER_STATUS_CODES), status);
  const prisma = getPrisma();
  await applyAdminOrderStatus(prisma, orderId, target);

  revalidatePath("/admin");
  revalidatePath("/account");
}

export async function saveOrderItems(input: OrderEditInput): Promise<void> {
  await guard("orders");
  await editOrderItems(getPrisma(), orderEditSchema.parse(input));
  revalidatePath("/admin");
  revalidatePath("/account");
}

export async function setBookingStatus(id: string, status: string): Promise<void> {
  await guard("bookings");
  parseAdminInput(adminIdSchema, id);
  const target = parseAdminInput(z.enum(["confirmed", "rejected", "cancelled"]), status);
  await applyAdminBookingStatus(getPrisma(), id, target);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
}
