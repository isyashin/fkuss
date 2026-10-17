import { expect, test, type Route } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// The first poll is deliberately held at the network boundary during the click.
test.use({ serviceWorkers: "block" });

test("profile click survives the first unread badge arriving during the gesture", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "mobile topbar regression");
  let receive!: (route: Route) => void;
  const firstPoll = new Promise<Route>((resolve) => { receive = resolve; });
  let held = false;
  await page.route("**/api/admin/events", async (route) => {
    if (!held) { held = true; receive(route); }
    else await route.continue();
  });
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  const profile = page.getByRole("button", { name: /Профиль:/ });
  await expect(profile).toBeEnabled();
  const poll = await firstPoll;
  const response = await poll.fetch();
  expect(response.ok()).toBe(true);
  const baseline = await response.json();
  const box = await profile.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  try {
    // Same server counters as SSR: only the bell's unread badge changes.
    await poll.fulfill({ json: {
      ...baseline,
      events: [{ id: "profile-badge", kind: "order", reference: "qa-profile", label: "QA", createdAt: "2020-01-01T00:00:00Z" }],
      latestId: "profile-badge",
    } });
    await expect(page.getByRole("button", { name: "Оповещения: 1", exact: true })).toBeVisible();
    const after = await profile.boundingBox();
    await testInfo.attach("profile-geometry", { body: Buffer.from(JSON.stringify({ before: box, after })), contentType: "application/json" });
    expect(after!.x, "unread badge must not move the profile during a click").toBeCloseTo(box!.x, 0);
  } finally { await page.mouse.up(); }
  await expect(profile).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "☾ Тёмная тема", exact: true })).toBeVisible();
});
