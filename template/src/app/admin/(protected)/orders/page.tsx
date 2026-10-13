import { redirect } from "next/navigation";

// Заказы живут на /admin; алиас убирает 404 для прямых ссылок /admin/orders.
// Анонимов layout (protected) редиректит на /admin/login, как в прочих разделах.
export default function AdminOrdersAliasPage() {
  redirect("/admin");
}
