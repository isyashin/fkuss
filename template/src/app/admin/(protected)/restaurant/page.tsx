import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: ресторан — секция «Настройки → Данные и контакты».
export default async function AdminRestaurantPage() {
  redirect("/admin/settings?section=restaurant");
}
