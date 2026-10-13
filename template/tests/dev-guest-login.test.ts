import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { issueGuestSession } from "@/lib/auth";
import { POST } from "@/app/api/auth/dev-login/route";

// Unit-часть (флаг выключен) не трогает БД; интеграционная — одноразовая PostgreSQL.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const sessionIds: string[] = [];
const customerEmails: string[] = [];

afterAll(async () => {
  await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.customer.deleteMany({ where: { email: { in: customerEmails } } });
  await prisma.$disconnect();
});

describe("dev guest login (DEV_GUEST_LOGIN)", () => {
  it("returns 404 when the flag is off", async () => {    const saved = process.env.DEV_GUEST_LOGIN;
    delete process.env.DEV_GUEST_LOGIN;
    try {
      const response = await POST(new Request("http://localhost/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com" }),
      }));
      expect(response.status).toBe(404);
    } finally {
      if (saved !== undefined) process.env.DEV_GUEST_LOGIN = saved;
    }
  });

  it("issues a 30-day session and registers the customer", async () => {
    const email = `dev-login-${crypto.randomUUID()}@example.com`;
    customerEmails.push(email);

    const before = Date.now();
    const sessionId = await issueGuestSession(prisma, email);
    sessionIds.push(sessionId);

    const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { customer: true } });
    expect(session?.customer.email).toBe(email);
    expect(session!.expiresAt.getTime()).toBeGreaterThan(before + 29 * 24 * 3600 * 1000);

    // Повторный вход той же почты — тот же гость, новая сессия.
    const secondId = await issueGuestSession(prisma, email);
    sessionIds.push(secondId);
    const second = await prisma.session.findUnique({ where: { id: secondId }, include: { customer: true } });
    expect(second?.customer.email).toBe(email);
    expect(await prisma.customer.count({ where: { email } })).toBe(1);
  });
});

// Issue #49: на проде DEV_GUEST_LOGIN=1 без SITE_ENV=dev больше не открывает вход.
describe("dev-login prod gate (issue #49)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function postDevLogin() {
    return POST(new Request("http://localhost/api/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com" }),
    }));
  }

  it("returns 404 on production even with DEV_GUEST_LOGIN=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_GUEST_LOGIN", "1");
    vi.stubEnv("SITE_ENV", "");
    expect((await postDevLogin()).status).toBe(404);
  });

  it("passes the gate on a dev stand (SITE_ENV=dev, NODE_ENV=production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_GUEST_LOGIN", "1");
    vi.stubEnv("SITE_ENV", "dev");
    // Дальше — проверка кабинета/БД (403/200), но не отсечка 404.
    expect((await postDevLogin()).status).not.toBe(404);
  });
});
