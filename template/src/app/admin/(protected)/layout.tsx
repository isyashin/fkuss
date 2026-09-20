import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Заказы" },
  { href: "/admin/bookings", label: "Брони" },
  { href: "/admin/menu", label: "Меню" },
  { href: "/admin/promos", label: "Акции" },
  { href: "/admin/gallery", label: "Галерея" },
  { href: "/admin/pages", label: "Страницы" },
  { href: "/admin/restaurant", label: "Ресторан" },
  { href: "/admin/sync", label: "Синхронизация" },
  { href: "/admin/delivery", label: "Доставка" },
  { href: "/admin/settings", label: "Настройки" },
  { href: "/admin/billing", label: "Подписка" },
];

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-40 bg-foreground text-background">
        <div className="mx-auto max-w-6xl px-4 flex items-center gap-1 overflow-x-auto h-14">
          <span className="font-bold mr-3 shrink-0">Админка</span>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`min-h-11 px-3 inline-flex items-center shrink-0 text-sm ${
                item.href === "/admin/billing" ? "text-amber-300" : "opacity-80 hover:opacity-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/" className="ml-auto min-h-11 px-3 inline-flex items-center shrink-0 text-sm opacity-80">
            На сайт →
          </Link>
        </div>
      </header>
      <div className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
