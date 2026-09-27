"use client";

import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import menuSource from "../lib/menu.json";

type PriceMode = "inherit" | "manual" | "yandex" | "coefficient";

export type Dish = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  weight: string;
  description: string;
  composition: string;
  available: boolean;
  priceMode?: PriceMode;
};

type DishDraft = Pick<Dish, "name" | "price" | "weight" | "description" | "composition" | "image"> & { priceMode: PriceMode };
const rub = (n: number) => `${new Intl.NumberFormat("ru-RU").format(n)} ₽`;
const categoriesOf = (dishes: Dish[]) => [...new Set(dishes.map((dish) => dish.category))];

function matches(dish: Dish, query: string, category: string) {
  if (category !== "Все" && dish.category !== category) return false;
  const needle = query.trim().toLocaleLowerCase("ru");
  return !needle || [dish.name, dish.description, dish.category].some((text) => text.toLocaleLowerCase("ru").includes(needle));
}

function readPhoto(file: File, onRead: (image: string) => void) {
  const reader = new FileReader();
  reader.onload = () => { if (typeof reader.result === "string") onRead(reader.result); };
  reader.readAsDataURL(file);
}

function DishPhoto({ image, name }: { image: string; name: string }) {
  return image
    ? <img className="menu-dish-photo" src={image} alt={name} loading="lazy"/>
    : <div className="menu-dish-placeholder" role="img" aria-label={`Нет фото: ${name}`}>Фото не добавлено</div>;
}

export function MenuPanel({ dishes, setDishes, notify }: { dishes: Dish[]; setDishes: Dispatch<SetStateAction<Dish[]>>; notify: (message: string) => void }) {
  const categories = useMemo(() => categoriesOf(dishes), [dishes]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Все");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DishDraft | null>(null);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [newDish, setNewDish] = useState<DishDraft>({ name: "", price: 0, weight: "", description: "", composition: "", image: "", priceMode: "manual" });
  const visible = dishes.filter((dish) => matches(dish, query, category));

  const startEdit = (dish: Dish) => {
    setEditingId(dish.id);
    setDraft({ name: dish.name, price: dish.price, weight: dish.weight, description: dish.description, composition: dish.composition, image: dish.image, priceMode: dish.priceMode ?? "inherit" });
  };

  const saveEdit = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    if (!draft?.name.trim()) return;
    setDishes((prev) => prev.map((dish) => dish.id === id ? { ...dish, ...draft, name: draft.name.trim(), price: Math.max(0, Math.round(draft.price)) } : dish));
    setEditingId(null);
    setDraft(null);
    notify("Блюдо изменено в локальном меню");
  };

  const addDish = (event: FormEvent<HTMLFormElement>, selectedCategory: string) => {
    event.preventDefault();
    if (!newDish.name.trim()) return;
    setDishes((prev) => [...prev, { ...newDish, id: `local-${crypto.randomUUID()}`, category: selectedCategory, name: newDish.name.trim(), price: Math.max(0, Math.round(newDish.price)), available: true }]);
    setNewDish({ name: "", price: 0, weight: "", description: "", composition: "", image: "", priceMode: "manual" });
    setAddingCategory(null);
    setQuery("");
    setCategory(selectedCategory);
    notify("Блюдо добавлено в локальное меню");
  };

  return <div className="subpage menu-page">
    <div className="page-intro"><span className="eyebrow">Каталог</span><h1>Меню</h1><p>Все блюда ресторана. Изменения видны только в этом прототипе.</p></div>
    <div className="menu-toolbar"><label className="search-field"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо или описание" aria-label="Поиск по меню"/></label><span className="count-pill">{visible.length === dishes.length ? `${dishes.length} блюд` : `${visible.length} из ${dishes.length} блюд`}</span></div>
    <div className="menu-categories" role="group" aria-label="Категории меню">
      {["Все", ...categories].map((name) => <button type="button" key={name} className={category === name ? "active" : ""} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}<span>{name === "Все" ? dishes.length : dishes.filter((dish) => dish.category === name).length}</span></button>)}
    </div>
    {categories.filter((name) => category === "Все" || category === name).map((name) => {
      const rows = visible.filter((dish) => dish.category === name);
      if (category === "Все" && rows.length === 0) return null;
      return <section key={name} className="menu-category-section">
        <div className="menu-category-heading"><h2>{name}</h2><span className="count-pill">{rows.length}</span><button type="button" className="outline-button" onClick={() => { setAddingCategory(addingCategory === name ? null : name); setEditingId(null); }}>+ Блюдо</button></div>
        {addingCategory === name && <form className="panel menu-entry-form" onSubmit={(event) => addDish(event, name)}>
          <h3>Новое блюдо · {name}</h3>
          <label>Название<input required maxLength={120} value={newDish.name} onChange={(event) => setNewDish({ ...newDish, name: event.target.value })}/></label>
          <div className="menu-form-row"><label>Цена, ₽<input type="number" min="0" step="1" required value={newDish.price} onChange={(event) => setNewDish({ ...newDish, price: Number(event.target.value) })}/></label><label>Вес / объём<input maxLength={50} value={newDish.weight} onChange={(event) => setNewDish({ ...newDish, weight: event.target.value })}/></label></div>
          <label>Описание<textarea rows={3} value={newDish.description} onChange={(event) => setNewDish({ ...newDish, description: event.target.value })}/></label>
          <label>Состав<textarea rows={2} value={newDish.composition} onChange={(event) => setNewDish({ ...newDish, composition: event.target.value })}/></label>
          <label>Фото<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) readPhoto(file, (image) => setNewDish((prev) => ({ ...prev, image }))); }}/></label>
          <div className="menu-form-actions"><button className="primary-button" type="submit">Добавить блюдо</button><button className="outline-button" type="button" onClick={() => setAddingCategory(null)}>Отмена</button></div>
        </form>}
        {rows.length > 0 ? <div className="menu-grid">{rows.map((dish) => <div className={`panel menu-card ${editingId === dish.id ? "is-editing" : ""}`} key={dish.id}>
          <DishPhoto image={editingId === dish.id && draft ? draft.image : dish.image} name={dish.name}/>
          <div className="menu-card-body">
            {editingId === dish.id && draft ? <form className="menu-entry-form" onSubmit={(event) => saveEdit(event, dish.id)}>
              <label>Название<input required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>
              <div className="menu-form-row"><label>Цена на витрине, ₽<input type="number" min="0" step="1" required value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value), priceMode: "manual" })}/></label><label>Вес / объём<input maxLength={50} value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: event.target.value })}/></label></div>
              <label>Режим цены<select value={draft.priceMode} onChange={(event) => { const mode = event.target.value as PriceMode; const baseline = (menuSource as Dish[]).find((item) => item.id === dish.id)?.price ?? dish.price; setDraft({ ...draft, priceMode: mode, price: mode === "inherit" ? baseline : draft.price }); }}><option value="inherit">Общая настройка</option><option value="yandex" disabled>Цена Яндекс.Еды</option><option value="manual">Ручная цена</option><option value="coefficient" disabled>Яндекс ± %</option></select></label>
              <p className="menu-form-note">Текущая цена Яндекс.Еды недоступна в локальном прототипе. Режимы Яндекса выключены; ручная цена меняет только демо-данные.</p>
              <label>Описание<textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label>
              <label>Состав<textarea rows={2} value={draft.composition} onChange={(event) => setDraft({ ...draft, composition: event.target.value })}/></label>
              <label>Фото<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) readPhoto(file, (image) => setDraft((prev) => prev ? { ...prev, image } : prev)); }}/></label>
              <div className="menu-form-actions"><button className="primary-button" type="submit">Сохранить</button><button className="outline-button" type="button" onClick={() => { setEditingId(null); setDraft(null); }}>Отмена</button></div>
            </form> : <><span className="eyebrow">{dish.category}</span><h3 className="menu-card-title">{dish.name}</h3><p className="menu-card-description">{dish.description || "Описание не указано"}</p><div className="menu-card-bottom"><span>{dish.weight || "Вес не указан"}</span><strong>{rub(dish.price)}</strong></div><div className="menu-card-actions"><button type="button" className="outline-button" onClick={() => startEdit(dish)}>Править</button><button type="button" className={`availability ${dish.available ? "" : "off"}`} aria-label={`${dish.available ? "Поставить на стоп" : "Снять со стопа"}: ${dish.name}`} onClick={() => setDishes((prev) => prev.map((item) => item.id === dish.id ? { ...item, available: !item.available } : item))}>{dish.available ? "В наличии" : "Нет в наличии"}</button></div></>}
          </div>
        </div>)}</div> : <p className="muted">По этому запросу блюд нет.</p>}
      </section>;
    })}
    {visible.length === 0 && category === "Все" && <p className="muted">По этому запросу блюд нет.</p>}
  </div>;
}

export function OrderDishPicker({ dishes, orderId, onPick, onClose }: { dishes: Dish[]; orderId: number; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Все");
  const categories = useMemo(() => categoriesOf(dishes), [dishes]);
  const rows = dishes.filter((dish) => matches(dish, query, category));
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="add-modal" role="dialog" aria-modal="true" aria-label="Добавить блюдо в заказ">
    <div className="section-heading"><div><span className="eyebrow">Заказ № {orderId}</span><h2>Добавить блюдо</h2></div><button className="icon-button" aria-label="Закрыть" onClick={onClose}>×</button></div>
    <p className="menu-form-note">Выберите готовую позицию из меню ресторана. Редактирование блюд доступно в разделе «Меню».</p>
    <label className="search-field picker-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо" aria-label="Поиск блюда для заказа"/></label>
    <div className="picker-categories" role="group" aria-label="Категория блюда">{["Все", ...categories].map((name) => <button type="button" key={name} className={category === name ? "active" : ""} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <div className="add-list">{rows.length ? rows.map((dish) => <button key={dish.id} disabled={!dish.available} aria-label={`${dish.available ? "Добавить" : "Нет в наличии"}: ${dish.name}, ${rub(dish.price)}`} onClick={() => onPick(dish.id)}><DishPhoto image={dish.image} name={dish.name}/><span><strong>{dish.name}</strong><small>{dish.category} · {dish.weight || "Вес не указан"}{dish.available ? "" : " · Нет в наличии"}</small></span><b>{rub(dish.price)}</b></button>) : <p className="muted">По этому запросу блюд нет.</p>}</div>
  </div></div>;
}
