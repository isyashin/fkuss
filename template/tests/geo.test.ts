import { describe, it, expect } from "vitest";
import { pointInPolygon, findZoneByPoint } from "@/lib/delivery/geo";

// Квадрат 1x1 градус вокруг условной точки (Москва)
const square: [number, number][] = [
  [55.0, 37.0],
  [55.0, 38.0],
  [56.0, 38.0],
  [56.0, 37.0],
];

// Треугольник
const triangle: [number, number][] = [
  [50.0, 30.0],
  [51.0, 30.0],
  [50.5, 31.0],
];

describe("pointInPolygon", () => {
  it("точка внутри квадрата", () => {
    expect(pointInPolygon(55.5, 37.5, square)).toBe(true);
  });

  it("точка снаружи квадрата", () => {
    expect(pointInPolygon(54.5, 37.5, square)).toBe(false);
    expect(pointInPolygon(55.5, 38.5, square)).toBe(false);
  });

  it("работает в любом направлении обхода полигона", () => {
    expect(pointInPolygon(55.5, 37.5, [...square].reverse())).toBe(true);
  });

  it("точка внутри треугольника", () => {
    expect(pointInPolygon(50.5, 30.4, triangle)).toBe(true);
  });

  it("точка рядом, но снаружи треугольника", () => {
    expect(pointInPolygon(50.1, 30.9, triangle)).toBe(false);
  });
});

describe("findZoneByPoint", () => {
  const zones = [
    { name: "Центр", polygon: square },
    { name: "Треугольник", polygon: triangle },
    { name: "Без геометрии" }, // старая зона без polygon — пропускается
  ];

  it("находит зону по точке", () => {
    expect(findZoneByPoint(55.5, 37.5, zones)).toBe("Центр");
    expect(findZoneByPoint(50.5, 30.4, zones)).toBe("Треугольник");
  });

  it("зоны без polygon не участвуют и не ломают поиск", () => {
    expect(findZoneByPoint(60.0, 40.0, zones)).toBeNull();
  });

  it("точка вне всех зон — null", () => {
    expect(findZoneByPoint(0, 0, zones)).toBeNull();
  });

  it("пустой список зон — null", () => {
    expect(findZoneByPoint(55.5, 37.5, [])).toBeNull();
  });

  it("первое попадание побеждает (порядок зон определяет приоритет)", () => {
    const inner: [number, number][] = [
      [55.2, 37.2],
      [55.2, 37.8],
      [55.8, 37.8],
      [55.8, 37.2],
    ];
    const nested = [
      { name: "Внешняя", polygon: square },
      { name: "Внутренняя", polygon: inner },
    ];
    expect(findZoneByPoint(55.5, 37.5, nested)).toBe("Внешняя");
    expect(findZoneByPoint(55.5, 37.5, [...nested].reverse())).toBe("Внутренняя");
  });
});
