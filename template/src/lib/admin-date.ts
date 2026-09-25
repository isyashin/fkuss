/** Stable across server and browser, with the restaurant's local time. */
export function formatAdminDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}.${part("year")}, ${part("hour")}:${part("minute")}`;
}
