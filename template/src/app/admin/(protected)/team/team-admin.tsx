"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeTeamUser, createTeamUser } from "./actions";
import type { AdminRole } from "@/lib/admin-users";
import styles from "./team-admin.module.css";

type TeamUser = { id: string; login: string; name: string; role: string; active: boolean; updatedAt: Date };

function TeamRow({ user }: { user: TeamUser }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<AdminRole>(user.role === "owner" ? "owner" : "staff");
  const [active, setActive] = useState(user.active);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setSaved(false);
    startTransition(async () => {
      try {
        await changeTeamUser(user.id, { name, role, active, ...(password ? { password } : {}) });
        setPassword(""); setSaved(true); router.refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить сотрудника"); }
    });
  };
  return <form className={styles.row} onSubmit={save}>
    <div className={styles.rowTitle}><strong>{user.login}</strong><span>{user.active ? "Активен" : "Отключён"}</span></div>
    <div className={styles.fields}>
      <label>Имя<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={pending}/></label>
      <label>Роль<select value={role} onChange={(event) => setRole(event.target.value as AdminRole)} disabled={pending}><option value="staff">Сотрудник · заказы и брони</option><option value="owner">Владелец · все разделы</option></select></label>
      <label>Новый пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={200} autoComplete="new-password" placeholder="Оставьте пустым без смены" disabled={pending}/></label>
    </div>
    <div className={styles.rowFooter}><label className={styles.check}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={pending}/>Доступ разрешён</label><button type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{saved && <p className={styles.success} role="status">Изменения сохранены</p>}
  </form>;
}

export function TeamAdmin({ users }: { users: TeamUser[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AdminRole>("staff");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const create = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    startTransition(async () => {
      try {
        await createTeamUser({ login, name, role, password });
        setLogin(""); setName(""); setPassword(""); setRole("staff"); router.refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить сотрудника"); }
    });
  };
  return <div className={styles.page}>
    <section><h2>Новый сотрудник</h2><form className={styles.create} onSubmit={create}>
      <label>Логин<input value={login} onChange={(event) => setLogin(event.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,49}" maxLength={50} autoComplete="off" required disabled={pending}/></label>
      <label>Имя<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={pending}/></label>
      <label>Роль<select value={role} onChange={(event) => setRole(event.target.value as AdminRole)} disabled={pending}><option value="staff">Сотрудник · заказы и брони</option><option value="owner">Владелец · все разделы</option></select></label>
      <label>Личный пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={200} autoComplete="new-password" required disabled={pending}/></label>
      <button type="submit" disabled={pending}>{pending ? "Добавляем…" : "Добавить сотрудника"}</button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form></section>
    <section><h2>Учётные записи</h2><div className={styles.list}>{users.map((user) => <TeamRow key={`${user.id}:${user.updatedAt.toISOString()}`} user={user}/>)}</div></section>
  </div>;
}
