"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setError("");
        const ok = await loginAction(login, password);
        setSending(false);
        if (ok) {
          router.push("/admin");
        } else {
          setError("Неверный логин или пароль");
        }
      }}
      className="space-y-4"
    >
      <input
        type="text"
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        placeholder="Логин"
        aria-label="Логин"
        autoComplete="username"
        required
        className="w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        aria-label="Пароль"
        required
        autoComplete="current-password"
        className="w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={sending || !login || !password}
        className="w-full min-h-12 rounded-full bg-accent text-white font-medium disabled:opacity-50"
      >
        {sending ? "Вхожу…" : "Войти"}
      </button>
    </form>
  );
}
