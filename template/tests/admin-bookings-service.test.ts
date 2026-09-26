import { describe, expect, it, vi } from "vitest";
import { applyAdminBookingStatus, loadUpcomingBookings } from "@/lib/admin-bookings-service";

describe("admin booking status", () => {
  it("confirms only a new booking with an atomic conditional update", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await applyAdminBookingStatus({ reservation: { updateMany } } as never, "booking-1", "confirmed");
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "booking-1", status: "new" }, data: { status: "confirmed" } });
  });

  it("rejects a stale decision rather than changing a processed booking", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(applyAdminBookingStatus({ reservation: { updateMany } } as never, "booking-1", "rejected"))
      .rejects.toThrow("Бронь уже изменена");
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "booking-1", status: "new" }, data: { status: "rejected" } });
  });

  it("loads upcoming new and confirmed bookings in restaurant local time", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await loadUpcomingBookings({ reservation: { findMany } } as never, "Europe/Moscow", new Date("2026-09-24T22:30:00.000Z"));
    expect(findMany).toHaveBeenCalledWith({
      where: { status: { in: ["new", "confirmed"] }, date: { gte: "2026-09-25" } },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      take: 10,
    });
  });
});
