"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCategory, addDish, addModifier, addModifierGroup, deleteCategory, deleteDish, deleteModifier, deleteModifierGroup, renameCategory, reorderCategory, updateCategoryMenu, updateDish, updateModifierGroup, type ModifierActionResult } from "./actions";
import { dishImageUrl } from "@/lib/assets";
import { filterAdminMenuCategories } from "@/lib/menu-categories";
import { AdminIcon } from "../admin-icon";
import type { Category, Dish, Modifier, ModifierGroup } from "@/generated/prisma/client";
import ui from "../admin-ui.module.css";
import rd from "../admin-redesign.module.css";
import { useDirtyGuard, confirmDiscard } from "../admin-dirty";
import { StatusPill } from "../status-pill";
import { ConfirmDialog } from "../confirm-dialog";
import styles from "./menu-admin.module.css";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Не удалось сохранить изменение";
const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

// Вес/объём — только цифры, разделители и единицы (г, кг, мл, л): ввод «abc» бессмыслен.
const WEIGHT_FORBIDDEN = /[^\d\s.,гклм]/gi;
const sanitizeWeight = (value: string) => value.replace(WEIGHT_FORBIDDEN, "");

async function uploadDishPhoto(dishId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("section", "dishes");
  form.append("name", dishId);
  const response = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok || typeof data.path !== "string") throw new Error(data.error ?? "Фото не загрузилось");
  const linked = await fetch("/api/admin/dish-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dishId, image: data.path }),
  });
  if (!linked.ok) throw new Error("Фото загружено, но не привязано к блюду");
}

function draftFromDish(dish: Dish) {
  return {
    name: dish.name,
    categoryId: dish.categoryId,
    weight: dish.weight,
    composition: dish.composition,
    description: dish.description,
    priceMode: dish.priceMode as "inherit" | "yandex" | "manual" | "coefficient",
    manualPrice: dish.manualPrice,
    coefficientPercent: dish.coefficientPercent,
  };
}
type DishDraft = ReturnType<typeof draftFromDish>;
type DishWithModifiers = Dish & { modifierGroups: (ModifierGroup & { modifiers: Modifier[] })[] };
type CategoryWithDishes = Category & { dishes: DishWithModifiers[] };

export function MenuAdmin({ categories, menus }: { categories: CategoryWithDishes[]; menus: { id: string; name: string }[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [availability, setAvailability] = useState<"all" | "available" | "unavailable">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryMenu, setNewCategoryMenu] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string; dishCount: number } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const categoryDialogRef = useRef<HTMLDialogElement>(null);
  const renameDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { const dialog = categoryDialogRef.current; if (!dialog) return; if (categoryDialogOpen && !dialog.open) dialog.showModal(); if (!categoryDialogOpen && dialog.open) dialog.close(); }, [categoryDialogOpen]);
  useEffect(() => { const dialog = renameDialogRef.current; if (!dialog) return; if (renaming && !dialog.open) dialog.showModal(); if (!renaming && dialog.open) dialog.close(); }, [renaming]);

  const moveCategory = (id: string, direction: "up" | "down") => startTransition(async () => {
    setError("");
    try { await reorderCategory(id, direction); router.refresh(); }
    catch (cause) { setError(errorText(cause)); }
  });

  const menuFiltered = useMemo(() => menuId === "all" ? categories : categories.filter((category) => (category.menuId ?? "") === menuId), [categories, menuId]);
  const flat = useMemo(() => filterAdminMenuCategories(
    menuFiltered.filter((category) => categoryId === "all" || category.id === categoryId),
    { needle: query, availability },
    categoryId !== "all" ? categoryId : undefined),
  [menuFiltered, categoryId, availability, query]);
  const allDishes = flat.flatMap((category) => category.dishes);
  const selected = allDishes.find((dish) => dish.id === selectedId) ?? null;

  // D05: позиция списка блюд сохраняется при открытии редактора и восстанавливается по возврату.
  const paneRef = useRef<HTMLElement | null>(null);
  const savedScrollRef = useRef({ win: 0, pane: 0 });
  // D05: позиция восстанавливается несколькими попытками — фоновый опрос может
  // перезаписать скролл уже после первого восстановления.
  const restoreListScroll = () => {
    for (const delay of [80, 250, 500, 900]) {
      setTimeout(() => {
        window.scrollTo(0, savedScrollRef.current.win);
        if (paneRef.current) paneRef.current.scrollTop = savedScrollRef.current.pane;
      }, delay);
    }
  };
  const select = (id: string | null, create = false) => {
    // Сохраняем позицию синхронно — до любых перерендеров и гонок с фоновым обновлением.
    savedScrollRef.current = { win: window.scrollY, pane: paneRef.current?.scrollTop ?? 0 };
    void confirmDiscard("Изменения блюда не сохранены и будут потеряны.").then((proceed) => {
      if (!proceed) return;
      setSelectedId(id);
      setCreating(create);
      setMobileDetail(true);
      window.scrollTo(0, 0);
      setError("");
    });
  };

  return (
    <div className={`${ui.dashboard} ${styles.menuLayout} ${mobileDetail ? ui.mobileDetail : ""}`}>
      <section className={ui.ordersPanel} aria-label="Список блюд" ref={paneRef as never}>
        <div className={ui.queueHead}>
          <h1>Меню</h1>
          <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} onClick={() => select(null, true)}>+ Блюдо</button>
        </div>
        <div className={styles.menuTools}>
          <input className={ui.searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо" aria-label="Поиск блюда" />
          <div className={styles.menuFilterRow}>
            <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); }} aria-label="Категория меню">
              <option value="all">Все категории</option>
              {menuFiltered.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)} aria-label="Доступность блюд">
              <option value="all">Все блюда</option>
              <option value="available">В меню</option>
              <option value="unavailable">Недоступны</option>
            </select>
          </div>
          {menus.length > 0 && (
            <div className={styles.menuFilterRow}>
              <select value={menuId} onChange={(event) => { setMenuId(event.target.value); setCategoryId("all"); }} aria-label="Меню ресторана">
                <option value="all">Все меню</option>
                {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
              </select>
            </div>
          )}
          <button type="button" className={`${rd.btnText} ${styles.categoryAdd}`} onClick={() => setCategoryDialogOpen(true)}>+ Категория</button>
        </div>
        <div className={ui.list}>
          {flat.length ? flat.map((category, index) => {
            const groupKey = category.menuId ?? "";
            const hasPrev = flat.slice(0, index).some((c) => (c.menuId ?? "") === groupKey);
            const hasNext = flat.slice(index + 1).some((c) => (c.menuId ?? "") === groupKey);
            // Реальное число блюд (не отфильтрованное) — для запрета удаления.
            const dishCount = categories.find((c) => c.id === category.id)?.dishes.length ?? 0;
            return (
            <div key={category.id}>
              {categoryId === "all" && (
                <div className={styles.categoryHead}>
                  <p className={ui.dayDivider}>{category.name}</p>
                  <span className={styles.categoryActions}>
                    <button type="button" aria-label={`Поднять категорию ${category.name} выше`} disabled={pending || !hasPrev} onClick={() => moveCategory(category.id, "up")}><AdminIcon name="up" size={15} /></button>
                    <button type="button" aria-label={`Опустить категорию ${category.name} ниже`} disabled={pending || !hasNext} onClick={() => moveCategory(category.id, "down")}><AdminIcon name="down" size={15} /></button>
                    <button type="button" aria-label={`Переименовать категорию ${category.name}`} disabled={pending} onClick={() => setRenaming({ id: category.id, name: category.name })}><AdminIcon name="edit" size={15} /></button>
                    <button type="button" className={styles.categoryDelete} aria-label={`Удалить категорию ${category.name}`} disabled={pending || dishCount > 0} title={dishCount > 0 ? "В категории есть блюда — сначала удалите или перенесите их" : undefined} onClick={() => setDeleting({ id: category.id, name: category.name, dishCount })}><AdminIcon name="trash" size={15} /></button>
                  </span>
                </div>
              )}
              {category.dishes.map((dish) => (
                <div key={dish.id} className={`${styles.menuRow} ${dish.image ? styles.hasPhoto : ""} ${selected?.id === dish.id && !creating ? styles.menuRowSelected : ""}`}>
                  <button type="button" className={ui.orderOpen} aria-label={`Открыть блюдо ${dish.name}`} aria-pressed={selected?.id === dish.id && !creating} onClick={() => select(dish.id)} />
                  {dish.image && <span className={styles.dishPhoto}><img src={dishImageUrl(dish.image, "sm")} alt="" loading="lazy" /></span>}
                  <span className={styles.dishCopy}>
                    <strong>{dish.name}</strong>
                    <small>{dish.weight}{dish.description ? ` · ${dish.description}` : ""}</small>
                    {!dish.manualAvailable && <StatusPill tone="danger">Стоп вручную</StatusPill>}
                    {dish.manualAvailable && !dish.available && <StatusPill tone="source">Нет в источнике</StatusPill>}
                  </span>
                  <span className={styles.dishPrice}>{rub(dish.price)}</span>
                </div>
              ))}
              {category.dishes.length === 0 && <p className={ui.empty}>{dishCount === 0 ? "Пустая — скрыта на витрине." : "В этой категории блюд нет."}</p>}
            </div>
            );
          }) : <p className={ui.empty}>По этим условиям блюд нет.</p>}
        </div>
      </section>
      <section className={ui.detailPanel} aria-label="Выбранное блюдо">
        {creating ? (
          <NewDishEditor categories={menuFiltered} menus={menus} defaultCategoryId={categoryId !== "all" ? categoryId : menuFiltered[0]?.id ?? ""}
            onClose={() => { setCreating(false); restoreListScroll(); }} onCreated={(id) => { setCreating(false); setSelectedId(id); router.refresh(); }} />
        ) : selected ? (
          <DishEditor key={selected.id} dish={selected} categories={menuFiltered} menus={menus}
            onBack={() => { setMobileDetail(false); restoreListScroll(); }} onDeleted={() => { setSelectedId(null); setMobileDetail(false); router.refresh(); }} />
        ) : (
          <div className={`${ui.detailInner} ${styles.menuDetailInner}`}><p className={ui.empty}>Выберите блюдо.</p></div>
        )}
        {error && <p className={ui.error} role="alert">{error}</p>}
      </section>

      <dialog ref={categoryDialogRef} className={rd.dialog} onClose={() => setCategoryDialogOpen(false)}>
        <form className={rd.dialogBody} onSubmit={(event) => {
          event.preventDefault();
          if (!newCategory.trim()) return;
          startTransition(async () => {
            setError("");
            try { await addCategory(newCategory.trim(), newCategoryMenu || undefined); setNewCategory(""); setNewCategoryMenu(""); setCategoryDialogOpen(false); router.refresh(); }
            catch (cause) { setError(errorText(cause)); }
          });
        }}>
          <h2 className={rd.dialogTitle}>Новая категория</h2>
          <label className={rd.field}><span>Название</span>
            <input className={rd.input} value={newCategory} onChange={(event) => setNewCategory(event.target.value)} maxLength={120} required autoComplete="off" />
          </label>
          {menus.length > 0 && (
            <label className={rd.field} style={{ marginTop: 14 }}><span>Меню</span>
              <select className={rd.select} value={newCategoryMenu} onChange={(event) => setNewCategoryMenu(event.target.value)}>
                <option value="">Без меню</option>
                {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
              </select>
            </label>
          )}
          <div className={rd.dialogActions} style={{ marginTop: 24 }}>
            <button type="button" className={rd.btn} onClick={() => setCategoryDialogOpen(false)}>Отмена</button>
            <button type="submit" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending}>Добавить</button>
          </div>
        </form>
      </dialog>

      <dialog ref={renameDialogRef} className={rd.dialog} onClose={() => setRenaming(null)}>
        <form className={rd.dialogBody} onSubmit={(event) => {
          event.preventDefault();
          if (!renaming || !renaming.name.trim()) return;
          startTransition(async () => {
            setError("");
            try { await renameCategory(renaming.id, renaming.name.trim()); setRenaming(null); router.refresh(); }
            catch (cause) { setError(errorText(cause)); }
          });
        }}>
          <h2 className={rd.dialogTitle}>Переименовать категорию</h2>
          <label className={rd.field}><span>Название</span>
            <input className={rd.input} value={renaming?.name ?? ""} onChange={(event) => setRenaming((current) => current ? { ...current, name: event.target.value } : current)} maxLength={120} required autoComplete="off" />
          </label>
          <div className={rd.dialogActions} style={{ marginTop: 24 }}>
            <button type="button" className={rd.btn} onClick={() => setRenaming(null)}>Отмена</button>
            <button type="submit" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending || !renaming?.name.trim()}>Сохранить</button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog request={deleting ? {
        title: "Удалить категорию?",
        text: `«${deleting.name}» исчезнет из меню и витрины.`,
        acceptLabel: "Удалить",
        onAccept: () => startTransition(async () => {
          setError("");
          try { await deleteCategory(deleting.id); router.refresh(); }
          catch (cause) { setError(errorText(cause)); }
        }),
      } : null} onClose={() => setDeleting(null)} />
    </div>
  );
}

function DishEditor({ dish, categories, menus, onBack, onDeleted }: { dish: DishWithModifiers; categories: CategoryWithDishes[]; menus: { id: string; name: string }[]; onBack: () => void; onDeleted: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<DishDraft>(() => draftFromDish(dish));
  const [saved, setSaved] = useState<DishDraft>(() => draftFromDish(dish));
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // F06: уход с несохранёнными правками блюда требует подтверждения.
  useDirtyGuard(dirty);

  const save = () => startTransition(async () => {
    setError("");
    try { await updateDish(dish.id, form); setSaved(form); router.refresh(); }
    catch (cause) { setError(errorText(cause)); }
  });
  const toggleStop = () => startTransition(async () => {
    setError("");
    try { await updateDish(dish.id, { manualAvailable: !dish.manualAvailable }); router.refresh(); }
    catch (cause) { setError(errorText(cause)); }
  });

  return (
    <div className={`${ui.detailInner} ${styles.menuDetailInner}`}>
      <button type="button" className={ui.backButton} onClick={() => {
        void confirmDiscard("Изменения блюда не сохранены и будут потеряны.").then((proceed) => {
          if (proceed) { setForm(saved); onBack(); }
        });
      }}>← К меню</button>
      <div className={ui.detailHeader}>
        <div className={ui.detailTitle}><h2>{dish.name}</h2></div>
        <p className={ui.muted}>{categories.find((category) => category.id === dish.categoryId)?.name ?? "Без категории"} · на витрине {rub(dish.price)}</p>
      </div>
      <div className={styles.photoControl}>
        <span className={styles.editorPhoto}>{dish.image ? <img src={dishImageUrl(dish.image, "sm")} alt={dish.name} /> : <span>Нет фото</span>}</span>
        <div>
          <button type="button" className={rd.btn} onClick={() => fileRef.current?.click()} disabled={pending}>{dish.image ? "Заменить фото" : "Добавить фото"}</button>
          <small className={rd.hint} style={{ display: "block", marginTop: 7 }}>PNG, JPG или WebP. Фото обновится на витрине сразу после загрузки.</small>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setError("");
          try { await uploadDishPhoto(dish.id, file); router.refresh(); }
          catch (cause) { setError(errorText(cause)); }
          event.target.value = "";
        }} />
      </div>
      <div className={styles.menuFields}>
        <label className={rd.field}><span>Название</span>
          <input className={rd.input} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} />
        </label>
        <div className={styles.menuPriceRow}>
          <label className={rd.field}><span>Категория</span>
            <select className={rd.select} value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          {menus.length > 0 && (
            <label className={rd.field}><span>Меню</span>
              <select className={rd.select} value={categories.find((category) => category.id === dish.categoryId)?.menuId ?? ""} disabled={pending}
                onChange={(event) => startTransition(async () => {
                  setError("");
                  try { await updateCategoryMenu(dish.categoryId, event.target.value); router.refresh(); }
                  catch (cause) { setError(errorText(cause)); }
                })}>
                <option value="">— не задано —</option>
                {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className={styles.menuPriceRow}>
          <label className={rd.field}><span>Вес / объём</span>
            <input className={rd.input} value={form.weight} onChange={(event) => setForm({ ...form, weight: sanitizeWeight(event.target.value) })} maxLength={50} />
            <small className={rd.hint} style={{ display: "block", marginTop: 6 }}>Только цифры и единицы: 350 г, 0,5 л.</small>
          </label>
          <label className={rd.field}><span>Режим цены</span>
            <select className={rd.select} value={form.priceMode} onChange={(event) => {
              const priceMode = event.target.value as DishDraft["priceMode"];
              setForm({ ...form, priceMode, manualPrice: priceMode === "manual" ? form.manualPrice ?? dish.price : form.manualPrice });
            }}>
              <option value="inherit">Общая настройка</option>
              <option value="yandex" disabled={dish.yandexPrice === null}>Цена Яндекс.Еды</option>
              <option value="manual">Ручная цена</option>
              <option value="coefficient" disabled={dish.yandexPrice === null}>Яндекс ± %</option>
            </select>
          </label>
        </div>
        {form.priceMode === "manual" && (
          <label className={rd.field}><span>Цена на витрине, ₽</span>
            <input className={rd.input} type="number" min={0} max={1000000} step={1} value={form.manualPrice ?? ""} onChange={(event) => setForm({ ...form, manualPrice: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
        )}
        {form.priceMode === "coefficient" && (
          <label className={rd.field}><span>Цена Яндекс ± %</span>
            <input className={rd.input} type="number" min={-100} max={500} value={form.coefficientPercent ?? ""} onChange={(event) => setForm({ ...form, coefficientPercent: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
        )}
        <p className={rd.hint}>{dish.yandexPrice !== null ? `Цена в Яндекс.Еде: ${rub(dish.yandexPrice)} · ` : ""}На витрине: {rub(dish.price)}</p>
        <label className={rd.field}><span>Описание</span>
          <textarea className={rd.textarea} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} />
        </label>
        <label className={rd.field}><span>Состав</span>
          <textarea className={rd.textarea} value={form.composition} onChange={(event) => setForm({ ...form, composition: event.target.value })} rows={2} />
        </label>
      </div>
      <DishModifiersEditor dish={dish} />
      <div className={styles.menuStatusAction}>
        {!dish.manualAvailable
          ? <button type="button" className={rd.btn} disabled={pending} onClick={toggleStop}>Снять со стопа</button>
          : <button type="button" className={rd.btn} disabled={pending} onClick={toggleStop}>Поставить на стоп</button>}
        {!dish.available && <p className={rd.hint} style={{ marginTop: 8 }}>{dish.manualAvailable ? "Блюда нет в источнике — снятие стопа не вернёт его на витрину." : "Блюдо недоступно на витрине."}</p>}
      </div>
      {error && <p className={ui.error} role="alert">{error}</p>}
      <div className={styles.menuSavebar}>
        <span>{dirty ? "Есть несохранённые изменения" : "Изменений нет"}</span>
        <div>
          <button type="button" className={rd.btn} disabled={pending || !dirty} onClick={() => { setForm(saved); }}>Отмена</button>
          <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending || !dirty} onClick={save}>{pending ? "Сохраняем…" : "Сохранить"}</button>
        </div>
      </div>
      <button type="button" className={`${rd.btnText} ${rd.btnDanger} ${styles.menuDelete}`} disabled={pending} onClick={() => setConfirmDelete(true)}>Удалить блюдо</button>
      <ConfirmDialog request={confirmDelete ? {
        title: "Удалить блюдо?",
        text: `«${dish.name}» исчезнет из меню и витрины.`,
        acceptLabel: "Удалить",
        onAccept: () => startTransition(async () => {
          setError("");
          try { await deleteDish(dish.id); onDeleted(); }
          catch (cause) { setError(errorText(cause)); }
        }),
      } : null} onClose={() => setConfirmDelete(false)} />
    </div>
  );
}

function NewDishEditor({ categories, menus, defaultCategoryId, onClose, onCreated }: { categories: CategoryWithDishes[]; menus: { id: string; name: string }[]; defaultCategoryId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", price: 0, weight: "", composition: "", description: "", categoryId: defaultCategoryId });
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = form.name.trim().length > 0;
  useDirtyGuard(dirty);

  return (
    <div className={`${ui.detailInner} ${styles.menuDetailInner}`}>
      <button type="button" className={ui.backButton} onClick={() => {
        void confirmDiscard("Новое блюдо не сохранено и будет потеряно.").then((proceed) => { if (proceed) onClose(); });
      }}>← К меню</button>
      <div className={ui.detailHeader}>
        <div className={ui.detailTitle}><h2>Новое блюдо</h2></div>
        <p className={ui.muted}>Обязательны название и цена. Фото можно добавить сразу или позже.</p>
      </div>
      <form className={styles.menuFields} onSubmit={(event) => {
        event.preventDefault();
        if (!form.name.trim() || !form.price) return;
        startTransition(async () => {
          setError("");
          let createdId: string | null = null;
          try {
            createdId = await addDish({ categoryId: form.categoryId, name: form.name, price: form.price, weight: form.weight, composition: form.composition, description: form.description });
            if (photo) await uploadDishPhoto(createdId, photo);
            onCreated(createdId);
          } catch (cause) {
            setError(createdId ? `Блюдо добавлено, но фото не сохранилось: ${errorText(cause)}. Загрузите фото в карточке блюда.` : errorText(cause));
            if (createdId) onCreated(createdId);
          }
          router.refresh();
        });
      }}>
        <label className={rd.field}><span>Название</span>
          <input className={rd.input} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} />
        </label>
        <div className={styles.menuPriceRow}>
          <label className={rd.field}><span>Категория</span>
            <select className={rd.select} value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className={rd.field}><span>Цена, ₽</span>
            <input className={rd.input} type="number" min={0} max={1000000} step={1} value={form.price || ""} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} required />
          </label>
        </div>
        <label className={rd.field}><span>Вес / объём</span>
          <input className={rd.input} value={form.weight} onChange={(event) => setForm({ ...form, weight: sanitizeWeight(event.target.value) })} maxLength={50} />
          <small className={rd.hint} style={{ display: "block", marginTop: 6 }}>Только цифры и единицы: 350 г, 0,5 л.</small>
        </label>
        <label className={rd.field}><span>Описание</span>
          <textarea className={rd.textarea} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} />
        </label>
        <label className={rd.field}><span>Состав</span>
          <textarea className={rd.textarea} value={form.composition} onChange={(event) => setForm({ ...form, composition: event.target.value })} rows={2} />
        </label>
        <label className={rd.field}><span>Фото блюда</span>
          <input className={rd.input} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
        </label>
        {error && <p className={ui.error} role="alert">{error}</p>}
        <div className={styles.menuSavebar}>
          <span>{dirty ? "Есть несохранённые изменения" : "Заполните название и цену"}</span>
          <div>
            <button type="button" className={rd.btn} disabled={pending} onClick={onClose}>Отмена</button>
            <button type="submit" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending || !form.name.trim() || !form.price}>{pending ? "Сохраняем…" : "Добавить блюдо"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

interface GroupDraft {
  name: string;
  required: boolean;
  maxSelected: number;
}

const emptyGroupDraft: GroupDraft = { name: "", required: false, maxSelected: 1 };

/** Управление группами модификаторами блюда: создание, лимиты, варианты, удаление. */
function DishModifiersEditor({ dish }: { dish: DishWithModifiers }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroupDraft);
  const [editing, setEditing] = useState<(GroupDraft & { id: string }) | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<{ id: string; name: string } | null>(null);
  const [deletingModifier, setDeletingModifier] = useState<{ id: string; name: string } | null>(null);
  const [variantDrafts, setVariantDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const groupDialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { const dialog = groupDialogRef.current; if (!dialog) return; if (creatingGroup && !dialog.open) dialog.showModal(); if (!creatingGroup && dialog.open) dialog.close(); }, [creatingGroup]);
  useEffect(() => { const dialog = editDialogRef.current; if (!dialog) return; if (editing && !dialog.open) dialog.showModal(); if (!editing && dialog.open) dialog.close(); }, [editing]);

  const run = (action: Promise<ModifierActionResult>) => startTransition(async () => {
    setError("");
    const result = await action;
    if (!result.ok) { setError(result.error); return; }
    router.refresh();
  });

  const submitGroupDialog = (close: () => void, save: () => Promise<ModifierActionResult>) => startTransition(async () => {
    setError("");
    const result = await save();
    if (!result.ok) { setError(result.error); return; }
    close();
    router.refresh();
  });

  const variantDraft = (groupId: string) => variantDrafts[groupId] ?? { name: "", price: "" };
  const setVariantDraft = (groupId: string, draft: { name: string; price: string }) =>
    setVariantDrafts((current) => ({ ...current, [groupId]: draft }));

  return (
    <section className={styles.modifiers} aria-label="Модификаторы блюда">
      <div className={styles.modifiersHead}>
        <h3>Модификаторы</h3>
        <button type="button" className={`${rd.btnText} ${styles.categoryAdd}`} disabled={pending} onClick={() => { setGroupDraft(emptyGroupDraft); setCreatingGroup(true); }}>+ Группа</button>
      </div>
      <p className={rd.hint}>Обязательные группы проверяются при добавлении в корзину на витрине.</p>
      {dish.modifierGroups.length === 0 && <p className={ui.empty}>Групп модификаторов нет.</p>}
      {dish.modifierGroups.map((group) => {
        const draft = variantDraft(group.id);
        const price = draft.price === "" ? NaN : Number(draft.price);
        const canAddVariant = !pending && draft.name.trim().length > 0 && Number.isFinite(price) && price >= 0;
        return (
          <div key={group.id} className={styles.modifierGroup}>
            <div className={styles.modifierGroupHead}>
              <strong>{group.name}</strong>
              <span className={styles.modifierBadges}>
                {group.minSelected > 0 && <StatusPill tone="source">обязательно</StatusPill>}
                {group.maxSelected > 1 && <StatusPill tone="neutral">{group.maxSelected >= 99 ? "без лимита" : `до ${group.maxSelected}`}</StatusPill>}
              </span>
              <span className={styles.categoryActions}>
                <button type="button" aria-label={`Изменить группу ${group.name}`} disabled={pending} onClick={() => setEditing({ id: group.id, name: group.name, required: group.minSelected > 0, maxSelected: group.maxSelected })}><AdminIcon name="edit" size={15} /></button>
                <button type="button" className={styles.categoryDelete} aria-label={`Удалить группу ${group.name}`} disabled={pending} onClick={() => setDeletingGroup({ id: group.id, name: group.name })}><AdminIcon name="trash" size={15} /></button>
              </span>
            </div>
            {group.modifiers.map((modifier) => (
              <div key={modifier.id} className={styles.modifierRow}>
                <span className={styles.modifierName}>{modifier.name}</span>
                <span className={styles.modifierPrice}>{modifier.price > 0 ? `+${rub(modifier.price)}` : "0 ₽"}</span>
                <button type="button" className={styles.categoryDelete} aria-label={`Удалить вариант ${modifier.name}`} disabled={pending} onClick={() => setDeletingModifier({ id: modifier.id, name: modifier.name })}><AdminIcon name="trash" size={15} /></button>
              </div>
            ))}
            <div className={styles.modifierAddRow}>
              <input className={rd.input} value={draft.name} onChange={(event) => setVariantDraft(group.id, { ...draft, name: event.target.value })} placeholder="Новый вариант" aria-label={`Название варианта для группы ${group.name}`} maxLength={200} />
              <input className={rd.input} type="number" min={0} max={1000000} step={1} value={draft.price} onChange={(event) => setVariantDraft(group.id, { ...draft, price: event.target.value })} placeholder="Надбавка, ₽" aria-label={`Надбавка цены для варианта группы ${group.name}`} />
              <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={!canAddVariant}
                onClick={() => run(addModifier(dish.id, group.id, { name: draft.name.trim(), price }).then((result) => { if (result.ok) setVariantDraft(group.id, { name: "", price: "" }); return result; }))}>
                Добавить
              </button>
            </div>
          </div>
        );
      })}
      {error && <p className={ui.error} role="alert">{error}</p>}

      <dialog ref={groupDialogRef} className={rd.dialog} onClose={() => setCreatingGroup(false)}>
        <form className={rd.dialogBody} onSubmit={(event) => {
          event.preventDefault();
          if (!groupDraft.name.trim()) return;
          submitGroupDialog(() => setCreatingGroup(false), () => addModifierGroup(dish.id, { name: groupDraft.name.trim(), required: groupDraft.required, maxSelected: groupDraft.maxSelected }));
        }}>
          <h2 className={rd.dialogTitle}>Новая группа модификаторов</h2>
          <label className={rd.field}><span>Название</span>
            <input className={rd.input} value={groupDraft.name} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })} maxLength={200} required autoComplete="off" />
          </label>
          <ModifierGroupLimits draft={groupDraft} onChange={setGroupDraft} pending={pending} />
          <div className={rd.dialogActions} style={{ marginTop: 24 }}>
            <button type="button" className={rd.btn} onClick={() => setCreatingGroup(false)}>Отмена</button>
            <button type="submit" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending || !groupDraft.name.trim()}>Добавить</button>
          </div>
        </form>
      </dialog>

      <dialog ref={editDialogRef} className={rd.dialog} onClose={() => setEditing(null)}>
        <form className={rd.dialogBody} onSubmit={(event) => {
          event.preventDefault();
          if (!editing || !editing.name.trim()) return;
          submitGroupDialog(() => setEditing(null), () => updateModifierGroup(editing.id, { name: editing.name.trim(), required: editing.required, maxSelected: editing.maxSelected }));
        }}>
          <h2 className={rd.dialogTitle}>Изменить группу</h2>
          <label className={rd.field}><span>Название</span>
            <input className={rd.input} value={editing?.name ?? ""} onChange={(event) => setEditing((current) => current ? { ...current, name: event.target.value } : current)} maxLength={200} required autoComplete="off" />
          </label>
          {editing && <ModifierGroupLimits draft={editing} onChange={(draft) => setEditing((current) => current ? { ...current, ...draft } : current)} pending={pending} />}
          <div className={rd.dialogActions} style={{ marginTop: 24 }}>
            <button type="button" className={rd.btn} onClick={() => setEditing(null)}>Отмена</button>
            <button type="submit" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending || !editing?.name.trim()}>Сохранить</button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog request={deletingGroup ? {
        title: "Удалить группу?",
        text: `«${deletingGroup.name}» и её варианты исчезнут из витрины.`,
        acceptLabel: "Удалить",
        onAccept: () => run(deleteModifierGroup(deletingGroup.id)),
      } : null} onClose={() => setDeletingGroup(null)} />
      <ConfirmDialog request={deletingModifier ? {
        title: "Удалить вариант?",
        text: `«${deletingModifier.name}» исчезнет из витрины.`,
        acceptLabel: "Удалить",
        onAccept: () => run(deleteModifier(deletingModifier.id)),
      } : null} onClose={() => setDeletingModifier(null)} />
    </section>
  );
}

function ModifierGroupLimits({ draft, onChange, pending }: { draft: GroupDraft; onChange: (draft: GroupDraft) => void; pending: boolean }) {
  return (
    <div className={styles.modifierLimits}>
      <label className={styles.modifierRequired}>
        <input type="checkbox" checked={draft.required} disabled={pending} onChange={(event) => onChange({ ...draft, required: event.target.checked })} />
        Обязательный выбор
      </label>
      <label className={rd.field}><span>Максимум выборов (99 — без лимита)</span>
        <input className={rd.input} type="number" min={1} max={99} step={1} value={draft.maxSelected} disabled={pending} onChange={(event) => onChange({ ...draft, maxSelected: Number(event.target.value) })} />
      </label>
    </div>
  );
}
