/** Stable across server and browser, with the restaurant's local time. */
export function formatAdminDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}.${part("year")}, ${part("hour")}:${part("minute")}`;
}

/** Время заказа в TZ ресторана (список заказов). Некорректная TZ —
    как в nowInTimeZone — откатывается к Europe/Moscow. */
export function formatAdminTime(date: Date, timeZone: string): string {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "Europe/Moscow";
  }
  return new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(date);
}
