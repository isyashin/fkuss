import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(), findReservation: vi.fn(), getSiteSettings: vi.fn(), sendMail: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({
  order: { findUnique: mocks.findOrder }, reservation: { findUnique: mocks.findReservation },
}) }));
vi.mock("@/lib/site", () => ({ getSiteSettings: mocks.getSiteSettings }));
vi.mock("@/lib/mailer", () => ({ sendMail: mocks.sendMail }));

import { notifyNewBooking, notifyNewOrder } from "@/lib/notify";

describe("notification dispatch through configured email channel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSiteSettings.mockResolvedValue({ channels: {
      email: { enabled: true, address: "restaurant-test@example.invalid" },
      telegram: { enabled: false, chatId: "" }, max: { enabled: false, chatId: "" },
    } });
    mocks.sendMail.mockResolvedValue(undefined);
  });

  it("passes a cash order to the configured mail transport", async () => {
    mocks.findOrder.mockResolvedValue({
      number: 41, type: "pickup", status: "new", items: [{ name: "Тестовое блюдо", total: 300, quantity: 1, modifiers: [] }],
      itemsTotal: 300, deliveryPrice: 0, bonusSpent: 0, total: 300, paymentMethod: "cash",
      customerName: "Тест", customerPhone: "+70000000000", addressText: "", comment: "", desiredTime: "",
    });
    await notifyNewOrder("test-order");
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(mocks.sendMail).toHaveBeenCalledWith("restaurant-test@example.invalid", "Заказ №41", expect.stringContaining("Итого: 300 ₽"));
  });

  it("passes a booking to the configured mail transport", async () => {
    mocks.findReservation.mockResolvedValue({
      date: "2026-10-02", time: "18:00", guests: 2, customerName: "Тест", customerPhone: "+70000000000", comment: "",
    });
    await notifyNewBooking("test-booking");
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(mocks.sendMail).toHaveBeenCalledWith("restaurant-test@example.invalid", "Бронь 2026-10-02 18:00", expect.stringContaining("Гостей: 2"));
  });
});
