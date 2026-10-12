import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: доставка — секция «Настройки → Доставка и самовывоз».
export default async function AdminDeliveryPage() {
  redirect("/admin/settings?section=delivery");
}
