import { beforeEach, describe, expect, it } from "vitest";
import { useCart } from "@/lib/cart/store";
const dish = { dishId: "one", name: "Суп", price: 500, image: "", modifiers: [] };
beforeEach(() => { useCart.setState({ items: [], draftId: "draft", pending: [] }); });
describe("submitted order and a separate draft", () => {
  it("reuses a request key after a lost response", () => {
    useCart.getState().add(dish);
    const first = useCart.getState().beginCheckout("hash");
    expect(useCart.getState().beginCheckout("hash")).toBe(first);
  });
  it("clears only the acknowledged draft and keeps other pending attempts", () => {
    useCart.getState().add(dish);
    const key = useCart.getState().beginCheckout("hash");
    useCart.getState().settleCheckout(key);
    expect(useCart.getState().items).toHaveLength(0);
    expect(useCart.getState().pending).toHaveLength(0);
  });
  it("a late response or completion cannot clear new chosen dishes", () => {
    useCart.getState().add(dish);
    const key = useCart.getState().beginCheckout("hash");
    useCart.getState().add({ ...dish, dishId: "two" });
    useCart.getState().settleCheckout(key);
    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().items[0].dishId).toBe("two");
    expect(useCart.getState().total()).toBe(500);
  });
  it("a definitive rejection leaves the editable draft intact",()=>{
    useCart.getState().add(dish);const key=useCart.getState().beginCheckout("hash");
    useCart.getState().rejectCheckout(key);useCart.getState().add({...dish,dishId:"two"});
    expect(useCart.getState().items).toHaveLength(2);
  });
  it("settling an unknown attempt never empties the draft", () => {
    useCart.getState().add(dish);
    useCart.getState().settleCheckout("other-tab");
    expect(useCart.getState().items).toHaveLength(1);
  });
  it("changing checkout details gets another key, retrying the same details reuses it", () => {
    useCart.getState().add(dish);
    const first = useCart.getState().beginCheckout("first");
    const second = useCart.getState().beginCheckout("second");
    expect(first).not.toBe(second);
    expect(useCart.getState().beginCheckout("first")).toBe(first);
    useCart.getState().clear();
    useCart.getState().add(dish);
    expect(useCart.getState().beginCheckout("first")).not.toBe(first);
  });
});
