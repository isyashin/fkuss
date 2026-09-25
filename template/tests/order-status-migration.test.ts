import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/0004_order_status_flow/migration.sql"), "utf8")
  .replace(/^\s*BEGIN;\s*/i, "")
  .replace(/\s*COMMIT;\s*$/i, "");

describe("historical order status migration on a temporary PostgreSQL table", () => {
  it("maps old states by order type and rejects incompatible future states", async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL! });
    await db.connect();
    try {
      await db.query("BEGIN");
      await db.query('CREATE TEMP TABLE "Order" ("id" TEXT PRIMARY KEY, "type" TEXT NOT NULL, "status" TEXT NOT NULL) ON COMMIT DROP');
      await db.query(`INSERT INTO "Order" ("id", "type", "status") VALUES
        ('d-delivering','delivery','delivering'), ('d-done','delivery','done'),
        ('p-delivering','pickup','delivering'), ('p-done','pickup','done'),
        ('d-ready','delivery','ready'), ('p-new','pickup','new'), ('p-cancelled','pickup','cancelled')`);
      await db.query(migration);
      const result = await db.query<{ id: string; status: string }>('SELECT "id", "status" FROM "Order" ORDER BY "id"');
      expect(Object.fromEntries(result.rows.map((row) => [row.id, row.status]))).toEqual({
        "d-delivering": "handed_to_courier", "d-done": "delivered", "d-ready": "ready",
        "p-delivering": "ready", "p-done": "issued", "p-new": "new", "p-cancelled": "cancelled",
      });
      await expect(db.query('INSERT INTO "Order" ("id", "type", "status") VALUES ($1,$2,$3)', ["invalid", "pickup", "delivered"])).rejects.toThrow();
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
