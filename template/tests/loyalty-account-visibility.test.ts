import {beforeEach,it,expect,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
const m=vi.hoisted(()=>({balance:vi.fn(),transactions:vi.fn(),groupBy:vi.fn()}));
vi.mock("@/lib/loyalty",()=>({getBonusBalance:m.balance}));
vi.mock("@/lib/db",()=>({getPrisma:()=>({order:{count:async()=>1,findMany:async()=>[{id:"owned",number:1,type:"pickup",status:"issued",createdAt:new Date("2026-10-21T10:00:00Z"),bonusAccrued:10,total:200,items:[]}]},reservation:{findMany:async()=>[]},address:{findMany:async()=>[]},bonusTransaction:{findMany:m.transactions,groupBy:m.groupBy}})}));
vi.mock("@/components/account/logout-button",()=>({LogoutButton:()=>null}));
vi.mock("@/components/account/cancel-booking-button",()=>({CancelBookingButton:()=>null}));
vi.mock("@/components/account/address-section",()=>({AddressSection:()=>null}));
vi.mock("@/components/account/repeat-order-button",()=>({RepeatOrderButton:()=>null}));
vi.mock("@/components/account/cancel-order-button",()=>({CancelOrderButton:()=>null}));
vi.mock("@/components/account/profile-form",()=>({ProfileForm:()=>null}));
import {AccountDashboard} from "@/components/account/dashboard";
const customer={id:"guest",email:"guest@example.test",name:"Гость",phone:""} as never;
beforeEach(()=>{vi.clearAllMocks();m.balance.mockResolvedValue(7);m.transactions.mockResolvedValue([]);m.groupBy.mockResolvedValue([{orderId:"owned",_sum:{amount:7}}]);});
it.each([undefined,false])("выключено: остаются профиль и история без блока бонусов и запросов журнала",async loyaltyEnabled=>{
 const html=renderToStaticMarkup(await AccountDashboard({customer,ordersPage:1,loyaltyEnabled}));
 expect(html).toContain("Профиль");expect(html).toContain("История заказов");expect(html).not.toMatch(/бонус|кэшбэк|начислен/i);
 expect(m.balance).not.toHaveBeenCalled();expect(m.transactions).not.toHaveBeenCalled();expect(m.groupBy).not.toHaveBeenCalled();
});
it("включено: существующий баланс и начисления снова видны",async()=>{
 const html=renderToStaticMarkup(await AccountDashboard({customer,ordersPage:1,loyaltyEnabled:true}));
 expect(html).toContain('data-testid="bonus-balance"');expect(html).toContain("Начислено бонусов: +7");expect(m.balance).toHaveBeenCalledWith(expect.anything(),"guest");
});
