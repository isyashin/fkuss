"use client";

import { useState } from "react";
import { dishImageUrl } from "@/lib/assets";
import type { Menu, Dish } from "@/lib/content";
import type { ContentSettings } from "@/lib/content-schema";
import type { GuestChannels } from "@/lib/guest-contact";

import { useCart, type CartModifier } from "@/lib/cart/store";
import { validateModifierSelection } from "@/lib/order/modifier-validation";
import { CartBar } from "@/components/cart/cart-bar";
import { CartSheet } from "@/components/cart/cart-sheet";

function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

export function MenuClient({
  menu,
  delivery,
  loyalty,
  whatsapp,
  guestContact,
  isOpen,
  paymentProvider = "none",
  bonusBalance = 0,
  initialAddress = "",
}: {
  menu: Menu;
  delivery: ContentSettings["delivery"];
  loyalty: ContentSettings["loyalty"];
  whatsapp: ContentSettings["channels"]["whatsapp"];
  guestContact: GuestChannels;
  isOpen?: boolean;
  paymentProvider?: string;
  bonusBalance?: number;
  initialAddress?: string;
}) {
  const [activeCategory, setActiveCategory] = useState(menu.categories[0]?.id ?? "");
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const add = useCart((s) => s.add);

  return (
    <div className="pb-24">
      {isOpen === false && (
        <div className="bg-amber-100 text-amber-900 text-center text-sm py-2 px-4">
          Сейчас ресторан закрыт — принимаем предзаказы на время открытия
        </div>
      )}
      {/* Табы категорий — прилипают к верху */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur border-b border-foreground/10">
        <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3 scrollbar-none md:justify-[safe_center]">
          {menu.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveCategory(c.id);
                document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`min-h-11 shrink-0 px-4 rounded-full text-sm font-medium transition-colors ${
                activeCategory === c.id ? "bg-accent text-white" : "bg-card text-foreground"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4">
        {menu.categories.map((category) => (
          <section key={category.id} id={`cat-${category.id}`} className="pt-6 scroll-mt-28">
            <h2 className="text-2xl mb-4">{category.name}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {category.dishes
                .filter((d) => d.available)
                .map((dish) => (
                  <button
                    key={dish.id}
                    onClick={() => setSelectedDish(dish)}
                    className="text-left bg-card rounded-[var(--radius)] overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
                  >
                    <div className="relative aspect-square bg-foreground/5">
                      {/* Карточка: 400px WebP напрямую, без runtime-оптимизатора */}
                      <img
                        src={dishImageUrl(dish.image, "sm")}
                        alt={dish.name}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      {dish.tags.includes("hit") && (
                        <span className="absolute top-2 left-2 bg-accent text-white text-xs px-2 py-1 rounded-full">
                          Хит
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium leading-snug line-clamp-2">{dish.name}</p>
                      <p className="text-muted text-xs mt-0.5">{dish.weight}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-semibold text-accent">{formatPrice(dish.price)}</span>
                        <span className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-full bg-accent/10 text-accent text-xl leading-none">
                          +
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>

      {/* Модалка блюда */}
      {selectedDish && (
        <DishModal
          dish={selectedDish}
          onClose={() => setSelectedDish(null)}
          onAdd={(modifiers, quantity) => {
            add(
              {
                dishId: selectedDish.id,
                name: selectedDish.name,
                price: selectedDish.price,
                image: selectedDish.image,
                modifiers,
              },
              quantity,
            );
            setSelectedDish(null);
          }}
        />
      )}

      <CartBar onOpen={() => setCartOpen(true)} />
      {cartOpen && (
        <CartSheet
          delivery={delivery}
          loyalty={loyalty}
          whatsapp={whatsapp}
          guestContact={guestContact}
          paymentProvider={paymentProvider}
          bonusBalance={bonusBalance}
          initialAddress={initialAddress}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}

function DishModal({
  dish,
  onClose,
  onAdd,
}: {
  dish: Dish;
  onClose: () => void;
  onAdd: (modifiers: CartModifier[], quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<CartModifier[]>([]);
  const [selectionError, setSelectionError] = useState("");

  const groups = dish.groups ?? [];
  const modifiersTotal = selectedModifiers.reduce((s, m) => s + m.price, 0);
  const total = (dish.price + modifiersTotal) * quantity;

  function toggleModifier(mod: CartModifier, maxSelected: number) {
    setSelectedModifiers((prev) => {
      const has = prev.some((sm) => sm.id === mod.id);
      if (has) return prev.filter((sm) => sm.id !== mod.id);
      if (maxSelected === 1) {
        // radio: снимаем выбор остальных из этой же группы
        const group = groups.find((g) => g.modifiers.some((m) => m.id === mod.id));
        const groupIds = group ? group.modifiers.map((m) => m.id) : [];
        return [...prev.filter((sm) => !groupIds.includes(sm.id)), mod];
      }
      return [...prev, mod];
    });
  }

  function tryAdd() {
    if (groups.length > 0) {
      const result = validateModifierSelection(
        groups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelected: g.minSelected,
          maxSelected: g.maxSelected,
          modifierIds: g.modifiers.map((m) => m.id),
        })),
        selectedModifiers.map((m) => m.id),
      );
      if (!result.ok) {
        setSelectionError(result.error);
        return;
      }
    }
    onAdd(selectedModifiers, quantity);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal>
      <button className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Закрыть" />
      <div className="relative bg-background w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="relative aspect-[4/3] bg-foreground/5">
          {/* Модалка: полный 800px WebP напрямую */}
          <img src={dishImageUrl(dish.image, "full")} alt={dish.name} className="absolute inset-0 w-full h-full object-cover" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 min-w-11 min-h-11 rounded-full bg-black/50 text-white text-xl"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          <h3 className="text-xl">{dish.name}</h3>
        {dish.weight && <p className="text-muted text-sm mt-1">{dish.weight}</p>}
        {dish.composition && (
          <p className="mt-2 text-sm leading-relaxed">
            <span className="text-muted">Состав: </span>
            {dish.composition}
          </p>
        )}
        {dish.description && <p className="mt-2 text-muted leading-relaxed">{dish.description}</p>}

          {dish.modifiers.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="font-medium">Добавки</p>
              {dish.modifiers.map((m) => {
                const checked = selectedModifiers.some((sm) => sm.id === m.id);
                return (
                  <label key={m.id} className="flex items-center justify-between min-h-11 gap-3 cursor-pointer">
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModifier(m, 99)}
                        className="w-5 h-5 accent-[var(--accent)]"
                      />
                      {m.name}
                    </span>
                    <span className="text-muted">+{m.price} ₽</span>
                  </label>
                );
              })}
            </div>
          )}

          {groups.map((group) => (
            <div key={group.id} className="mt-4 space-y-2">
              <p className="font-medium">
                {group.name}
                {group.minSelected > 0 && <span className="text-accent text-sm ml-2">обязательно</span>}
                {group.maxSelected > 1 && group.maxSelected < 99 && (
                  <span className="text-muted text-sm ml-2">до {group.maxSelected}</span>
                )}
              </p>
              {group.modifiers.map((m) => {
                const checked = selectedModifiers.some((sm) => sm.id === m.id);
                return (
                  <label key={m.id} className="flex items-center justify-between min-h-11 gap-3 cursor-pointer">
                    <span className="flex items-center gap-3">
                      <input
                        type={group.maxSelected === 1 ? "radio" : "checkbox"}
                        name={group.maxSelected === 1 ? `group-${group.id}` : undefined}
                        checked={checked}
                        onChange={() => toggleModifier(m, group.maxSelected)}
                        className="w-5 h-5 accent-[var(--accent)]"
                      />
                      {m.name}
                    </span>
                    <span className="text-muted">{m.price > 0 ? `+${m.price} ₽` : "0 ₽"}</span>
                  </label>
                );
              })}
            </div>
          ))}

          {selectionError && <p className="mt-3 text-sm text-red-600">{selectionError}</p>}

          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center border border-foreground/20 rounded-full">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="min-w-11 min-h-11 text-xl"
                aria-label="Меньше"
              >
                −
              </button>
              <span className="w-8 text-center font-medium">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                className="min-w-11 min-h-11 text-xl"
                aria-label="Больше"
              >
                +
              </button>
            </div>
            <button
              onClick={tryAdd}
              className="flex-1 min-h-12 rounded-full bg-accent text-white font-medium text-lg"
            >
              Добавить · {formatPrice(total)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
