import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  for (const email of ["owner-mobile@buxara.test", "owner-desktop@buxara.test"]) {
    await prisma.ownerAccount.upsert({ where: { email }, create: { email, siteId: "buxara" }, update: {} });
  }
  console.log("owners ok");
  await prisma.$disconnect();
})();
