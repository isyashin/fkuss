"use client";

import { useEffect, useRef } from "react";
import rd from "./admin-redesign.module.css";

export type ConfirmRequest = {
  title: string;
  text: string;
  acceptLabel?: string;
  danger?: boolean;
  onAccept: () => void;
};

/** Фирменный диалог подтверждения деструктивных действий (вместо window.confirm). */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog ref={ref} className={rd.dialog} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
      {request && (
        <div className={rd.dialogBody}>
          <h2 className={rd.dialogTitle}>{request.title}</h2>
          <p className={rd.dialogText}>{request.text}</p>
          <div className={rd.dialogActions}>
            <button type="button" className={rd.btn} onClick={onClose}>Отмена</button>
            <button
              type="button"
              className={`${rd.btn} ${rd.btnPrimary}`}
              autoFocus
              onClick={() => { request.onAccept(); onClose(); }}
            >
              {request.acceptLabel ?? request.title.replace(/\?$/, "")}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
