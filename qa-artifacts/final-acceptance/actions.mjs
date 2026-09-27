import { chromium } from "../../template/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const password = process.env.QA_ADMIN_PASSWORD;
if (!password) throw new Error("QA_ADMIN_PASSWORD is required");
const browser = await chromium.launch({ headless: true });
const output = dirname(fileURLToPath(import.meta.url));
const results = [];
const sites = [
  { name: "ochag", origin: "http://192.168.88.153:3003", dishId: "dish-424028201", dishPrice: 790 },
  { name: "buxara", origin: "http://192.168.88.153:3001", dishId: "dish-3006157662", dishPrice: 450 },
];
function check(ok, message) { if (!ok) throw new Error(message); }
async function post(context, url, data, suffix) {
  const response = await context.request.post(url, {
    data,
    headers: { "x-forwarded-for": `10.199.24.${suffix}` },
  });
  const body = await response.json();
  check(response.ok(), `${url} failed HTTP ${response.status()}: ${JSON.stringify(body)}`);
  return body;
}
async function login(page, origin) {
  await page.goto(`${origin}/admin/login`);
  await page.getByLabel("Логин").fill("owner");
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 12000 });
}
try {
  for (const [index, site] of sites.entries()) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = { site: site.name };
    try {
      const marker = `QA final ${site.name} ${Date.now()}`;
      const order = await post(context, `${site.origin}/api/order`, {
        items: [{ dishId: site.dishId, quantity: 1, modifierIds: [] }],
        type: "pickup", zoneName: null, address: "", customerName: marker,
        customerPhone: "+79990002410", preferredChannel: "phone",
        paymentMethod: "cash", website: "",
      }, 20 + index);
      check(order.ok && Number.isInteger(order.orderNumber), `${site.name}: no order number`);
      check(order.total === site.dishPrice, `${site.name}: server order price mismatch ${order.total}`);
      result.order = { number: order.orderNumber, total: order.total, created: true };

      let bookingDate, bookingTime;
      for (let offset = 7; offset < 21 && !bookingTime; offset++) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() + offset);
        const candidate = date.toISOString().slice(0, 10);
        const slotsResponse = await context.request.get(`${site.origin}/api/booking/slots?date=${candidate}`);
        const slotsBody = await slotsResponse.json();
        if (slotsResponse.ok() && slotsBody.slots?.length) {
          bookingDate = candidate;
          bookingTime = slotsBody.slots[Math.floor(slotsBody.slots.length / 2)];
        }
      }
      check(Boolean(bookingTime), `${site.name}: no future booking slots`);
      const booking = await post(context, `${site.origin}/api/booking`, {
        date: bookingDate, time: bookingTime, guests: 1,
        customerName: marker, customerPhone: "+79990002411", comment: "QA final acceptance", website: "",
      }, 30 + index);
      check(booking.ok && typeof booking.id === "string", `${site.name}: no booking id`);
      result.booking = { id: booking.id, date: bookingDate, time: bookingTime, created: true };

      await login(page, site.origin);
      const openOrder = page.getByRole("button", { name: `Открыть заказ № ${order.orderNumber}` });
      await openOrder.waitFor({ timeout: 12000 });
      await openOrder.click();
      const detail = page.getByRole("region", { name: "Детали заказа" });
      const status = detail.getByLabel("Статус заказа");
      await status.selectOption("accepted");
      await page.waitForTimeout(900);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: `Открыть заказ № ${order.orderNumber}` }).click();
      await detail.getByLabel("Статус заказа").waitFor();
      check(await detail.getByLabel("Статус заказа").inputValue() === "accepted", `${site.name}: order status not persisted`);
      result.order.acceptedPersisted = true;

      await page.goto(`${site.origin}/admin/bookings?selected=${encodeURIComponent(booking.id)}`, { waitUntil: "networkidle" });
      const bookingDetail = page.getByRole("region", { name: "Детали брони" });
      await bookingDetail.getByRole("button", { name: "Подтвердить бронь" }).click();
      await page.waitForTimeout(900);
      await page.reload({ waitUntil: "networkidle" });
      check(await bookingDetail.getByText("Подтверждена", { exact: true }).count() > 0, `${site.name}: booking status not persisted`);
      result.booking.confirmedPersisted = true;

      await page.goto(`${site.origin}/admin/menu`, { waitUntil: "networkidle" });
      const stopButton = page.getByRole("button", { name: /^Поставить на стоп:/ }).first();
      const stopName = await stopButton.getAttribute("aria-label");
      check(Boolean(stopName), `${site.name}: no available dish to toggle`);
      const dishName = stopName.slice("Поставить на стоп: ".length);
      await stopButton.click();
      await page.waitForTimeout(900);
      await page.reload({ waitUntil: "networkidle" });
      check(await page.getByRole("button", { name: `Снять со стопа: ${dishName}`, exact: true }).count() === 1, `${site.name}: stop-list not persisted`);
      await page.getByRole("button", { name: `Снять со стопа: ${dishName}`, exact: true }).click();
      await page.waitForTimeout(900);
      await page.reload({ waitUntil: "networkidle" });
      check(await page.getByRole("button", { name: `Поставить на стоп: ${dishName}`, exact: true }).count() === 1, `${site.name}: stop-list not restored`);
      result.menu = { stopListPersisted: true, restored: true };

      await page.goto(`${site.origin}/admin/settings#booking`, { waitUntil: "networkidle" });
      const section = page.locator("section#booking");
      const slot = section.getByLabel("Шаг слота, мин");
      const original = Number(await slot.inputValue());
      const changed = original === 30 ? 45 : 30;
      await slot.fill(String(changed));
      await section.getByRole("button", { name: "Сохранить" }).click();
      await page.waitForTimeout(900);
      await page.reload({ waitUntil: "networkidle" });
      check(Number(await section.getByLabel("Шаг слота, мин").inputValue()) === changed, `${site.name}: settings not persisted`);
      await section.getByLabel("Шаг слота, мин").fill(String(original));
      await section.getByRole("button", { name: "Сохранить" }).click();
      await page.waitForTimeout(900);
      await page.reload({ waitUntil: "networkidle" });
      check(Number(await section.getByLabel("Шаг слота, мин").inputValue()) === original, `${site.name}: settings not restored`);
      result.settings = { bookingSlotPersisted: true, restored: true };

      results.push(result);
      console.log(`${site.name}: order #${order.orderNumber}, booking persisted, menu stop-list restored, booking setting restored`);
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      results.push(result);
      console.log(`${site.name}: FAILED ${result.error}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(join(output, "actions.json"), JSON.stringify(results, null, 2));
}
if (results.some((result) => result.error)) process.exitCode = 1;
