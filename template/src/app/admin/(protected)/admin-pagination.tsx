"use client";

import Link from "next/link";
import { ADMIN_PAGE_SIZE, adminListHref, type BookingListQuery, type OrderListQuery } from "@/lib/admin-list-query";
import styles from "./admin-ui.module.css";

export function AdminPagination({ base, query, page, pageCount, total }: { base: "/admin" | "/admin/bookings"; query: OrderListQuery | BookingListQuery; page: number; pageCount: number; total: number }) {
  const start = total === 0 ? 0 : (page - 1) * ADMIN_PAGE_SIZE + 1;
  const end = Math.min(total, page * ADMIN_PAGE_SIZE);
  const href = (target: number) => adminListHref(base, { ...query, page: target });

  return <div className={styles.pagination}>
    <span className={styles.muted}>Показано {start}–{end} из {total}</span>
    <nav aria-label="Страницы списка" className={styles.pageLinks}>
      {page > 1 ? <Link href={href(page - 1)} prefetch={false}>← Назад</Link> : <span aria-disabled="true">← Назад</span>}
      <span>Страница {page} из {pageCount}</span>
      {page < pageCount ? <Link href={href(page + 1)} prefetch={false}>Далее →</Link> : <span aria-disabled="true">Далее →</span>}
    </nav>
    {pageCount > 2 && <form action={base} method="get" className={styles.pageJump}>
      {query.status !== "all" && <input type="hidden" name="status" value={query.status}/>}
      {"type" in query && query.type !== "all" && <input type="hidden" name="type" value={query.type}/>}
      {query.sort !== "desc" && <input type="hidden" name="sort" value={query.sort}/>}
      <label htmlFor={`${base}-page-number`}>Страница</label>
      <input key={page} id={`${base}-page-number`} type="number" name="page" min="1" max={pageCount} defaultValue={page} aria-label="Номер страницы"/>
      <button type="submit">Перейти</button>
    </form>}
  </div>;
}
