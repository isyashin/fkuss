import Link from "next/link";
import { getSiteRestaurant } from "@/lib/site";

export async function SiteHeader() {
  const restaurant = await getSiteRestaurant();
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-foreground/10">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg truncate">
          {restaurant.name}
        </Link>
        <nav className="flex gap-1 text-sm">
          <Link href="/menu" className="min-h-11 px-3 inline-flex items-center">
            Меню
          </Link>
          <Link href="/booking" className="min-h-11 px-3 inline-flex items-center">
            Бронь
          </Link>
          <Link href="/account" className="min-h-11 px-3 inline-flex items-center">
            Кабинет
          </Link>
          <a href={`tel:${restaurant.phone}`} className="hidden sm:inline-flex min-h-11 px-3 items-center text-accent font-medium">
            {restaurant.phone}
          </a>
        </nav>
      </div>
    </header>
  );
}
