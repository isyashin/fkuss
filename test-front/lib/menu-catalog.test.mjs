import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculatePreviewTotal } from "./preview-total.mjs";

const dishes = JSON.parse(await readFile(new URL("./menu.json", import.meta.url), "utf8"));

test("local catalog covers the 10 categories and 75 dishes visible on the restaurant site", () => {
  const categoryCounts = Object.fromEntries(
    [...new Set(dishes.map((dish) => dish.category))].map((category) => [
      category,
      dishes.filter((dish) => dish.category === category).length,
    ]),
  );
  assert.deepEqual(categoryCounts, {
    "Холодные закуски": 6,
    "Салаты": 9,
    "Горячие закуски": 4,
    "Супы": 8,
    "Шашлык": 23,
    "Горячие блюда": 9,
    "Гарниры": 6,
    "Выпечка": 3,
    "Напитки": 6,
    "Соусы": 1,
  });
  assert.equal(dishes.length, 75);
  assert.equal(new Set(dishes.map((dish) => dish.id)).size, 75);
});

test("order preview uses the displayed site prices for dishes across the full catalog", () => {
  const caesar = dishes.find((dish) => dish.name === "Цезарь с курицей");
  const potatoKebab = dishes.find((dish) => dish.name === "Люля-кебаб из картофеля");
  assert.equal(caesar?.price, 632);
  assert.equal(potatoKebab?.price, 552);
  const prices = Object.fromEntries(dishes.map((dish) => [dish.id, dish.price]));
  assert.equal(calculatePreviewTotal([
    { id: caesar.id, quantity: 1 },
    { id: potatoKebab.id, quantity: 2 },
  ], prices), 1736);
});
