import { contactLinks, preferredChannelSchema, type GuestChannels } from "@/lib/guest-contact";
import styles from "./admin-ui.module.css";

export function GuestContactActions({ phone, preferredChannel, channels, compact = false, showTelegramHint = true }: {
  phone: string;
  preferredChannel: string | null;
  channels: GuestChannels;
  compact?: boolean;
  showTelegramHint?: boolean;
}) {
  const parsed = preferredChannelSchema.safeParse(preferredChannel);
  const preferred = parsed.success ? parsed.data : null;
  const links = contactLinks(phone, preferred, channels);
  const primary = links[0];
  // N03: основное действие — именно звонок (tel:), даже если у гостя выбран
  // мессенджер: подпись «Позвонить» не должна вести на wa.me.
  const digits = phone.replace(/[^+\d]/g, "");
  const telHref = digits.length >= 6 ? `tel:${digits}` : (primary?.href ?? null);
  if (compact) {
    if (!primary) return null;
    return <a className={styles.contactIcon} href={telHref ?? primary.href} target={primary.channel === "phone" ? undefined : "_blank"}
      rel={primary.channel === "phone" ? undefined : "noopener noreferrer"} aria-label={`Позвонить: ${phone}`} title="Позвонить">
      {primary.channel === "whatsapp" ? "WA" : primary.channel === "telegram" ? "TG" : "☎"}
    </a>;
  }
  return <div className={styles.contactDetails}>
    {telHref ? <a className={styles.contactPhone} href={telHref}
      aria-label={`Позвонить: ${phone}`}>{`Позвонить · ${phone}`}</a>
      : <span className={styles.contactPhone}>{phone || "Не указан"}</span>}
    {links.length > 0 && <div className={styles.contactLinks}>{links.filter((link) => link.channel !== "phone").map((link) => <a key={link.channel} href={link.href}
      target={link.channel === "phone" ? undefined : "_blank"} rel={link.channel === "phone" ? undefined : "noopener noreferrer"}
      title={link.channel === "telegram" ? "Ссылка сработает, если гость разрешил поиск по номеру в Telegram" : undefined}>
      {link.label}
    </a>)}</div>}
    {showTelegramHint && links.some((link) => link.channel === "telegram") && <small>Поиск в Telegram зависит от настроек приватности гостя.</small>}
    {preferred && preferred !== "phone" && !links.length && <small>Выбранный канал скрыт или номер некорректен</small>}
    {preferred === null && !links.length && phone && <small>Некорректный номер для ссылки</small>}
  </div>;
}
