import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// seed replaces content tables: never run it against the shared test database.
// This fixture owns one newly created database and removes only that database.
describe.skipIf(!process.env.DATABASE_URL)("seed with multiple menus", () => {
  const database = `seed_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  let db: Client | undefined;
  let created = false;
  let work: string | undefined;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${database}`;
    work = await mkdtemp(path.join(tmpdir(), "fkuss-seed-"));
    const content = path.join(work, "content");
    await cp(path.resolve("content"), content, { recursive: true });
    env = { ...process.env, DATABASE_URL: url.href, CONTENT_DIR: content, SEED_TWO_MENUS: "1", SEED_OPEN_ALL_DAY: "1" };
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, stdio: "pipe" });
    db = new Client({ connectionString: url.href });
    await db.connect();
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE "${database}"`);
    await admin.end();
    if (work) await rm(work, { recursive: true, force: true });
  });

  it("can reseed menu groups without losing historical order amounts or snapshots", async () => {
    const menuPath = path.join(env.CONTENT_DIR!, "menu.json");
    const menu = JSON.parse(await readFile(menuPath, "utf8"));
    menu.menus = [...(menu.menus ?? []), { id: "seed-stale", name: "Removed source menu" }];
    await writeFile(menuPath, JSON.stringify(menu));
    const seed = () => execFileSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], { env, stdio: "pipe" });
    seed();
    await db!.query(`INSERT INTO "Order" (id,type,"itemsTotal",total,"customerName","customerPhone","updatedAt")
      VALUES ('seed-history','pickup',12300,12300,'Seed history','+79990001122',NOW())`);
    await db!.query(`INSERT INTO "OrderItem" (id,"orderId","dishId",name,price,quantity,total)
      VALUES ('seed-item','seed-history','removed-source-dish','Historical dish',12300,1,12300)`);
    const before = (await db!.query(`SELECT row_to_json(o) AS snapshot FROM "Order" o WHERE id='seed-history'`)).rows;
    const beforeItems = (await db!.query(`SELECT * FROM "OrderItem" WHERE "orderId"='seed-history'`)).rows;
    menu.menus = menu.menus.filter((group: { id: string }) => group.id !== "seed-stale");
    await writeFile(menuPath, JSON.stringify(menu));

    seed();

    expect((await db!.query(`SELECT id FROM "MenuGroup" WHERE id='menu-2'`)).rowCount).toBe(1);
    expect((await db!.query(`SELECT id FROM "MenuGroup" WHERE id='seed-stale'`)).rowCount).toBe(0);
    expect((await db!.query(`SELECT row_to_json(o) AS snapshot FROM "Order" o WHERE id='seed-history'`)).rows).toEqual(before);
    expect((await db!.query(`SELECT * FROM "OrderItem" WHERE "orderId"='seed-history'`)).rows).toEqual(beforeItems);
  }, 60_000);
});
