"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await loginAction(password);
        if (ok) router.push("/admin");
        else setError("Неверный пароль");
      }}
      className="space-y-4"
    >
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        className="w-full min-h-11 px-3 rounded-lg border border-zinc-300"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" className="w-full min-h-12 rounded-full bg-zinc-900 text-white font-medium">
        Войти
      </button>
    </form>
  );
}
