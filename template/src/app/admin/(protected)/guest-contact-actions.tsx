import { contactLinks, preferredChannelSchema, type GuestChannels } from "@/lib/guest-contact";
import styles from "./admin-ui.module.css";

export function GuestContactActions({ phone, preferredChannel, channels, compact = false }: {
  phone: string;
  preferredChannel: string | null;
  channels: GuestChannels;
  compact?: boolean;
}) {
  const parsed = preferredChannelSchema.safeParse(preferredChannel);
  const preferred = parsed.success ? parsed.data : null;
  const links = contactLinks(phone, preferred, channels);
  const primary = links[0];
  if (compact) {
    if (!primary) return null;
    return <a className={styles.contactIcon} href={primary.href} target={primary.channel === "phone" ? undefined : "_blank"}
      rel={primary.channel === "phone" ? undefined : "noopener noreferrer"} aria-label={`${primary.label}: ${phone}`} title={primary.label}>
      {primary.channel === "whatsapp" ? "WA" : primary.channel === "telegram" ? "TG" : "☎"}
    </a>;
  }
  return <div className={styles.contactDetails}>
    {primary ? <a className={styles.contactPhone} href={primary.href} target={primary.channel === "phone" ? undefined : "_blank"}
      rel={primary.channel === "phone" ? undefined : "noopener noreferrer"} aria-label={`${primary.label}: ${phone}`}>{phone}</a>
      : <span className={styles.contactPhone}>{phone || "Не указан"}</span>}
    {links.length > 0 && <div className={styles.contactLinks}>{links.map((link) => <a key={link.channel} href={link.href}
      target={link.channel === "phone" ? undefined : "_blank"} rel={link.channel === "phone" ? undefined : "noopener noreferrer"}
      title={link.channel === "telegram" ? "Ссылка сработает, если гость разрешил поиск по номеру в Telegram" : undefined}>
      {link.label}
    </a>)}</div>}
    {links.some((link) => link.channel === "telegram") && <small>Поиск в Telegram зависит от настроек приватности гостя.</small>}
    {preferred && preferred !== "phone" && !links.length && <small>Выбранный канал скрыт или номер некорректен</small>}
    {preferred === null && !links.length && phone && <small>Некорректный номер для ссылки</small>}
  </div>;
}
