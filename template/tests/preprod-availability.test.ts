import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import settingsJson from "../content/settings.json";

const mock = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  restaurant: {} as Record<string, unknown>,
  create: vi.fn(async () => ({ id: "order-qa", number: 1 })),
  booking: vi.fn(async () => ({ id: "booking-qa", date: "2027-03-01", time: "13:00" })),
}));
vi.mock("@/lib/site", () => ({ getSiteSettings: async () => mock.settings, getSiteRestaurant: async () => mock.restaurant }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => true }));
vi.mock("@/lib/auth", () => ({ getSessionCustomer: async () => null }));
vi.mock("@/lib/admin-events", () => ({ recordAdminEvent: async () => {} }));
vi.mock("@/lib/notify", () => ({ notifyNewOrder: async () => {}, notifyNewBooking: async () => {} }));
vi.mock("@/lib/admin-push", () => ({ schedulePushAttempt: () => {} }));
vi.mock("@/lib/metrics-report", () => ({ runMetricsReport: async () => {} }));
vi.mock("@/lib/booking/capacity", () => ({ createReservationWithCapacity: mock.booking }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({
  dish: { findMany: async () => [{ id: "dish", name: "Блюдо", price: 200, modifiers: [], modifierGroups: [], category: null }] },
  menuGroup: { findMany: async () => [] }, deliveryOption: { findMany: async () => [] },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ order: { create: mock.create } }),
}) }));

import { POST as order } from "@/app/api/order/route";
import { POST as booking } from "@/app/api/booking/route";
import { GET as slots } from "@/app/api/booking/slots/route";

const payload = { items: [{ dishId: "dish", quantity: 1 }], type: "pickup", customerName: "QA", customerPhone: "+79990000001" };
const request = (body: unknown) => new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T10:00:00Z")); // понедельник, 13:00 МСК
  vi.clearAllMocks();
  mock.settings = structuredClone(settingsJson);
  mock.settings.delivery = { ...(mock.settings.delivery as object), pickupEnabled: true, enabled: true };
  mock.settings.preOrder = { enabled: true, slots: ["13:00"], daysAhead: 1, minAheadMinutes: 30 };
  mock.restaurant = { schedule: { days: { mon: { open: false, from: "00:00", to: "00:00" } }, exceptions: [] } };
});
afterEach(() => vi.useRealTimers());

describe("preproduction API boundaries", () => {
  it.each(["pickup", "delivery"])("rejects ASAP %s when the restaurant is closed without creating an order", async (type) => {
    const response = await order(request({ ...payload, type, address: "Адрес" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/закрыт/i);
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("still accepts an explicitly configured future preorder while closed", async () => {
    const response = await order(request({ ...payload, preOrderDate: "2026-10-20", preOrderTime: "13:00" }));
    expect(response.status).toBe(200);
    expect(mock.create).toHaveBeenCalledOnce();
  });
  it.each(["abcde", "12345", "+7999word000001"])("rejects invalid contact phone %s in both APIs before writing", async (customerPhone) => {
    mock.restaurant = { workHours: [{ days: "all", from: "00:00", to: "00:00" }] };
    expect((await order(request({ ...payload, customerPhone }))).status).toBe(400);
    expect((await booking(request({ date: "2027-03-01", time: "13:00", guests: 2, customerName: "QA", customerPhone }))).status).toBe(400);
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.booking).not.toHaveBeenCalled();
  });
  it.each(["2027-02-30", "2027-04-31", "2027-00-10"])("rejects impossible calendar date %s for booking and slots", async (date) => {
    mock.restaurant = { workHours: [{ days: "all", from: "00:00", to: "00:00" }] };
    expect((await booking(request({ date, time: "13:00", guests: 2, customerName: "QA", customerPhone: payload.customerPhone }))).status).toBe(400);
    expect((await slots(new Request(`http://localhost/api/booking/slots?date=${date}`))).status).toBe(400);
    expect(mock.booking).not.toHaveBeenCalled();
  });
});
