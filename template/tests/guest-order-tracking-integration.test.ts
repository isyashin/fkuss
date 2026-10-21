import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import settingsSource from "../content/settings.json";
import { settingsSchema } from "@/lib/content-schema";

const state = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, customer: null as { id: string } | null, settings: null as ReturnType<typeof settingsSchema.parse> | null, failEvent: false, paymentFails: false, providerUnavailable: false, payments: 0, notifications: 0 }));
vi.mock("@/lib/db", () => ({ getPrisma: () => state.prisma }));
vi.mock("@/lib/site", () => ({ getSiteSettings: async () => state.settings,
  getSiteRestaurant: async () => ({ schedule: { days: Object.fromEntries(["mon","tue","wed","thu","fri","sat","sun"].map(d=>[d,{open:true,from:"00:00",to:"00:00"}])), exceptions: [] } }) }));
vi.mock("@/lib/auth", () => ({ getSessionCustomer: async () => state.customer }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => true }));
vi.mock("@/lib/notify", () => ({ notifyNewOrder: async () => { state.notifications++; } }));
vi.mock("@/lib/admin-push", () => ({ schedulePushAttempt: () => {} }));
vi.mock("@/lib/metrics-report", () => ({ runMetricsReport: async () => {} }));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: () => { if(state.providerUnavailable)throw new Error("not configured");return { createPayment: async ({ orderId }: { orderId: string }) => { state.payments++; if(state.paymentFails) throw new Error("provider offline"); return { paymentId: `test-${orderId}`, confirmationUrl: "https://pay.example.test/checkout" }; } }; } }));
vi.mock("@/lib/admin-events", () => ({ recordAdminEvent: async (tx: PrismaClient, kind: string, reference: string, label: string) => { if(state.failEvent) throw new Error("forced rollback"); await tx.adminEvent.create({ data: { kind, reference, label } }); } }));

import { POST } from "@/app/api/order/route";
import { POST as session } from "@/app/api/order/session/route";
import { GET as active } from "@/app/api/order/active/route";
import { GET as detail } from "@/app/api/order/active/[id]/route";
import { GUEST_ORDER_COOKIE } from "@/lib/auth-cookie-names";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const prefix = "tracking-" + randomUUID();
let cookie = "", foreignCookie = "", customerId = "";
const ids: string[] = [], sessions: string[] = [];
const payload = (patch = {}) => ({ items: [{ dishId: prefix, quantity: 1 }], type: "pickup", customerName: prefix, customerPhone: "+79990000009", preferredChannel: "phone", ...patch });
const request = (path: string, init: RequestInit = {}, proof = cookie) => new Request("https://shop.example.test"+path, { ...init, headers: { Cookie: proof, Origin: "https://shop.example.test", "Content-Type": "application/json", ...init.headers } });
async function submit(key: string, patch = {}, proof = cookie) { const r = await POST(request("/api/order", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(payload(patch)) }, proof)); const data = await r.json(); if(data.order?.id) ids.push(data.order.id); return { r, data }; }
beforeAll(async () => {
  state.prisma = prisma;
  state.settings = settingsSchema.parse(settingsSource);
  state.settings.delivery.pickupEnabled = true; state.settings.delivery.minOrder = 0;
  state.settings.guestCabinet.enabled = true;
  state.settings.loyalty.enabled = true;
  state.settings.loyalty.maxSpendPercent = 20;
  state.settings.payment.provider = "mock";
  await prisma.category.create({ data: { id: prefix, name: prefix } });
  await prisma.dish.create({ data: { id: prefix, categoryId: prefix, name: "Суп", price: 1000, tags: [] } });
  const c = await prisma.customer.create({ data: { email: prefix+"@example.test" } }); customerId = c.id;
  await prisma.bonusTransaction.create({ data: { customerId, type: "accrual", amount: 5000 } });
  for(let i=0;i<2;i++) {
    const r = await session(request("/api/order/session", { method: "POST" }, ""));
    const value = r.headers.get("set-cookie")!.split(";")[0]; sessions.push(value);
    expect(value.startsWith(GUEST_ORDER_COOKIE+"=")).toBe(true);
    expect(r.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(r.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(r.headers.get("set-cookie")).toMatch(/Path=\//i);
  }
  [cookie, foreignCookie] = sessions;
});
afterAll(async () => {
  await prisma.adminEvent.deleteMany({ where: { reference: { in: ids } } });
  await prisma.bonusTransaction.deleteMany({ where: { customerId } });
  await prisma.orderItem.deleteMany({ where: { order: { customerName: prefix } } });
  await prisma.order.deleteMany({ where: { customerName: prefix } });
  const { createHash } = await import("node:crypto");
  await prisma.guestOrderSession.deleteMany({ where: { id: { in: sessions.map(s => createHash("sha256").update(s.split("=")[1]).digest("hex")) } } });
  await prisma.dish.delete({ where: { id: prefix } }); await prisma.category.delete({ where: { id: prefix } });
  if(customerId) await prisma.customer.delete({ where: { id: customerId } }); await prisma.$disconnect();
});
describe("anonymous order tracking and idempotent checkout on PostgreSQL", () => {
  it("rejects cross-origin session creation and an order key without its cookie", async () => {
    const r = await session(new Request("https://shop.example.test/api/order/session", { method: "POST", headers: { Origin: "https://other.example.test" } }));
    expect(r.status).toBe(403);
    expect((await submit(randomUUID(), {}, "")).r.status).toBe(409);
  });
  it("five simultaneous retries create one order, one bonus spend and one event", async () => {
    state.customer = { id: customerId }; state.notifications = 0;
    expect(state.settings!.loyalty.enabled).toBe(true);
    expect(state.settings!.guestCabinet.enabled).toBe(true);
    expect(await prisma.bonusTransaction.aggregate({where:{customerId},_sum:{amount:true}})).toMatchObject({_sum:{amount:5000}});
    const key = randomUUID();
    const responses = await Promise.all(Array.from({length:5},()=>submit(key,{ bonusSpend:100 })));
    expect(responses.every(x=>x.r.ok)).toBe(true);
    expect(new Set(responses.map(x=>x.data.order.id)).size).toBe(1);
    const id = responses[0].data.order.id;
    expect(await prisma.order.findUnique({where:{id}})).toMatchObject({customerId,bonusSpent:100,bonusAccrued:45,total:900});
    expect(await prisma.bonusTransaction.count({ where: { orderId:id,type:"spend" } })).toBe(1);
    expect(await prisma.adminEvent.count({ where: { reference:id } })).toBe(1);
    expect(state.notifications).toBe(1);
    await prisma.dish.update({where:{id:prefix},data:{available:false,price:9999}});
    expect((await submit(key,{bonusSpend:100})).data.order.total).toBe(900);
    expect((await submit(key,{bonusSpend:50})).r.status).toBe(409);
    await prisma.dish.update({where:{id:prefix},data:{available:true,price:1000}});
    state.customer = null;
  });
  it("keeps historical items and server totals private to the owning anonymous session", async () => {
    const {data} = await submit(randomUUID()); const id = data.order.id;
    const mine = await detail(request(`/api/order/active/${id}`), { params: Promise.resolve({id}) });
    expect(mine.status).toBe(200); expect(mine.headers.get("cache-control")).toContain("no-store");
    expect(await mine.json()).toMatchObject({ order: { id, items: [{ name:"Суп",total:1000 }] } });
    const other = await detail(request(`/api/order/active/${id}`,{},foreignCookie), { params:Promise.resolve({id}) });
    expect(other.status).toBe(404);
    expect((await detail(request(`/api/order/active/${id}`,{},""),{params:Promise.resolve({id})})).status).toBe(404);
    const list = await active(request("/api/order/active")); const json = await list.json();
    expect(list.headers.get("cache-control")).toContain("no-store");
    expect(json.orders.some((o:{id:string})=>o.id===id)).toBe(true);
    expect(JSON.stringify(json)).not.toContain("customerPhone"); expect(JSON.stringify(json)).not.toContain("addressText");
  });
  it("works with the guest cabinet disabled and restores terminal status for acknowledgement", async () => {
    state.settings!.guestCabinet.enabled=false;
    const {data}=await submit(randomUUID()); const id=data.order.id;
    await prisma.order.update({where:{id},data:{status:"issued"}});
    const list=await active(request("/api/order/active?known="+id));
    expect((await list.json()).orders.find((o:{id:string})=>o.id===id).status).toBe("issued");
    state.settings!.guestCabinet.enabled=true;
  });
  it("rolls back tracking, order, event and bonus together", async () => {
    state.customer={id:customerId}; state.failEvent=true;
    const before=await prisma.order.count({where:{customerName:prefix}}); const key=randomUUID();
    await expect(submit(key,{bonusSpend:100})).rejects.toThrow("forced rollback");
    expect(await prisma.order.count({where:{customerName:prefix}})).toBe(before);
    expect(await prisma.guestCheckout.count({where:{requestKey:key}})).toBe(0);
    state.failEvent=false;state.customer=null;
  });
  it("never creates a second payment on retry, even while the first payment is being created", async () => {
    state.payments=0;const key=randomUUID();
    const r=await Promise.all(Array.from({length:5},()=>submit(key,{paymentMethod:"online"})));
    expect(new Set(r.map(x=>x.data.order.id)).size).toBe(1);expect(state.payments).toBe(1);
    expect((await submit(key,{paymentMethod:"online"})).data.confirmationUrl).toBe("https://pay.example.test/checkout");
  });
  it("keeps a provider failure recoverable without duplicate refunds or duplicate orders",async()=>{
    state.payments=0;state.paymentFails=true;state.customer={id:customerId};const key=randomUUID();
    const first=await submit(key,{paymentMethod:"online",bonusSpend:100});
    expect(first.r.status).toBe(502);expect(first.data.order.paymentStatus).toBe("failed");
    const second=await submit(key,{paymentMethod:"online",bonusSpend:100});
    expect(second.data.order.id).toBe(first.data.order.id);expect(state.payments).toBe(1);
    expect(await prisma.bonusTransaction.count({where:{orderId:first.data.order.id,type:"refund"}})).toBe(1);
    state.paymentFails=false;state.customer=null;
  });
  it("never offers payment again after cancellation even if a payment URL already exists",async()=>{
    const key=randomUUID();const first=await submit(key,{paymentMethod:"online"});
    await prisma.order.update({where:{id:first.data.order.id},data:{status:"cancelled"}});
    const replay=await submit(key,{paymentMethod:"online"});expect(replay.data.confirmationUrl).toBeNull();
    const response=await detail(request(`/api/order/active/${first.data.order.id}`),{params:Promise.resolve({id:first.data.order.id})});
    expect((await response.json()).order.confirmationUrl).toBeNull();
  });
  it.each(["cash","online"])("выключение бонусов запрещает списание через API (%s)",async paymentMethod=>{
    state.settings!.loyalty.enabled=false;state.customer={id:customerId};
    try{const before=await prisma.bonusTransaction.count({where:{customerId}});const result=await submit(randomUUID(),{paymentMethod,bonusSpend:100});expect(result.r.status).toBe(400);expect(await prisma.bonusTransaction.count({where:{customerId}})).toBe(before);}
    finally{state.settings!.loyalty.enabled=true;state.customer=null;}
  });
  it.each(["cash","online"])("выключено: новый заказ без обещаний кэшбэка и без начисления (%s)",async paymentMethod=>{
    state.settings!.loyalty.enabled=false;state.customer={id:customerId};
    try{const result=await submit(randomUUID(),{paymentMethod});expect(result.r.ok).toBe(true);const order=await prisma.order.findUniqueOrThrow({where:{id:result.data.order.id}});expect(order.bonusSpent).toBe(0);expect(order.bonusAccrued).toBe(0);expect(order.total).toBe(1000);await prisma.order.update({where:{id:order.id},data:{status:"issued",paymentStatus:paymentMethod==="online"?"paid":"none"}});const {accrueOrderBonus}=await import("@/lib/loyalty");await accrueOrderBonus(prisma,order.id);expect(await prisma.bonusTransaction.count({where:{orderId:order.id}})).toBe(0);}
    finally{state.settings!.loyalty.enabled=true;state.customer=null;}
  });
  it("выключение сохраняет обещанный кэшбэк прежнего заказа и возврат прежнего списания",async()=>{
    state.customer={id:customerId};
    try{const result=await submit(randomUUID(),{bonusSpend:100});state.settings!.loyalty.enabled=false;const id=result.data.order.id;await prisma.order.update({where:{id},data:{status:"issued"}});const {accrueOrderBonus,reverseOrderBonus}=await import("@/lib/loyalty");await accrueOrderBonus(prisma,id);expect(await prisma.bonusTransaction.findFirst({where:{orderId:id,type:"accrual"}})).toMatchObject({amount:45});await reverseOrderBonus(prisma,id);await reverseOrderBonus(prisma,id);expect(await prisma.bonusTransaction.count({where:{orderId:id,type:"refund"}})).toBe(1);expect(await prisma.bonusTransaction.aggregate({where:{orderId:id},_sum:{amount:true}})).toMatchObject({_sum:{amount:0}});}
    finally{state.settings!.loyalty.enabled=true;state.customer=null;}
  });
  it("explicitly distinguishes a rejection before order creation from an uncertain transport failure",async()=>{
    state.providerUnavailable=true;
    try {
      const before=await prisma.order.count({where:{customerName:prefix}});
      const result=await submit(randomUUID(),{paymentMethod:"online"});
      expect(result.r.status).toBe(503);expect(result.data.createdOrder).toBe(false);
      expect(await prisma.order.count({where:{customerName:prefix}})).toBe(before);
    } finally {state.providerUnavailable=false;}
  });
});
