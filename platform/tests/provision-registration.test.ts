import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(!process.env.DATABASE_URL)("publication registration on PostgreSQL", () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().replaceAll("-", "");
  const tariffId = `provision-${suffix}`;
  const slugs: string[] = [];
  let work: string;

  beforeAll(async () => {
    await db.connect();
    await db.query(`INSERT INTO "Tariff" (id,name,"monthlyPrice") VALUES ($1,'QA publication',1000)`, [tariffId]);
    work = await mkdtemp(path.join(tmpdir(), "fkuss-registration-"));
  });
  afterAll(async () => {
    for (const slug of slugs) {
      await db.query(`DELETE FROM "BalanceTransaction" WHERE "siteId"=$1`, [slug]);
      await db.query(`DELETE FROM "OwnerAccount" WHERE "siteId"=$1`, [slug]);
      await db.query(`DELETE FROM "Site" WHERE slug=$1`, [slug]);
    }
    await db.query(`DELETE FROM "Tariff" WHERE id=$1`, [tariffId]);
    await db.end();
    if (work) await rm(work, { recursive: true, force: true });
  });

  async function statement(initialKopecks: number, tariff = tariffId) {
    const slug = `pub-${randomBytes(8).toString("hex")}`;
    slugs.push(slug);
    const metadata = { slug, name: "QA O'Name", domain: `${slug}.example.test`, ownerEmail: `${slug}@example.test`,
      tariffId: tariff, initialKopecks, publicationId: randomBytes(16).toString("hex") };
    const state = path.join(work, `${slug}.json`);
    const env = path.join(work, `${slug}.env`);
    await writeFile(state, JSON.stringify(metadata));
    await writeFile(env, `SITE_KEY=${randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
    // Test-only SQL capture with a throwaway key; the live CLI executes it via stdin.
    const sql = execFileSync(process.platform === "win32" ? "python" : "python3", ["-c",
      "import runpy,json,sys; m=runpy.run_path(sys.argv[1]); print(m['registration_sql'](json.load(open(sys.argv[2],encoding='utf8')),int(sys.argv[3]),m['site_key'](sys.argv[4])))",
      path.resolve("../scripts/provision-data.py"), state, "62001", env], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { slug, sql };
  }

  it("credits the explicitly reviewed amount once even when registration is retried", async () => {
    const { slug, sql } = await statement(12345);
    await db.query(sql);
    await db.query(sql);
    expect((await db.query(`SELECT sum(amount)::int AS balance,count(*)::int AS entries FROM "BalanceTransaction" WHERE "siteId"=$1`, [slug])).rows)
      .toEqual([{ balance: 12345, entries: 1 }]);
    expect((await db.query(`SELECT name FROM "Site" WHERE slug=$1`, [slug])).rows).toEqual([{ name: "QA O'Name" }]);
    expect((await db.query(`SELECT count(*)::int AS count FROM "OwnerAccount" WHERE "siteId"=$1`, [slug])).rows).toEqual([{ count: 1 }]);
  });

  it("does not invent a top-up when the reviewed initial credit is zero", async () => {
    const { slug, sql } = await statement(0);
    // Different port from the previous fixture.
    await db.query(sql.replaceAll("62001", "62002"));
    expect((await db.query(`SELECT count(*)::int AS count FROM "BalanceTransaction" WHERE "siteId"=$1`, [slug])).rows).toEqual([{ count: 0 }]);
  });

  it("rolls back the site and owner if registration fails", async () => {
    const { slug, sql } = await statement(12345, `missing-${suffix}`);
    await expect(db.query(sql.replaceAll("62001", "62003"))).rejects.toThrow();
    await db.query("ROLLBACK");
    expect((await db.query(`SELECT count(*)::int AS count FROM "Site" WHERE slug=$1`, [slug])).rows).toEqual([{ count: 0 }]);
    expect((await db.query(`SELECT count(*)::int AS count FROM "OwnerAccount" WHERE "siteId"=$1`, [slug])).rows).toEqual([{ count: 0 }]);
  });
});
