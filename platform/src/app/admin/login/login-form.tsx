"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setError("");
        const ok = await loginAction(password);
        setSending(false);
        if (ok) router.push("/admin");
        else setError("Неверный пароль");
      }}
    >
      <label>
        Пароль платформы
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          className="pf-input"
          required
        />
      </label>
      {error && <p role="alert" style={{ color: "var(--pf-red)", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="submit" className="pf-btn pf-btnPrimary" disabled={sending || !password}>
        {sending ? "Вхожу…" : "Войти"}
      </button>
    </form>
  );
}
