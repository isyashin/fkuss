"use client";

import { useRouter } from "next/navigation";
import { confirmDiscard } from "../admin-dirty";
import styles from "./settings-redesign.module.css";

/** Мобильный выбор раздела настроек (F15): на ≤900px вместо горизонтальной
    ленты из 19 ссылок — один список с группами, по макету прототипа. */
export function SectionPicker({ groups, active }: {
  groups: { group: string; items: { id: string; title: string }[] }[];
  active: string;
}) {
  const router = useRouter();
  return (
    <label className={styles.picker}>
      <span className="sr-only">Раздел настроек</span>
      <select
        className={styles.pickerSelect}
        value={active}
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
  );
}
