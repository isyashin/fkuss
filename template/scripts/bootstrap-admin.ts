import { getPrisma } from "../src/lib/db";
import { bootstrapAdminOwner } from "../src/lib/admin-users";

const login = process.env.ADMIN_BOOTSTRAP_LOGIN;
const name = process.env.ADMIN_BOOTSTRAP_NAME;
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
if (!login || !name || !password) {
  process.stderr.write("Нужны ADMIN_BOOTSTRAP_LOGIN, ADMIN_BOOTSTRAP_NAME и ADMIN_BOOTSTRAP_PASSWORD.\n");
  process.exit(1);
}

async function main() {
  const prisma = getPrisma();
  try {
    await bootstrapAdminOwner(prisma, { login: login!, name: name!, password: password! });
    process.stdout.write("Первый владелец админки создан.\n");
  } catch {
    process.stderr.write("Не удалось создать первого владельца; проверьте миграцию, права и отсутствие учётных записей.\n");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
