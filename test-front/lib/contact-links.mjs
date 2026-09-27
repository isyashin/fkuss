export function normalizePhoneNumber(phone) {
  const value = phone.trim();
  const digits = value.replace(/\D/g, "");
  if (!value.startsWith("+") && /^8\d{10}$/.test(digits)) return `7${digits.slice(1)}`;
  if (!value.startsWith("+") && /^9\d{9}$/.test(digits)) return `7${digits}`;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}
