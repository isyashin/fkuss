"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmDiscard } from "../admin-dirty";
import styles from "./settings-redesign.module.css";

/** Мобильный выбор раздела настроек (F15): вместо нативного <select> —
    bottom-sheet в дизайне админки (нативный список ОС выбивался из темы).
    Нативный select остаётся скрытым: доступность и e2e (getByLabel+value). */
export function SectionPicker({ groups, active }: {
  groups: { group: string; items: { id: string; title: string }[] }[];
  active: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const activeTitle = groups.flatMap((g) => g.items).find((i) => i.id === active)?.title ?? active;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  function choose(target: string) {
    void confirmDiscard().then((proceed) => {
      setOpen(false);
      if (proceed) router.push(`/admin/settings?section=${encodeURIComponent(target)}`);
    });
  }

  return (
    <div className={styles.picker}>
      <button
        type="button"
        className={styles.pickerSelect}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Открыть список разделов настроек"
        onClick={() => setOpen(true)}
      >
        <span>{activeTitle}</span>
        <span aria-hidden="true" className={styles.pickerChevron}>▾</span>
      </button>
      <label className="sr-only">
        <span>Раздел настроек</span>
        <select
          value={active}
          tabIndex={-1}
          onChange={(event) => {
            const target = event.target.value;
            void confirmDiscard().then((proceed) => {
              if (proceed) router.push(`/admin/settings?section=${encodeURIComponent(target)}`);
              else event.target.value = active;
            });
          }}
        >
          {groups.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {open && (
        <div
          className={styles.sheetOverlay}
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        >
          <div
            ref={sheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Разделы настроек"
            className={styles.sheet}
          >
            <div aria-hidden="true" className={styles.sheetHandle} />
            {groups.map((group) => (
              <div key={group.group}>
                <p className={styles.groupLabel}>{group.group}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.sheetItem} ${item.id === active ? styles.current : ""}`}
                    aria-current={item.id === active ? "page" : undefined}
                    onClick={() => choose(item.id)}
                  >
                    <span>{item.title}</span>
                    {item.id === active && <span aria-hidden="true" className={styles.sheetCheck}>✓</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
