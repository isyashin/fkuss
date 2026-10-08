/** Ключ строки черновика состава заказа.
    crypto.randomUUID недоступен вне secure context (HTTP-стенды, аудит F02) —
    используем getRandomValues, который работает везде. */

export function draftLineKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
