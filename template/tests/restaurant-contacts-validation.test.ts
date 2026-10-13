import { describe, expect, it } from "vitest";
import { validateRestaurantContacts } from "@/lib/restaurant-settings-write";

const base = { phone: "", email: "", socials: { telegram: "", max: "", whatsapp: "", vk: "" } };

describe("валидация контактов ресторана", () => {
  it("пустые поля допустимы", () => {
    expect(validateRestaurantContacts(base)).toEqual({});
  });

  it("валидные российские телефоны принимаются", () => {
    for (const phone of ["+79991234567", "8 (999) 123-45-67", "+7 999 123-45-67", "89991234567", "9991234567"]) {
      expect(validateRestaurantContacts({ ...base, phone }).phone).toBeUndefined();
    }
  });

  it("невалидный телефон отклоняется с понятной ошибкой", () => {
    const errors = validateRestaurantContacts({ ...base, phone: "abc" });
    expect(errors.phone).toMatch(/телефон/i);
  });

  it("слишком короткий или длинный номер отклоняется", () => {
    expect(validateRestaurantContacts({ ...base, phone: "+7999" }).phone).toBeTruthy();
    expect(validateRestaurantContacts({ ...base, phone: "+799912345678" }).phone).toBeTruthy();
  });

  it("валидный email принимается, кривой — отклоняется", () => {
    expect(validateRestaurantContacts({ ...base, email: "hello@example.ru" }).email).toBeUndefined();
    expect(validateRestaurantContacts({ ...base, email: "not-an-email" }).email).toMatch(/email/i);
  });

  it("whatsapp проходит ту же проверку телефона", () => {
    expect(validateRestaurantContacts({ ...base, socials: { ...base.socials, whatsapp: "abc" } }).whatsapp).toBeTruthy();
    expect(validateRestaurantContacts({ ...base, socials: { ...base.socials, whatsapp: "+79991234567" } }).whatsapp).toBeUndefined();
  });

  it("telegram принимает только http(s)-ссылку", () => {
    expect(validateRestaurantContacts({ ...base, socials: { ...base.socials, telegram: "t.me/rest" } }).telegram).toBeTruthy();
    expect(validateRestaurantContacts({ ...base, socials: { ...base.socials, telegram: "https://t.me/rest" } }).telegram).toBeUndefined();
  });

  it("несколько ошибок возвращаются одновременно", () => {
    const errors = validateRestaurantContacts({
      phone: "abc",
      email: "x",
      socials: { ...base.socials, whatsapp: "!!", telegram: "no-link" },
    });
    expect(Object.keys(errors).sort()).toEqual(["email", "phone", "telegram", "whatsapp"]);
  });
});
