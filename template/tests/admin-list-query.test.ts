import { describe, expect, it } from "vitest";
import {
  adminListHref,
  bookingListCounts,
  orderListCounts,
  pageWindow,
  parseBookingListQuery,
  parseOrderListQuery,
} from "@/lib/admin-list-query";

describe("admin list query", () => {
  it("rejects invalid filters and oversized or ambiguous page values", () => {
    expect(parseOrderListQuery({ status: "new", type: "pickup", sort: "asc", page: "3" })).toEqual({ status: "new", type: "pickup", sort: "asc", page: 3, mode: "current", q: "" });
    expect(parseOrderListQuery({ status: "paid", type: "unknown", sort: "random", page: "999999999999999999999" })).toEqual({ status: "all", type: "all", sort: "desc", page: 1, mode: "current", q: "" });
    expect(parseBookingListQuery({ mode: "history", q: "  Иван ", page: "-2" })).toEqual({ mode: "history", q: "Иван", sort: "desc", page: 1 });
    expect(parseBookingListQuery({})).toEqual({ mode: "upcoming", q: "", sort: "desc", page: 1 });
  });

  it("парсит поисковый запрос и убирает пробелы", () => {
    expect(parseOrderListQuery({ q: "  7999  " })).toMatchObject({ q: "7999" });
    expect(parseOrderListQuery({})).toMatchObject({ q: "" });
    expect(adminListHref("/admin", { status: "all", type: "all", sort: "desc", page: 1, mode: "current", q: "Иван" })).toBe("/admin?q=%D0%98%D0%B2%D0%B0%D0%BD");
  });

  it("clamps an out-of-range page to the last real page", () => {
    expect(pageWindow(0, 9)).toEqual({ page: 1, pageCount: 1, skip: 0 });
    expect(pageWindow(61, 999)).toEqual({ page: 3, pageCount: 3, skip: 50 });
  });

  it("counts every order in the database while respecting the other active filter", () => {
    const groups = [
      { status: "new", type: "delivery", _count: { _all: 34 } },
      { status: "new", type: "pickup", _count: { _all: 6 } },
      { status: "accepted", type: "delivery", _count: { _all: 20 } },
      { status: "issued", type: "pickup", _count: { _all: 4 } },
    ];
    const counts = orderListCounts(groups, "delivery", "new");
    expect(counts).toMatchObject({ total: 34, byStatus: { all: 54, new: 34, accepted: 20 }, byType: { all: 40, delivery: 34, pickup: 6 } });
    expect(orderListCounts(groups, "all", "all").total).toBe(64);
    expect(parseOrderListQuery({ status: "handed_to_courier", type: "delivery" }).status).toBe("handed_to_courier");
    expect(parseOrderListQuery({ status: "issued", type: "pickup" }).status).toBe("issued");
  });

  it("counts bookings by status for the queue tabs", () => {
    expect(bookingListCounts([{ status: "new", _count: { _all: 71 } }, { status: "confirmed", _count: { _all: 38 } }]))
      .toMatchObject({ new: 71, confirmed: 38 });
  });

  it("keeps filters and sort in page links without carrying a stale selection", () => {
    expect(adminListHref("/admin", { status: "new", type: "pickup", sort: "asc", page: 4, mode: "current", q: "" })).toBe("/admin?status=new&type=pickup&sort=asc&page=4");
    expect(adminListHref("/admin/bookings", { mode: "history", q: "Иван", sort: "desc", page: 2 })).toBe("/admin/bookings?mode=history&q=%D0%98%D0%B2%D0%B0%D0%BD&page=2");
    expect(adminListHref("/admin/bookings", { mode: "upcoming", q: "", sort: "desc", page: 1 })).toBe("/admin/bookings");
  });
});
