"use client";

import { useState, useTransition } from "react";
import { setNotifyChannelAction } from "./actions";

export function NotifyChannelSettings({ initialChannel, initialChatId }: { initialChannel: string; initialChatId: string }) {
  const [channel, setChannel] = useState(initialChannel === "telegram" ? "telegram" : "email");
  const [chatId, setChatId] = useState(initialChatId);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <div className="pf-field">
        <span>Канал уведомлений о балансе</span>
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setSaved(false); }} className="pf-select" aria-label="Канал уведомлений">
          <option value="email">Email</option>
          <option value="telegram">Telegram</option>
        </select>
      </div>
      {channel === "telegram" && (
        <div className="pf-field">
          <span>Chat id Telegram (узнайте у @userinfobot)</span>
          <input value={chatId} onChange={(e) => { setChatId(e.target.value); setSaved(false); }} className="pf-input"
            placeholder="123456789" inputMode="numeric" aria-label="Telegram chat id" />
        </div>
      )}
      <div className="pf-actionsRow">
        <button type="button" className="pf-btn pf-btnPrimary" disabled={pending}
          onClick={() => startTransition(async () => {
            setError("");
            const result = await setNotifyChannelAction(channel, chatId);
            if (result.ok) setSaved(true);
            else setError(result.error ?? "Не сохранилось");
          })}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
        {saved && <span className="pf-note" role="status">Сохранено ✓</span>}
        {error && <span role="alert" style={{ color: "var(--pf-red)", fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  );
}
