import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(), customer: vi.fn(), order: vi.fn(), groupBy: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSessionCustomer: mocks.customer }));
vi.mock("@/lib/site", () => ({ getSiteSettings: mocks.settings }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({
  order: { findUnique: mocks.order }, bonusTransaction: { groupBy: mocks.groupBy },
}) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/components/account/repeat-order-button", () => ({ RepeatOrderButton: () => null }));
vi.mock("@/components/account/cancel-order-button", () => ({ CancelOrderButton: () => null }));
import AccountOrderPage from "@/app/account/orders/[id]/page";

function fixture(patch: Record<string, unknown> = {}) {
  return {
    id: "owned-order", customerId: "guest-1", number: 17, createdAt: new Date("2026-10-21T10:00:00Z"),
    type: "pickup", status: "new", paymentMethod: "cash", paymentStatus: "none", customerName: "Гость", customerPhone: "+79990001122",
    itemsTotal: 1160, deliveryPrice: 0, bonusSpent: 0, bonusAccrued: 58, total: 1160,
    addressText: "", comment: "", desiredTime: "", items: [{ id: "item-1", name: "Хачапури", price: 490, quantity: 2, total: 1160, modifiers: [{ name: "Двойной сыр", price: 90 }] }],
    ...patch,
  };
}
async function render() { return renderToStaticMarkup(await AccountOrderPage({ params: Promise.resolve({ id: "owned-order" }) })); }

describe("сохранённые суммы и бонусы в деталях заказа гостя", () => {
  beforeEach(() => {
    vi.clearAllMocks();mocks.settings.mockResolvedValue({ guestCabinet: { enabled: true }, loyalty: { enabled: true } });
    mocks.customer.mockResolvedValue({ id: "guest-1" });mocks.order.mockResolvedValue(fixture());mocks.groupBy.mockResolvedValue([]);
  });
  it("показывает историческую сумму позиции с добавками и количеством, не базовую цену", async () => {
    const html = await render();
    expect(html).toMatch(/Хачапури ×2[\s\S]*Двойной сыр[\s\S]*<\/span><span>1[\s\u00a0\u202f]160 ₽<\/span>/);
    expect(html).not.toContain(">980 ₽</span>");
  });
  it.each(["new", "accepted", "cooking", "ready", "handed_to_courier"])("для %s отделяет будущие бонусы от начисленных", async status => {
    mocks.order.mockResolvedValue(fixture({ type: "delivery", status }));const html=await render();
    expect(html).toContain("Бонусы после выполнения");expect(html).not.toContain("Начислено бонусов");
  });
  it.each([["pickup", "issued"], ["delivery", "delivered"]])("для %s %s читает фактически начисленную сумму", async (type,status) => {
    mocks.order.mockResolvedValue(fixture({ type,status,bonusAccrued:58 }));
    mocks.groupBy.mockResolvedValue([{ orderId:"owned-order", _sum:{amount:41} }]);
    const html=await render();expect(html).toContain("Начислено бонусов");expect(html).toContain(">+41</span>");expect(html).not.toContain(">+58</span>");
  });
  it("не обещает будущие бонусы отменённого заказа", async () => {
    mocks.order.mockResolvedValue(fixture({status:"cancelled"}));const html=await render();
    expect(html).not.toContain("Бонусы после выполнения");expect(html).not.toContain("Начислено бонусов");
  });
  it("учитывает полное сторно, не показывает прежнее начисление", async () => {
    mocks.order.mockResolvedValue(fixture({status:"cancelled"}));mocks.groupBy.mockResolvedValue([{orderId:"owned-order",_sum:{amount:0}}]);
    const html=await render();expect(html).toContain("Начисление отменено");expect(html).not.toContain(">+58</span>");
  });
  it("не выдаёт расчёт за факт, если выполненный заказ не имеет начисления", async () => {
    mocks.order.mockResolvedValue(fixture({status:"issued"}));const html=await render();
    expect(html).toContain("Бонусы не начислены");expect(html).not.toContain("Начислено бонусов");
  });
  it.each([undefined, {enabled:false}])("при выключенной программе скрывает бонусы и сохраняет реальную скидку", async loyalty => {
    mocks.settings.mockResolvedValue({guestCabinet:{enabled:true},loyalty});
    mocks.order.mockResolvedValue(fixture({bonusSpent:100,total:1060}));
    const html=await render();expect(html).not.toMatch(/бонус|кэшбэк|начислен/i);
    expect(html).toContain("Скидка");expect(html).toMatch(/−100 ₽/);expect(html).toMatch(/1[\s\u00a0\u202f]060 ₽/);
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });
  it("не читает бонусы чужого заказа", async () => {
    mocks.order.mockResolvedValue(fixture({customerId:"other-guest"}));await expect(render()).rejects.toThrow("404");expect(mocks.groupBy).not.toHaveBeenCalled();
  });
  it("ограничивает чтение журналом текущего гостя, заказа и начисления/сторно", async () => {
    await render();expect(mocks.groupBy).toHaveBeenCalledWith({by:["orderId"],where:{customerId:"guest-1",orderId:{in:["owned-order"]},type:{in:["accrual","reversal"]}},_sum:{amount:true}});
  });
});
