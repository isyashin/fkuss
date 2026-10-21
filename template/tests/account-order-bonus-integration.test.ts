import { afterAll, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getRecordedOrderBonuses } from "@/lib/account-order-bonus";

// Только одноразовая БД: собственные клиенты/заказы удаляются в finally.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
afterAll(async () => { await prisma.$disconnect(); });
it("начисление учитывает сторно, исключает списания/возвраты и чужие записи", async () => {
  const customers: string[] = [], orders: string[] = [];
  try {
    for (let i=0;i<2;i++) customers.push((await prisma.customer.create({data:{email:`account-summary-${crypto.randomUUID()}@example.test`}})).id);
    for (const customerId of [customers[0],customers[0],customers[1]]) orders.push((await prisma.order.create({data:{customerId,type:"pickup",status:"ready",itemsTotal:1000,total:1000,bonusAccrued:50,customerName:"Тест",customerPhone:"+7000"}})).id);
    await prisma.bonusTransaction.createMany({data:[
      {customerId:customers[0],orderId:orders[0],type:"accrual",amount:41},
      {customerId:customers[0],orderId:orders[0],type:"reversal",amount:-10},
      {customerId:customers[0],orderId:orders[0],type:"spend",amount:-20},
      {customerId:customers[0],orderId:orders[0],type:"refund",amount:20},
      {customerId:customers[0],orderId:orders[1],type:"accrual",amount:10},
      {customerId:customers[0],orderId:orders[1],type:"reversal",amount:-10},
      {customerId:customers[1],orderId:orders[2],type:"accrual",amount:999},
      {customerId:customers[1],orderId:orders[0],type:"accrual",amount:777},
    ]});
    expect(await getRecordedOrderBonuses(prisma,customers[0],orders)).toEqual(new Map([[orders[0],31],[orders[1],0]]));
    expect(await getRecordedOrderBonuses(prisma,customers[0],[])).toEqual(new Map());
    expect(await prisma.bonusTransaction.count({where:{customerId:{in:customers}}})).toBe(8);
  } finally {
    await prisma.bonusTransaction.deleteMany({where:{customerId:{in:customers}}});
    await prisma.order.deleteMany({where:{id:{in:orders}}});await prisma.customer.deleteMany({where:{id:{in:customers}}});
  }
});
