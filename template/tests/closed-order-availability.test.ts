import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import settingsJson from "../content/settings.json";
import { settingsSchema, type ContentSettings } from "@/lib/content-schema";
import type { DeliveryOptionRule } from "@/lib/delivery/slots";
import type { WeeklySchedule } from "@/lib/hours";
type Option = DeliveryOptionRule & { id: string };
type Restaurant = { workHours?: { days: string; from: string; to: string }[]; schedule?: WeeklySchedule };

const mock = vi.hoisted(() => ({ settings: {} as ContentSettings, restaurant: {} as Restaurant, options: [] as Option[] }));
vi.mock("@/lib/site", () => ({ getSiteSettings: async () => mock.settings, getSiteRestaurant: async () => mock.restaurant }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ deliveryOption: { findMany: async (args: { where?: { enabled?: boolean } }) => args?.where?.enabled ? mock.options.filter(o => o.enabled) : mock.options } }) }));
import { GET } from "@/app/api/delivery/slots/route";

const closed = "Сейчас ресторан закрыт. Доступного времени для заказа пока нет.";
const future = "Сейчас ресторан закрыт. Можно оформить предзаказ на доступное время.";
const option = (overrides: Partial<Option> = {}): Option => ({ id: "courier", name: "Курьер", mode: "scheduled", enabled: true, days: [0,1,2,3,4,5,6], hoursFrom: "10:00", hoursTo: "20:00", slotMinutes: 60, minAheadMinutes: 60, daysAhead: 1, price: 300, freeFrom: null, exceptions: [], ...overrides });
async function availability() { return (await GET()).json(); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T19:00:00Z")); // 22:00 Moscow
  mock.settings = settingsSchema.parse(structuredClone(settingsJson));
  mock.settings.timezone = "Europe/Moscow";
  mock.settings.delivery = { ...mock.settings.delivery, enabled: true, pickupEnabled: true, geo: { enabled: false, outside: "block", outsidePrice: 0 } };
  mock.settings.preOrder = { enabled: false, slots: [], daysAhead: 1, minAheadMinutes: 30 };
  mock.restaurant = { workHours: [{ days: "all", from: "10:00", to: "20:00" }] };
  mock.options = [];
});
afterEach(() => vi.useRealTimers());
describe("closed-restaurant order availability", () => {
  it("Fuji: does not promise preorder when it is disabled and ASAP is closed", async () => {
    mock.options = [option({ mode: "asap" })];
    const data = await availability();
    expect(data.asapAvailable).toBe(false); expect(data.preOrder.slots).toEqual([]);
    expect(data.closedMessage).toBe(closed);
  });
  it("enabled preorder without slots is not enough", async () => {
    mock.settings.preOrder.enabled = true;
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("expired slots with no future day do not count", async () => {
    mock.settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 0, minAheadMinutes: 30 };
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("allows a real future pickup slot while closed", async () => {
    mock.settings.delivery.enabled = false;
    mock.settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 1, minAheadMinutes: 30 };
    expect((await availability()).closedMessage).toBe(future);
  });
  it("allows preorder for delivery without configured options", async () => {
    mock.settings.delivery.pickupEnabled = false;
    mock.settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 1, minAheadMinutes: 30 };
    expect((await availability()).closedMessage).toBe(future);
  });
  it("does not apply generic preorder to ASAP delivery options when pickup is off", async () => {
    mock.settings.delivery.pickupEnabled = false;
    mock.settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 1, minAheadMinutes: 30 };
    mock.options = [option({ mode: "asap" })];
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("all disabled options still count as configured, just as in the order API", async () => {
    mock.settings.delivery.pickupEnabled = false;
    mock.settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 1, minAheadMinutes: 30 };
    mock.options = [option({ enabled: false })];
    const data = await availability();
    expect(data.hasConfiguredOptions).toBe(true); expect(data.options).toEqual([]);
    expect(data.closedMessage).toBe(closed);
  });
  it("accepts available scheduled delivery while closed without generic preorder", async () => {
    mock.settings.delivery.pickupEnabled = false; mock.options = [option()];
    const data = await availability();
    expect(data.options[0].windows.length).toBeGreaterThan(0);
    expect(data.closedMessage).toBe(future);
  });
  it.each([{ days: [] }, { exceptions: ["2026-10-24"] }, { daysAhead: 0 }, { enabled: false }])("does not promise unavailable scheduled delivery: %o", async (rule) => {
    mock.settings.delivery.pickupEnabled = false; mock.options = [option(rule)];
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("disabled delivery does not advertise its scheduled windows", async () => {
    mock.settings.delivery.enabled = false; mock.options = [option()];
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("disabled pickup and delivery do not advertise generic preorder", async () => {
    mock.settings.delivery.enabled = false; mock.settings.delivery.pickupEnabled = false;
    mock.settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 1, minAheadMinutes: 30 };
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("invalid geo configuration cannot promise a delivery preorder", async () => {
    mock.settings.delivery.pickupEnabled = false; mock.settings.delivery.geo.enabled = true; mock.settings.delivery.zones = [];
    mock.options = [option()];
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("open restaurant has no closed notice", async () => {
    vi.setSystemTime(new Date("2026-10-23T09:00:00Z"));
    const data = await availability();
    expect(data.asapAvailable).toBe(true); expect(data.closedMessage).toBeNull();
  });
  it("uses restaurant timezone rather than server timezone", async () => {
    mock.settings.timezone = "Asia/Vladivostok"; // Saturday 05:00, although Friday 19:00 UTC
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("respects special closed dates", async () => {
    vi.setSystemTime(new Date("2026-10-23T09:00:00Z"));
    mock.restaurant.schedule = { days: { fri: { open: true, from: "10:00", to: "20:00" } }, exceptions: [{ date: "2026-10-23", open: false, from: "10:00", to: "20:00" }] };
    expect((await availability()).closedMessage).toBe(closed);
  });
  it("does not show a closed notice during the previous night's shift", async () => {
    vi.setSystemTime(new Date("2026-10-23T21:30:00Z")); // Saturday 00:30 Moscow
    mock.restaurant = { workHours: [{ days: "all", from: "12:00", to: "02:00" }] };
    expect((await availability()).closedMessage).toBeNull();
  });
  it("availability response cannot be cached past closing time", async () => {
    expect((await GET()).headers.get("cache-control")).toMatch(/no-store/);
  });
});
