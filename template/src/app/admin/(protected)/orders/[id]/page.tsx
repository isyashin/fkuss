import { redirect } from "next/navigation";

// Прямая ссылка на карточку заказа восстанавливает деталь через ?selected=
// (F10): тот же контракт, что у ссылок из списка и push-уведомлений.
export default async function AdminOrderByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const selected = id.length <= 100 ? id : id.slice(0, 100);
  redirect(`/admin?selected=${encodeURIComponent(selected)}`);
}
