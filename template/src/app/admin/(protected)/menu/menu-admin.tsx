"use client";

import { useRef, useState, useTransition } from "react";
import { addCategory, addDish, deleteDish, updateDish } from "./actions";
import { dishImageUrl } from "@/lib/assets";
import type { Category, Dish } from "@/generated/prisma/client";

export function MenuAdmin({ categories }: { categories: (Category & { dishes: Dish[] })[] }) {
  const [newCategory, setNewCategory] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <section key={category.id}>
          <h2 className="text-xl mb-3">{category.name}</h2>
          <div className="space-y-2">
            {category.dishes.map((dish) => (
              <DishRow key={dish.id} dish={dish} />
            ))}
          </div>
          <AddDishForm categoryId={category.id} />
        </section>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newCategory.trim()) return;
          startTransition(async () => {
            await addCategory(newCategory.trim());
            setNewCategory("");
          });
        }}
        className="flex gap-2"
      >
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
    </div>
  );
}

function DishRow({ dish }: { dish: Dish }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: dish.name,
    price: dish.price,
    weight: dish.weight,
    description: dish.description,
    priceMode: dish.priceMode as "inherit" | "yandex" | "manual" | "coefficient",
    manualPrice: dish.manualPrice,
    coefficientPercent: dish.coefficientPercent,
  });
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-card rounded-[var(--radius)] p-3 flex gap-3 items-start">
      <button
        onClick={() => fileRef.current?.click()}
        title="Заменить фото"
        className="relative w-16 h-16 rounded-lg overflow-hidden bg-foreground/5 shrink-0"
      >
        {dish.image ? (
          <img src={dishImageUrl(dish.image, "sm")} alt={dish.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted text-xs">+ фото</span>
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
          const fd = new FormData();
          fd.append("file", file);
          fd.append("section", "dishes");
          fd.append("name", dish.id);
          const response = await fetch("/api/admin/upload", { method: "POST", body: fd });
          const data = await response.json();
          if (response.ok) {
            startTransition(() => updateDish(dish.id, { name: dish.name })); // триггер ревалидации
            await updateDish(dish.id, {});
            // обновляем путь картинки в БД
            await fetch("/api/admin/dish-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dishId: dish.id, image: data.path }),
            });
            location.reload();
          }
        }}
      />

      {editing ? (
        <div className="flex-1 space-y-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15"
          />
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={form.priceMode}
              onChange={(e) => setForm({ ...form, priceMode: e.target.value as typeof form.priceMode })}
              className="min-h-11 px-2 rounded-[var(--radius)] border border-foreground/15"
              title="Режим цены"
            >
              <option value="inherit">Общая настройка</option>
              <option value="yandex" disabled={dish.yandexPrice === null}>Цена Яндекс.Еды</option>
              <option value="manual">Ручная цена</option>
              <option value="coefficient" disabled={dish.yandexPrice === null}>Яндекс ± %</option>
            </select>
            {form.priceMode === "manual" && (
              <input
                type="number"
                min={0}
                value={form.manualPrice ?? ""}
                onChange={(e) => setForm({ ...form, manualPrice: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="Ручная ₽"
                className="w-28 min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15"
              />
            )}
            {form.priceMode === "coefficient" && (
              <input
                type="number"
                value={form.coefficientPercent ?? ""}
                onChange={(e) => setForm({ ...form, coefficientPercent: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="% (пусто = общий)"
                className="w-36 min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15"
              />
            )}
            <input
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
              placeholder="Вес"
              className="w-24 min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15"
            />
          </div>
          <p className="text-xs text-muted">
            {dish.yandexPrice !== null ? `Яндекс: ${dish.yandexPrice} ₽ · ` : ""}Итог на витрине: {dish.price} ₽
          </p>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 rounded-[var(--radius)] border border-foreground/15"
          />
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await updateDish(dish.id, form);
                  setEditing(false);
                })
              }
              className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50"
            >
              Сохранить
            </button>
            <button onClick={() => setEditing(false)} className="min-h-11 px-4 rounded-full border border-foreground/20 text-sm">
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex justify-between gap-2 items-baseline">
            <p className="font-medium">{dish.name}</p>
            <p className="text-accent font-semibold">{dish.price.toLocaleString("ru-RU")} ₽</p>
          </div>
          <p className="text-muted text-sm">{dish.weight}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            <button onClick={() => setEditing(true)} className="min-h-11 px-4 rounded-full border border-foreground/20 text-sm">
              Править
            </button>
            <button
              disabled={pending}
              onClick={() => startTransition(() => updateDish(dish.id, { available: !dish.available }))}
              className={`min-h-11 px-4 rounded-full text-sm ${dish.available ? "border border-foreground/20" : "bg-foreground/10 text-muted"}`}
            >
              {dish.available ? "В наличии" : "Нет в наличии"}
            </button>
            <button
              disabled={pending}
              onClick={() => {
                if (confirm(`Удалить «${dish.name}»?`)) startTransition(() => deleteDish(dish.id));
              }}
              className="min-h-11 px-4 rounded-full border border-red-300 text-red-600 text-sm"
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddDishForm({ categoryId }: { categoryId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", price: 0, weight: "", description: "" });
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 min-h-11 px-4 rounded-full border border-dashed border-foreground/30 text-sm text-muted">
        + Блюдо
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await addDish({ categoryId, ...form });
          setOpen(false);
          setForm({ name: "", price: 0, weight: "", description: "" });
        });
      }}
      className="mt-3 bg-card rounded-[var(--radius)] p-3 space-y-2"
    >
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Название"
        required
        className="w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15"
      />
      <input
        type="number"
        min={0}
        value={form.price || ""}
        onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
        placeholder="Цена ₽"
        required
        className="w-32 min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15"
      />
      <button disabled={pending} className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50">
        Добавить блюдо
      </button>
    </form>
  );
}
