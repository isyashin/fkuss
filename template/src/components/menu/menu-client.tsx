"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMounted } from "@/lib/use-mounted";
import { dishImageUrl } from "@/lib/assets";
import { DishImage } from "@/components/menu/dish-image";
import type { Menu, Dish } from "@/lib/content";
import type { ContentSettings } from "@/lib/content-schema";
import type { GuestChannels } from "@/lib/guest-contact";

import { useCart, type CartModifier } from "@/lib/cart/store";
import { validateModifierSelection } from "@/lib/order/modifier-validation";
import { CartBar } from "@/components/cart/cart-bar";
import { CartSheet } from "@/components/cart/cart-sheet";
import { menuSwitchItems, visibleMenuCategories } from "@/lib/multi-menu";

function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

export function MenuClient({
  menu,
  delivery,
  loyalty,
  guestContact,
  closedMessage,
  paymentProvider = "none",
  bonusBalance = 0,
  cabinetEnabled = false,
  initialAddress = "",
  pickupAddress = "",
  ymapsKey = "",
}: {
  menu: Menu;
  delivery: ContentSettings["delivery"];
  loyalty: ContentSettings["loyalty"];
  guestContact: GuestChannels;
  closedMessage?: string | null;
  paymentProvider?: string;
  bonusBalance?: number;
  cabinetEnabled?: boolean;
  initialAddress?: string;
  /** Адрес заведения — показываем гостю в чекауте самовывоза (issue #55). */
  pickupAddress?: string;
  /** Ключ JS API Яндекс.Карт — зоны на карте и подсказки адресов. */
  ymapsKey?: string;
}) {
  const mounted = useMounted();
  const menus = menu.menus ?? [];
  // Пустые категории (нет доступных блюд) на витрине не показываем —
  // и в табах, и в секциях (issue #43).
  const displayCategories = visibleMenuCategories(menu.categories);
  const [activeCategory, setActiveCategory] = useState(displayCategories[0]?.id ?? "");
  // Переключатель показываем только в мультименю-режиме (есть группы);
  // без групп — прежний вид: один ряд табов, без второй sticky-плашки.
  const switchItems = menuSwitchItems(menus, displayCategories);
  // Дефолт — группа первой категории: стартовый экран совпадает с прежним
  // поведением (одно меню), даже когда группы настроены.
  const [activeMenuId, setActiveMenuId] = useState(
    displayCategories[0] ? (displayCategories[0].menuId ?? "") : (switchItems[0]?.id ?? "all"),
  );
  // Категории активной группы (без переключателя — все, как раньше)
  const visibleCategories = switchItems.length === 0 ? displayCategories : displayCategories.filter((c) => (c.menuId ?? "") === activeMenuId);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  useEffect(() => {
    const open = () => setCartOpen(true);
    window.addEventListener("fkuss-open-cart", open);
    const url = new URL(location.href);
    let frame = 0;
    if (url.searchParams.get("cart") === "1") {
      frame = requestAnimationFrame(open); url.searchParams.delete("cart"); history.replaceState(history.state,"",url);
    }
    return () => { cancelAnimationFrame(frame); window.removeEventListener("fkuss-open-cart", open); };
  }, []);
  const add = useCart((s) => s.add);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  // Гасим только клик, завершающий жест драга (400 мс), а не все следующие клики
  const suppressClickUntil = useRef(0);

  const scrollTarget = useRef<string | null>(null);
  const menuChanged = useRef(false);

  // Read current geometry on the actual tap as well as on resize: a font or
  // notice can change between the observer's last callback and this event.
  const measureNavigation = useCallback(() => {
    const root = menuRef.current;
    const headerHeight = document.querySelector<HTMLElement>("[data-site-header]")?.getBoundingClientRect().height ?? 0;
    const navHeight = navigationRef.current?.getBoundingClientRect().height ?? 0;
    root?.style.setProperty("--menu-header-height", `${headerHeight}px`);
    root?.style.setProperty("--menu-nav-height", `${navHeight}px`);
    return { headerHeight, navHeight };
  }, []);

  const revealActiveCategory = useCallback(() => {
    const container = tabsRef.current;
    const chip = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !chip) return;
    const row = container.getBoundingClientRect();
    const tab = chip.getBoundingClientRect();
    if (tab.left < row.left) container.scrollLeft += tab.left - row.left - 8;
    else if (tab.right > row.right) container.scrollLeft += tab.right - row.right + 8;
  }, []);

  const scrollToCategory = useCallback((id: string, animated = true) => {
    const section = document.getElementById(`cat-${id}`);
    if (!section) return;
    const { headerHeight, navHeight } = measureNavigation();
    window.scrollTo({
      top: window.scrollY + section.getBoundingClientRect().top - headerHeight - navHeight,
      behavior: animated && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant",
    });
  }, [measureNavigation]);

  // Measure before useMounted enables the SSR-disabled controls. Late font or
  // viewport changes keep a requested heading visible until the guest scrolls.
  useLayoutEffect(() => {
    const navigation = navigationRef.current;
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    if (!navigation) return;
    const resize = () => {
      measureNavigation();
      revealActiveCategory();
      if (scrollTarget.current) scrollToCategory(scrollTarget.current, false);
    };
    measureNavigation();
    const observer = new ResizeObserver(resize);
    observer.observe(navigation);
    if (header) observer.observe(header);
    window.addEventListener("resize", resize);
    // A new gesture cancels automatic alignment; never fight manual scrolling.
    const cancel = () => { scrollTarget.current = null; };
    const key = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) cancel();
    };
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("pointerdown", cancel, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [measureNavigation, revealActiveCategory, scrollToCategory]);

  useLayoutEffect(() => {
    if (!menuChanged.current) return;
    menuChanged.current = false;
    scrollTarget.current = null;
    const { headerHeight } = measureNavigation();
    const root = menuRef.current;
    if (root) window.scrollTo({ top: window.scrollY + root.getBoundingClientRect().top - headerHeight, behavior: "instant" });
  }, [activeMenuId, measureNavigation]);

  useLayoutEffect(revealActiveCategory, [activeCategory, revealActiveCategory]);

  // Вертикальное колесо над табами прокручивает ряд по горизонтали
  // (нативный слушатель: React вешает wheel пассивно и preventDefault не сработал бы).
  // На краю ряда страница крутится как обычно.
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const forward = event.deltaY > 0;
      if ((forward && el.scrollLeft >= max - 1) || (!forward && el.scrollLeft <= 0)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Драг мышью: слушатели на window БЕЗ pointer capture — иначе click после
  // capture уходит на контейнер (общий предок pointerdown/up) и кнопка его не получает.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const el = tabsRef.current;
      if (!drag || !el || event.pointerType !== "mouse") return;
      const dx = event.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) > 6) drag.moved = true;
      if (drag.moved) el.scrollLeft = drag.startScroll - dx;
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.moved && event.pointerType === "mouse") suppressClickUntil.current = Date.now() + 400;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div ref={menuRef} className="pb-24">
      <div
        ref={navigationRef}
        data-testid="menu-navigation"
        aria-busy={!mounted}
        className="sticky z-30 bg-background/95 backdrop-blur"
        style={{ top: "var(--menu-header-height, 3.5rem)" }}
      >
        {!mounted && <span role="status" className="absolute right-4 bottom-0 text-xs text-muted">Загрузка меню…</span>}
        {closedMessage && (
          <div role="status" data-testid="order-availability-notice" className="bg-amber-100 text-amber-900 text-center text-sm py-2 px-4">
            {closedMessage}
          </div>
        )}
        {/* Переключатель меню («Хинкальная» / «Пироги и пицца») */}
        {switchItems.length > 0 && (
          <div className="border-b border-foreground/10">
            <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3 scrollbar-none" data-testid="menu-switch" role="tablist" aria-label="Меню ресторана">
              {switchItems.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={activeMenuId === group.id}
                  disabled={!mounted}
                  data-active={activeMenuId === group.id ? "true" : undefined}
                  onClick={() => {
                    if (activeMenuId === group.id) return;
                    menuChanged.current = true;
                    setActiveMenuId(group.id);
                    const first = displayCategories.find((c) => (c.menuId ?? "") === group.id);
                    setActiveCategory(first?.id ?? "");
                  }}
                  className={`min-h-11 shrink-0 px-5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait ${
                    activeMenuId === group.id ? "bg-foreground text-background" : "bg-card text-foreground"
                  }`}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Табы категорий — прилипают к верху; драг мышью / колесо / свайп */}
        <div className="border-b border-foreground/10">
          <div
            ref={tabsRef}
            data-testid="menu-tabs"
            role="tablist"
            aria-label="Категории меню"
            style={{ touchAction: "pan-x" }}
            className="mx-auto flex max-w-5xl cursor-grab gap-2 overflow-x-auto px-4 py-3 scrollbar-none select-none active:cursor-grabbing md:justify-[safe_center]"
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse") return;
              suppressClickUntil.current = 0; // новый жест отменяет подавление прошлого драга
              dragRef.current = { startX: event.clientX, startScroll: tabsRef.current?.scrollLeft ?? 0, moved: false };
            }}
            onClickCapture={(event) => {
              if (suppressClickUntil.current && Date.now() < suppressClickUntil.current) {
                event.preventDefault();
                event.stopPropagation();
              }
              suppressClickUntil.current = 0;
            }}
          >
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                role="tab"
                data-active={activeCategory === c.id ? "true" : undefined}
                aria-selected={activeCategory === c.id}
                disabled={!mounted}
                onClick={() => {
                  setActiveCategory(c.id);
                  scrollTarget.current = c.id;
                  scrollToCategory(c.id);
                }}
                className={`min-h-11 shrink-0 px-4 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-wait ${
                  activeCategory === c.id ? "bg-accent text-white" : "bg-card text-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4">
        {visibleCategories.map((category) => (
          <section
            key={category.id}
            id={`cat-${category.id}`}
            className="pt-6"
            style={{ scrollMarginTop: "calc(var(--menu-header-height, 3.5rem) + var(--menu-nav-height, 0px))" }}
          >
            <h2 className="text-2xl mb-4">{category.name}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {category.dishes
                .filter((d) => d.available)
                .map((dish) => (
                  <button
                    key={dish.id}
                    data-dish-id={dish.id}
                    data-testid="dish-card"
                    onClick={() => setSelectedDish(dish)}
                    className="flex flex-col text-left bg-card rounded-[var(--radius)] overflow-hidden shadow-sm active:scale-[0.98] transition-transform select-none"
                  >
                    <div className="relative w-full shrink-0 aspect-square bg-foreground/5 overflow-hidden">
                      {/* Карточка: 400px WebP напрямую, без runtime-оптимизатора */}
                      {/* scale: у исходников разная композиция (крупный план/общий),
                          лёгкий зум от центра визуально унифицирует кадры. Значение
                          входит в хэш CSS-чанка: при «протухшем» кэше у гостей
                          меняем его, чтобы браузер запросил свежий файл. */}
                      <DishImage
                        src={dishImageUrl(dish.image, "sm")}
                        alt={dish.name}
                        className="absolute inset-0 w-full h-full"
                        imageClassName="object-cover scale-[1.2]"
                      />
                      {dish.tags.includes("hit") && (
                        <span className="absolute top-2 left-2 bg-accent text-white text-xs px-2 py-1 rounded-full">
                          Хит
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <p className="min-h-[2lh] font-medium leading-snug line-clamp-2">{dish.name}</p>
                      <p className="min-h-[1lh] text-muted text-xs mt-0.5">{dish.weight}</p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
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
          guestContact={guestContact}
          paymentProvider={paymentProvider}
          bonusBalance={bonusBalance}
          cabinetEnabled={cabinetEnabled}
          initialAddress={initialAddress}
          pickupAddress={pickupAddress}
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
          <DishImage src={dishImageUrl(dish.image, "full")} alt={dish.name} loading="eager" className="absolute inset-0 w-full h-full" imageClassName="object-cover" />
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
