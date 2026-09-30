"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "./actions";
import styles from "./login.module.css";

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
      className={styles.form}
    >
      <label>Логин<input
        type="text"
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        placeholder="Логин"
        aria-label="Логин"
        autoComplete="username"
        required
        className={styles.input}
      /></label>
      <label>Пароль<input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        aria-label="Пароль"
        required
        autoComplete="current-password"
        className={styles.input}
      /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button
        type="submit"
        disabled={sending || !login || !password}
        className={styles.submit}
      >
        {sending ? "Вхожу…" : "Войти"}
      </button>
    </form>
  );
}
