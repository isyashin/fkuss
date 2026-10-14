"use client";

import Link from "next/link";
import { adminListHref, type BookingListQuery, type OrderListQuery } from "@/lib/admin-list-query";
import styles from "./admin-ui.module.css";

export function AdminPagination({ base, query, page, pageCount }: { base: "/admin" | "/admin/bookings"; query: OrderListQuery | BookingListQuery; page: number; pageCount: number }) {
  const href = (target: number) => adminListHref(base, { ...query, page: target });

  return <div className={styles.pagination}>
    <nav aria-label="Страницы списка" className={styles.pageLinks}>
      {page > 1 ? <Link href={href(page - 1)} prefetch={false}>← Назад</Link> : <span aria-disabled="true">← Назад</span>}
      <span>Страница {page} из {pageCount}</span>
      {page < pageCount ? <Link href={href(page + 1)} prefetch={false}>Далее →</Link> : <span aria-disabled="true">Далее →</span>}
    </nav>
    {pageCount > 2 && <form action={base} method="get" className={styles.pageJump}>
      {"status" in query && query.status !== "all" && <input type="hidden" name="status" value={query.status}/>}
      {"type" in query && query.type !== "all" && <input type="hidden" name="type" value={query.type}/>}
      {"mode" in query && query.mode !== "all" && query.mode !== "current" && query.mode !== "upcoming" && <input type="hidden" name="mode" value={query.mode}/>}
      {"q" in query && query.q && <input type="hidden" name="q" value={query.q}/>}
      {query.sort !== "desc" && <input type="hidden" name="sort" value={query.sort}/>}
      <label htmlFor={`${base}-page-number`}>Страница</label>
      <input key={page} id={`${base}-page-number`} type="number" name="page" min="1" max={pageCount} defaultValue={page} aria-label="Номер страницы"/>
      <button type="submit">Перейти</button>
    </form>}
  </div>;
}
