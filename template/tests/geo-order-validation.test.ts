import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentSettings } from "@/lib/content-schema";
import type { DeliveryOption } from "@/generated/prisma/client";
import sourceSettings from "../content/settings.json";

const state = vi.hoisted(() => ({
  settings: null as unknown as ContentSettings,
  options: [] as DeliveryOption[],
  point: { lat: 59.936846, lng: 30.312185, formatted: "Санкт-Петербург, Невский проспект, 1", kind: "house", precision: "exact" },
  geocode: vi.fn(), create: vi.fn(), event: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({
  dish: { findMany: async () => [{ id: "dish", name: "Блюдо", price: 5000, modifiers: [], modifierGroups: [], category: { menuId: null } }] },
  menuGroup: { findMany: async () => [] },
  deliveryOption: { findMany: async () => state.options },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ order: { create: state.create } }),
}) }));
vi.mock("@/lib/site", () => ({ getSiteSettings: async () => state.settings,
  getSiteRestaurant: async () => ({ schedule: { days: Object.fromEntries(["mon","tue","wed","thu","fri","sat","sun"].map(d => [d,{open:true,from:"00:00",to:"00:00"}])), exceptions: [] } }),
}));
vi.mock("@/lib/delivery/geocoder", () => ({ geocodeAddress: (...args: unknown[]) => state.geocode(...args) }));
vi.mock("@/lib/auth", () => ({ getSessionCustomer: async () => null }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => true }));
vi.mock("@/lib/admin-events", () => ({ recordAdminEvent: (...args: unknown[]) => state.event(...args) }));
vi.mock("@/lib/order-confirmation", () => ({ attachOrderConfirmation: (r: Response) => r }));
vi.mock("@/lib/notify", () => ({ notifyNewOrder: async () => {} }));
vi.mock("@/lib/admin-push", () => ({ schedulePushAttempt: () => {} }));
vi.mock("@/lib/metrics-report", () => ({ runMetricsReport: async () => {} }));

import { POST } from "@/app/api/order/route";
import { GET } from "@/app/api/delivery/zone/route";
import { validateSettingsMutation } from "@/lib/admin-settings-validation";

const polygon: [number, number][] = [[55.6,37.3],[55.9,37.3],[55.9,37.9],[55.6,37.9]];
const option = { id: "courier", name: "Курьер", mode: "asap", enabled: true, days:[0,1,2,3,4,5,6], hoursFrom:"00:00",hoursTo:"23:59",slotMinutes:60,minAheadMinutes:0,daysAhead:1,price:250,freeFrom:null,exceptions:[],position:0 } satisfies DeliveryOption;
async function order(patch: Record<string,unknown> = {}) {
  return POST(new Request("http://localhost/api/order", { method:"POST",headers:{"Content-Type":"application/json"}, body:JSON.stringify({
    items:[{dishId:"dish",quantity:1}],type:"delivery",zoneName:"Город",address:"Санкт-Петербург, Невский проспект, 1",
    customerName:"QA",customerPhone:"+79990000001",preferredChannel:"phone",deliveryOptionId:state.options.length?"courier":null,...patch,
  }) }));
}

beforeEach(() => {
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
  state.settings=structuredClone(sourceSettings) as unknown as ContentSettings;
  state.settings.delivery={enabled:true,pickupEnabled:true,minOrder:0,geo:{enabled:true,outside:"block",outsidePrice:750},zones:[{name:"Город",enabled:true,tariffs:[{from:0,price:300}],deliveryMinutes:45,polygon}]};
  state.settings.guestCabinet={enabled:false,authMode:"email",smtpUrl:"",smtpFrom:""};
  state.options=[];state.point={lat:59.936846,lng:30.312185,formatted:"Санкт-Петербург, Невский проспект, 1",kind:"house",precision:"exact"};
  state.geocode.mockReset().mockImplementation(async()=>({ok:true,point:{...state.point}}));
  state.create.mockReset().mockImplementation(async({data})=>({id:"order",number:1,...data}));state.event.mockReset();
  vi.stubEnv("YANDEX_MAPS_API_KEY","");vi.stubEnv("YANDEX_GEOCODER_API_KEY","test-server-key");
});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});

describe("geo delivery must fail closed before creating an order",()=>{
  it.each(["server-only","no-keys","invalid-server-key"])("checks the address with an option and %s",async profile=>{
    state.options=[option];
    if(profile!=="server-only")state.geocode.mockResolvedValue({ok:false,error:{kind:profile==="no-keys"?"not-configured":"invalid-key"}});
    const r=await order();expect(r.status).toBe(profile==="server-only"?400:503);expect(state.geocode).toHaveBeenCalledOnce();expect(state.create).not.toHaveBeenCalled();expect(state.event).not.toHaveBeenCalled();
  });
  it.each(["empty","no-polygon","all-disabled"])("rejects an enabled but unusable configuration: %s",async kind=>{
    if(kind==="empty")state.settings.delivery.zones=[];
    if(kind==="no-polygon")delete state.settings.delivery.zones[0].polygon;
    if(kind==="all-disabled")state.settings.delivery.zones[0].enabled=false;
    const preview=await GET(new Request("http://localhost/api/delivery/zone?address=Москва"));
    expect(preview.status).toBe(503);expect(await preview.json()).toMatchObject({kind:"configuration-error"});
    const r=await order();expect(r.status).toBe(503);expect(state.create).not.toHaveBeenCalled();
    expect(()=>validateSettingsMutation(state.settings)).toThrow(/зон/i);
  });
  it.each([["locality","other"],["street","street"],["house","near"],["house","number"],["house","range"],["house",undefined],[undefined,undefined]])("rejects a non-exact house (%s / %s)",async(kind,precision)=>{
    state.geocode.mockResolvedValue({ok:true,point:{lat:55.75,lng:37.62,formatted:"Москва",kind,precision}});
    const r=await order({address:"Москва, Несуществующая улица, 98765"});expect(r.status).toBe(400);expect(await r.json()).toMatchObject({error:expect.stringMatching(/точный адрес/i)});expect(state.create).not.toHaveBeenCalled();
  });
  it("keeps an exact in-zone option price and records its checked zone",async()=>{
    state.options=[option];state.point={...state.point,lat:55.75,lng:37.62};
    const r=await order({address:"Москва, Тверская улица, 1",total:1,deliveryPrice:-1});expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({itemsTotal:5000,deliveryPrice:250,total:5250});
    expect(state.create.mock.calls[0][0].data.deliveryZoneName).toBe("Город");
  });
  it("keeps explicitly allowed outside delivery, once",async()=>{
    state.settings.delivery.geo.outside="allow";
    const r=await order();expect(r.status).toBe(200);expect(await r.json()).toMatchObject({itemsTotal:5000,deliveryPrice:750,total:5750});
  });
  it("does not apply geographic checks to pickup or an explicitly disabled mode",async()=>{
    expect((await order({type:"pickup",address:"",zoneName:null})).status).toBe(200);
    state.settings.delivery.geo.enabled=false;expect((await order()).status).toBe(200);expect(state.geocode).not.toHaveBeenCalled();
  });
});
