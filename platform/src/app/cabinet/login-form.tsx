"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestCodeAction, verifyCodeAction } from "./actions";

export function OwnerLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  const inputCls = "w-full min-h-11 px-3 rounded-lg border border-zinc-300";

  return (
    <div className="space-y-4 max-w-sm">
      {step === "email" ? (
        <>
          <p className="text-zinc-500">Введите email — пришлём код входа.</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.ru"
            className={inputCls}
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={async () => {
              setError("");
              const result = await requestCodeAction(email);
              if (result.error) {
                setError(result.error);
                return;
              }
              if (result.devCode) setDevCode(result.devCode);
              setStep("code");
            }}
            className="w-full min-h-12 rounded-full bg-zinc-900 text-white font-medium"
          >
            Получить код
          </button>
        </>
      ) : (
        <>
          <p className="text-zinc-500">
            Код отправлен на {email}.
            {devCode && <span className="block font-mono mt-1">DEV: {devCode}</span>}
          </p>
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono`}
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={async () => {
              setError("");
              const result = await verifyCodeAction(email, code);
              if (result.ok) router.refresh();
              else setError(result.reason ?? "Ошибка");
            }}
            className="w-full min-h-12 rounded-full bg-zinc-900 text-white font-medium"
          >
            Войти
          </button>
        </>
      )}
    </div>
  );
}
