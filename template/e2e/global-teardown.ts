import { Pool } from "pg";

/** Removes only records and assets created by the E2E fixtures. */
export default async function globalTeardown() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    try {
      const phones = ["+79990000003", "+79990000004", "+79990001133", "+79990001144"];
      await client.query("BEGIN");
      const customers = await client.query<{ id: string }>(
        `SELECT id FROM "Customer" WHERE email LIKE 'e2e-%'`,
      );
      const customerIds = customers.rows.map((customer) => customer.id);
      const orders = await client.query<{ id: string }>(
        `SELECT id FROM "Order"
         WHERE "customerPhone" = ANY($1::text[])
            OR "customerId" = ANY($2::text[])`,
        [phones, customerIds],
      );
      const orderIds = orders.rows.map((order) => order.id);
      if (orderIds.length) {
        await client.query(`DELETE FROM "BonusTransaction" WHERE "orderId" = ANY($1::text[])`, [orderIds]);
        await client.query(`DELETE FROM "OrderItem" WHERE "orderId" = ANY($1::text[])`, [orderIds]);
        await client.query(`DELETE FROM "Order" WHERE id = ANY($1::text[])`, [orderIds]);
      }
      await client.query(
        `DELETE FROM "Reservation"
         WHERE "customerPhone" = ANY($1::text[])
            OR "customerId" = ANY($2::text[])`,
        [phones, customerIds],
      );
      if (customerIds.length) {
        await client.query(`DELETE FROM "BonusTransaction" WHERE "customerId" = ANY($1::text[])`, [customerIds]);
        await client.query(`DELETE FROM "Session" WHERE "customerId" = ANY($1::text[])`, [customerIds]);
        await client.query(`DELETE FROM "Address" WHERE "customerId" = ANY($1::text[])`, [customerIds]);
      }
      await client.query(
        `DELETE FROM "AuthCode" WHERE email LIKE 'e2e-%' OR "customerId" = ANY($1::text[])`,
        [customerIds],
      );
      if (customerIds.length) {
        await client.query(`DELETE FROM "Customer" WHERE id = ANY($1::text[])`, [customerIds]);
      }
      await client.query(
        `DELETE FROM "DeliveryOption" WHERE name LIKE 'Курьер по времени %' OR name LIKE 'Экспресс 24/7 %'`,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}
