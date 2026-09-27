import { chromium } from "../../template/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const password = process.env.QA_ADMIN_PASSWORD;
if (!password) throw new Error("QA_ADMIN_PASSWORD is required");
const output = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [site, origin] of [
    ["ochag", "http://192.168.88.153:3003"],
    ["buxara", "http://192.168.88.153:3001"],
  ]) {
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    const publicHome = await publicPage.goto(origin, { waitUntil: "networkidle" });
    const publicBooking = await publicPage.goto(`${origin}/booking`, { waitUntil: "networkidle" });
    const publicMenu = await publicPage.goto(`${origin}/menu`, { waitUntil: "networkidle" });
    const publicStatuses = [publicHome?.status(), publicBooking?.status(), publicMenu?.status()];
    await publicContext.close();

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`${origin}/admin/login`);
    await ownerPage.getByLabel("Логин").fill("owner");
    await ownerPage.getByLabel("Пароль").fill(password);
    await ownerPage.getByRole("button", { name: "Войти" }).click();
    await ownerPage.waitForURL((url) => url.pathname === "/admin", { timeout: 12000 });
    const ownerRoutes = {};
    for (const route of ["", "bookings", "menu", "settings", "team", "billing"]) {
      await ownerPage.goto(`${origin}/admin${route ? `/${route}` : ""}`, { waitUntil: "networkidle" });
      ownerRoutes[route || "orders"] = new URL(ownerPage.url()).pathname;
    }
    await ownerPage.goto(`${origin}/admin/menu`, { waitUntil: "networkidle" });
    const renderedDishes = await ownerPage.getByRole("article").count();
    const stopButtons = await ownerPage.getByRole("button", { name: /Поставить на стоп|Снять со стопа/ }).count();
    await ownerContext.close();

    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await staffPage.goto(`${origin}/admin/login`);
    await staffPage.getByLabel("Логин").fill("staff");
    await staffPage.getByLabel("Пароль").fill(password);
    await staffPage.getByRole("button", { name: "Войти" }).click();
    const staffLoggedIn = await staffPage.waitForURL((url) => url.pathname === "/admin", { timeout: 8000 }).then(() => true).catch(() => false);
    const staffRoutes = {};
    if (staffLoggedIn) {
      for (const route of ["", "bookings", "menu", "settings", "team", "billing"]) {
        await staffPage.goto(`${origin}/admin${route ? `/${route}` : ""}`, { waitUntil: "networkidle" });
        staffRoutes[route || "orders"] = new URL(staffPage.url()).pathname;
      }
    }
    await staffContext.close();
    results.push({ site, publicStatuses, ownerRoutes, renderedDishes, stopButtons, staffLoggedIn, staffRoutes });
    console.log(`${site}: public ${publicStatuses.join("/")}, owner routes ${Object.values(ownerRoutes).join(",")}, ${renderedDishes} rendered dishes, staff logged in ${staffLoggedIn}`);
  }
} finally {
  await browser.close();
}
await writeFile(join(output, "probe.json"), JSON.stringify(results, null, 2));
