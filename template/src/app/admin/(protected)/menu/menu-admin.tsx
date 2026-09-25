"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCategory, addDish, deleteDish, updateDish } from "./actions";
import { dishImageUrl } from "@/lib/assets";
import type { Category, Dish } from "@/generated/prisma/client";
import adminStyles from "../admin-ui.module.css";
import styles from "./menu-admin.module.css";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Не удалось сохранить изменение";

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
    weight: dish.weight,
    composition: dish.composition,
    description: dish.description,
    priceMode: dish.priceMode as "inherit" | "yandex" | "manual" | "coefficient",
    manualPrice: dish.manualPrice,
    coefficientPercent: dish.coefficientPercent,
  };
}

export function MenuAdmin({ categories }: { categories: (Category & { dishes: Dish[] })[] }) {
  const [newCategory, setNewCategory] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const total = categories.reduce((sum, category) => sum + category.dishes.length, 0);
  const needle = query.trim().toLocaleLowerCase("ru");
  const visible = categories.filter((category) => categoryId === "all" || category.id === categoryId).map((category) => ({
    ...category,
    dishes: category.dishes.filter((dish) => !needle || [dish.name, dish.description, dish.composition, category.name].some((value) => value.toLocaleLowerCase("ru").includes(needle))),
  })).filter((category) => category.dishes.length > 0 || (!needle && categoryId === category.id));
  const visibleCount = visible.reduce((sum, category) => sum + category.dishes.length, 0);

  return (
    <div className={`${styles.page} ${adminStyles.menuPage}`}>
      <div className={styles.intro}><span>Каталог</span><h1>Меню</h1><p>Блюда и категории текущего ресторана. Сохранённые изменения видны на сайте.</p></div>
      <div className={styles.toolbar}><label><span className={styles.srOnly}>Поиск по меню</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо или описание" aria-label="Поиск по меню" /></label><span>{visibleCount === total ? `${total} блюд` : `${visibleCount} из ${total} блюд`}</span></div>
      <div className={styles.categories} role="group" aria-label="Категории меню"><button type="button" aria-pressed={categoryId === "all"} onClick={() => setCategoryId("all")}>Все <span>{total}</span></button>{categories.map((category) => <button type="button" key={category.id} aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>{category.name} <span>{category.dishes.length}</span></button>)}</div>
      {visible.map((category) => (
        <section key={category.id} className={styles.section}>
          <div className={styles.sectionHead}><h2>{category.name}</h2><span>{category.dishes.length}</span></div>
          {!needle && <AddDishForm categoryId={category.id} categoryName={category.name} />}
          <div className={styles.grid}>
            {category.dishes.map((dish) => (
              <DishRow key={dish.id} dish={dish} categoryName={category.name} />
            ))}
          </div>
        </section>
      ))}
      {visible.length === 0 && <p className={styles.empty}>По этому запросу блюд нет.</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newCategory.trim()) return;
          startTransition(async () => {
            setError("");
            try { await addCategory(newCategory.trim()); setNewCategory(""); router.refresh(); }
            catch (cause) { setError(errorText(cause)); }
          });
        }}
        className={styles.addCategory}
      >
        <div><h2>Новая категория</h2><p>Создайте раздел, затем добавьте в него блюда.</p></div>
        <input
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="Новая категория"
          className="flex-1 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
        />
        <button disabled={pending} className="min-h-11 px-5 rounded-full bg-accent text-white font-medium disabled:opacity-50">
          Добавить
        </button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

function DishRow({ dish, categoryName }: { dish: Dish; categoryName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => draftFromDish(dish));
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <article className={`${styles.dishCard} ${editing ? styles.isEditing : ""}`} aria-label={dish.name}>
      <button
        onClick={() => fileRef.current?.click()}
        title={dish.image ? "Заменить фото" : "Добавить фото"}
        aria-label={`${dish.image ? "Заменить" : "Добавить"} фото блюда ${dish.name}`}
        disabled={pending}
        className={styles.dishPhoto}
      >
        {dish.image ? (
          <img src={dishImageUrl(dish.image, "sm")} alt={dish.name} loading="lazy" className={styles.dishImage} />
        ) : (
          <span className={styles.dishPlaceholder}>Фото не добавлено</span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError("");
          try { await uploadDishPhoto(dish.id, file); router.refresh(); }
          catch (cause) { setError(errorText(cause)); }
          e.target.value = "";
        }}
      />

      {editing ? (
        <form className={`${styles.dishBody} ${styles.editForm}`} onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setError("");
            try { await updateDish(dish.id, form); setEditing(false); router.refresh(); }
            catch (cause) { setError(errorText(cause)); }
          });
        }}>
          <label>Название<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></label>
          <div className={styles.formRow}>
            <label>Режим цены<select value={form.priceMode} onChange={(e) => setForm({ ...form, priceMode: e.target.value as typeof form.priceMode })}>
              <option value="inherit">Общая настройка</option>
              <option value="yandex" disabled={dish.yandexPrice === null}>Цена Яндекс.Еды</option>
              <option value="manual">Ручная цена</option>
              <option value="coefficient" disabled={dish.yandexPrice === null}>Яндекс ± %</option>
            </select></label>
            {form.priceMode === "manual" && <label>Цена на витрине, ₽<input type="number" min={0} max={1000000} step={1} required value={form.manualPrice ?? ""} onChange={(e) => setForm({ ...form, manualPrice: e.target.value === "" ? null : Number(e.target.value) })}/></label>}
            {form.priceMode === "coefficient" && <label>Цена Яндекс ± %<input type="number" min={-100} max={500} value={form.coefficientPercent ?? ""} onChange={(e) => setForm({ ...form, coefficientPercent: e.target.value === "" ? null : Number(e.target.value) })}/></label>}
            <label>Вес / объём<input value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} maxLength={50}/></label>
          </div>
          <p className={styles.priceNote}>{dish.yandexPrice !== null ? `Яндекс: ${dish.yandexPrice} ₽ · ` : ""}Итог на витрине: {dish.price} ₽</p>
          <label>Описание<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}/></label>
          <label>Состав<textarea value={form.composition} onChange={(e) => setForm({ ...form, composition: e.target.value })} rows={2}/></label>
          <p className={styles.priceNote}>Фото можно заменить нажатием на изображение выше.</p>
          <div className={styles.formActions}>
            <button type="submit" disabled={pending} className={styles.primaryButton}>Сохранить</button>
            <button type="button" onClick={() => setEditing(false)} className={styles.outlineButton}>Отмена</button>
            <button type="button" disabled={pending} onClick={() => {
              if (confirm(`Удалить «${dish.name}»?`)) startTransition(async () => {
                setError("");
                try { await deleteDish(dish.id); router.refresh(); }
                catch (cause) { setError(errorText(cause)); }
              });
            }} className={styles.deleteButton}>Удалить</button>
          </div>
        </form>
      ) : (
        <div className={styles.dishBody}>
          <span className={styles.eyebrow}>{categoryName}</span>
          <h3 className={styles.dishTitle}>{dish.name}</h3>
          <p className={styles.dishDescription}>{dish.description || "Описание не указано"}</p>
          <div className={styles.dishBottom}><span>{dish.weight || "Вес не указан"}</span><strong>{dish.price.toLocaleString("ru-RU")} ₽</strong></div>
          <div className={styles.dishActions}>
            <button type="button" onClick={() => { setForm(draftFromDish(dish)); setEditing(true); }} className={styles.outlineButton}>
              Править
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => { setError(""); try { await updateDish(dish.id, { manualAvailable: !dish.manualAvailable }); router.refresh(); } catch (cause) { setError(errorText(cause)); } })}
              className={`${styles.availability} ${dish.available ? "" : styles.unavailable}`}
              aria-label={`${dish.manualAvailable ? "Поставить на стоп" : "Снять со стопа"}: ${dish.name}`}
              title={dish.manualAvailable ? "Поставить на стоп вручную" : "Вернуть в меню"}
            >
              {dish.available ? "В наличии" : "Нет в наличии"}
            </button>
          </div>
          {!dish.available && <p className={styles.availabilityNote}>Недоступно на витрине{dish.manualAvailable ? " по данным Яндекс.Еды" : ""}</p>}
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </article>
  );
}

function AddDishForm({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", price: 0, weight: "", composition: "", description: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <><button onClick={() => { setError(""); setOpen(true); }} className={styles.addDishButton}>
        + Блюдо
      </button>{error && <p className={styles.error} role="alert">{error}</p>}</>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError("");
          let createdId: string | null = null;
          try {
            createdId = await addDish({ categoryId, ...form });
            if (photo) await uploadDishPhoto(createdId, photo);
            setOpen(false);
            setPhoto(null);
            setForm({ name: "", price: 0, weight: "", composition: "", description: "" });
            router.refresh();
          } catch (cause) {
            setError(createdId ? `Блюдо добавлено, но фото не сохранилось: ${errorText(cause)}. Загрузите фото в карточке блюда.` : errorText(cause));
            if (createdId) { setOpen(false); setPhoto(null); setForm({ name: "", price: 0, weight: "", composition: "", description: "" }); }
            router.refresh();
          }
        });
      }}
      className={styles.addDishForm}
    >
      <h3>Новое блюдо · {categoryName}</h3>
      <label>Название<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120}/></label>
      <div className={styles.formRow}>
        <label>Цена, ₽<input type="number" min={0} max={1000000} step={1} value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required/></label>
        <label>Вес / объём<input type="text" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} maxLength={50}/></label>
      </div>
      <label>Описание<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}/></label>
      <label>Состав<textarea value={form.composition} onChange={(e) => setForm({ ...form, composition: e.target.value })} rows={2}/></label>
      <label>Фото блюда<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
      <div className={styles.formActions}><button type="submit" disabled={pending} className={styles.primaryButton}>Добавить блюдо</button><button type="button" onClick={() => setOpen(false)} className={styles.outlineButton}>Отмена</button></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  );
}
