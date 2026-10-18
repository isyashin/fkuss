import { expect, test, type Page } from "@playwright/test";
import { gotoAdmin, loginAdminUi } from "./login-admin";

async function login(page: Page) {
  await gotoAdmin(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
}

const manualEditors = [
  { section: "loyalty", label: /Кэшбэк/, kind: "number" },
  { section: "payment", label: "Онлайн-оплата заказов", kind: "select" },
  { section: "booking", label: "Бронирование включено", kind: "check" },
  { section: "delivery", label: "Минимальная сумма для доставки, ₽", kind: "number" },
  { section: "pricing", label: "Режим цен меню", kind: "select" },
  { section: "preorder", label: "На сколько суток вперёд предлагать слоты", kind: "number" },
  { section: "theme", label: "Пресет", kind: "select" },
] as const;

for (const editor of manualEditors) {
  test(`QA18-04: ${editor.section} keeps draft on cancel and discards only after confirmation`, async ({ page }) => {
    await login(page);
    await gotoAdmin(page, `/admin/settings?section=${editor.section}`);
    // A wrapping label also contains option text. Use the control's accessible
    // name for selects, rather than matching the wrapper's full text content.
    const field = editor.kind === "select"
      ? page.getByRole("combobox", { name: editor.label, exact: typeof editor.label === "string" })
      : page.getByLabel(editor.label, { exact: typeof editor.label === "string" });
    let value: string | boolean;
    if (editor.kind === "check") { value = !(await field.isChecked()); await field.setChecked(value); }
    else if (editor.kind === "select") {
      value = await field.locator("option").evaluateAll((options, selected) => (options as HTMLOptionElement[]).find((o) => !o.disabled && o.value !== selected)!.value, await field.inputValue());
      await field.selectOption(value);
    } else { value = String(Number(await field.inputValue()) + 1); await field.fill(value); }
    const orders = page.getByRole("link", { name: /^Заказы/ }).filter({ visible: true });
    await orders.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Потерять правки?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`section=${editor.section}`));
    if (typeof value === "boolean") await expect(field).toBeChecked({ checked: value });
    else await expect(field).toHaveValue(value);
    await orders.click();
    await dialog.getByRole("button", { name: "Потерять правки", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
}

test("QA18-04: browser Back preserves the dirty editor on cancel and reaches the previous route on accept", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /^Настройки/ }).filter({ visible: true }).click();
  // Real same-document navigation; goto/reload intentionally creates a new shell.
  if (await page.getByRole("button", { name: "Открыть список разделов настроек" }).isVisible()) {
    await page.getByRole("button", { name: "Открыть список разделов настроек" }).click();
    await page.getByRole("button", { name: "Бонусы и лояльность", exact: true }).click();
  } else await page.getByRole("link", { name: "Бонусы и лояльность", exact: true }).click();
  await page.getByLabel(/Кэшбэк/).fill("17");
  await page.evaluate(() => history.back());
  const dialog = page.getByRole("dialog").filter({ hasText: "Потерять правки?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.getByLabel(/Кэшбэк/)).toHaveValue("17");
  await page.evaluate(() => history.back());
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Потерять правки", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
});

test("QA18-06: zone toggle has an independent 44px target and keyboard operation", async ({ page }) => {
  await login(page);
  await gotoAdmin(page, "/admin/settings?section=delivery");
  let checkbox = page.getByRole("checkbox", { name: /^Зона «/ }).first();
  if (!await checkbox.count()) {
    await page.getByRole("button", { name: "+ Добавить зону", exact: true }).click();
    await page.getByRole("button", { name: "Свернуть", exact: true }).click();
    checkbox = page.getByRole("checkbox", { name: /^Зона «/ }).first();
  }
  const label = checkbox.locator("..");
  const box = await label.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(checkbox.locator("xpath=ancestor::button")).toHaveCount(0);
  const wasChecked = await checkbox.isChecked();
  await checkbox.focus(); await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked({ checked: !wasChecked });
  await expect(page.getByLabel("Название зоны", { exact: true })).toHaveCount(0);
  // Restore draft state; do not write tariffs or geo settings in a geometry test.
  await checkbox.setChecked(wasChecked);
});

test("QA18-04: logout can be cancelled and confirmed after the profile popover closes", async ({ page }) => {
  await login(page);
  await gotoAdmin(page, "/admin/settings?section=loyalty");
  const field = page.getByLabel(/Кэшбэк/);
  await field.fill(String(Number(await field.inputValue()) + 1));
  const profile = page.getByRole("button", { name: /Профиль:/ }).filter({ visible: true });
  const dialog = page.getByRole("dialog").filter({ hasText: "Потерять правки?" });
  await profile.click();
  await page.getByRole("button", { name: "Выйти", exact: true }).filter({ visible: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page).toHaveURL(/section=loyalty/);
  await profile.click();
  await page.getByRole("button", { name: "Выйти", exact: true }).filter({ visible: true }).click();
  await dialog.getByRole("button", { name: "Потерять правки", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("QA18-07: profile closes on Escape/outside click and restores keyboard focus", async ({ page }) => {
  await login(page);
  const profile = page.getByRole("button", { name: /Профиль:/ }).filter({ visible: true });
  await profile.click();
  await page.getByRole("button", { name: /Тёмная тема|Светлая тема/ }).filter({ visible: true }).focus();
  await page.keyboard.press("Escape");
  await expect(profile).toHaveAttribute("aria-expanded", "false");
  await expect(profile).toBeFocused();
  await profile.click();
  await page.locator("main").click({ position: { x: 10, y: 10 } });
  await expect(profile).toHaveAttribute("aria-expanded", "false");
});
