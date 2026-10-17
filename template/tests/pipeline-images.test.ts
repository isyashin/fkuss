import { describe, expect, it } from "vitest";
import { dishIdFromFilename } from "../scripts/lib/dish-images";

describe("pipeline image filenames", () => {
  it("never uses an already generated small image as the full source", () => {
    expect(dishIdFromFilename("dish-pizza-sm.webp")).toBeNull();
    expect(dishIdFromFilename("dish-pizza.jpg")).toBe("dish-pizza");
    expect(dishIdFromFilename("logo.png")).toBeNull();
  });
});
