/** Тестовый сид платформы: тариф + сайт buxara + владелец. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const tariff = await prisma.tariff.upsert({
    where: { id: "standard" },
    create: { id: "standard", name: "Стандарт", monthlyPrice: 3000 },
    update: {},
  });

  await prisma.site.upsert({
    where: { slug: "buxara" },
    create: {
      slug: "buxara",
      name: "Чайхана Бухара",
      port: 3001,
      domains: [],
      siteKey: "buxara-test-key",
      tariffId: tariff.id,
    },
    update: { tariffId: tariff.id },
  });

  for (const email of [
    "owner@buxara.test",
    "owner-mobile@buxara.test",
    "owner-desktop@buxara.test",
  ]) {
    await prisma.ownerAccount.upsert({
      where: { email },
      create: { email, siteId: "buxara" },
      update: { siteId: "buxara" },
    });
  }

  console.log("✓ Сид платформы: тариф 3000 ₽/мес, сайт buxara, владелец owner@buxara.test");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
