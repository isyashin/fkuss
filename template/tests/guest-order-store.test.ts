import { beforeEach, describe, expect, it } from "vitest";
import { useGuestOrders } from "@/lib/order/guest-order-store";
import type { GuestOrderSummary } from "@/lib/order/guest-order-state";
const finished:GuestOrderSummary={id:"one",number:1,type:"pickup",status:"issued",paymentStatus:"paid",paymentMethod:"online",total:500,createdAt:"2026-10-21T00:00:00Z",updatedAt:"2026-10-21T01:00:00Z",requestKey:null};
beforeEach(()=>useGuestOrders.getState().reset());
describe("terminal acknowledgement",()=>{
  it("a cached terminal status cannot clear itself before server verification",()=>{
    useGuestOrders.setState({orders:[finished]});
    useGuestOrders.getState().acknowledge("one");expect(useGuestOrders.getState().orders).toHaveLength(1);
    useGuestOrders.getState().receive([finished]);useGuestOrders.getState().acknowledge("one");expect(useGuestOrders.getState().orders).toHaveLength(0);
    useGuestOrders.getState().receive([finished]);expect(useGuestOrders.getState().orders).toHaveLength(0);
  });
  it("never acknowledges a ready or paid order",()=>{
    useGuestOrders.getState().receive([{...finished,status:"ready"}]);
    useGuestOrders.getState().acknowledge("one");expect(useGuestOrders.getState().orders).toHaveLength(1);
  });
});
