import { describe, expect, it } from "vitest";
import {
  patchRestaurantSection,
  readRestaurantSectionRev,
  type RestaurantEditInput,
} from "@/lib/restaurant-settings-write";

const schedule = {
  days: { mon: { open: true, from: "12:00", to: "23:00" } },
  exceptions: [],
};

const original: RestaurantEditInput = {
  name: "Исходное название",
  phone: "+79990000000",
  email: "test@example.invalid",
  address: "Исходный адрес",
  socials: { telegram: "", max: "", whatsapp: "", vk: "" },
  schedule,
};

describe("раздельная запись данных ресторана и часов", () => {
  it("часы из устаревшей формы не затирают новые контакты, логотип и slug", () => {
    const current = { ...original, name: "Новые контакты", logo: "images/logo.png", slug: "sample", _contactsRev: 1 };
    const changedHours: RestaurantEditInput = {
      ...original,
      schedule: { ...schedule, days: { mon: { open: true, from: "11:00", to: "23:00" } } },
    };
    const result = patchRestaurantSection(current, changedHours, "hours");
    expect(result).toMatchObject({
      name: "Новые контакты",
      logo: "images/logo.png",
      slug: "sample",
      _contactsRev: 1,
      schedule: changedHours.schedule,
      workHours: [{ days: "пн", from: "11:00", to: "23:00" }],
    });
  });

  it("контакты из устаревшей формы не затирают новые часы", () => {
    const current = { ...original, schedule: { ...schedule, days: { mon: { open: true, from: "11:00", to: "23:00" } } }, _hoursRev: 2 };
    const changedContacts = { ...original, name: "Новое название" };
    const result = patchRestaurantSection(current, changedContacts, "contacts");
    expect(result).toMatchObject({ name: "Новое название", schedule: current.schedule, _hoursRev: 2 });
  });

  it("отсутствующая ревизия старой строки читается как ноль", () => {
    expect(readRestaurantSectionRev(original, "contacts")).toBe(0);
    expect(readRestaurantSectionRev({ _contactsRev: 3, _hoursRev: 5 }, "contacts")).toBe(3);
    expect(readRestaurantSectionRev({ _contactsRev: 3, _hoursRev: 5 }, "hours")).toBe(5);
  });
});
