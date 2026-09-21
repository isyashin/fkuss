import { z } from "zod";

/** Shared runtime guards for values arriving at admin server actions. */
export const adminMoneySchema = z.number().finite().int().min(0).max(1_000_000);
export const adminPercentSchema = z.number().finite().min(-100).max(500);
export const adminIdSchema = z.string().min(1).max(128);
export const adminTextSchema = z.string().max(5_000);
export const adminShortTextSchema = z.string().min(1).max(200);
export const adminUrlSchema = z.string().url().max(2_048);

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Некорректное время");

export const daysSchema = z.array(z.number().finite().int().min(0).max(6)).max(7);

function rejectNonFinite(value: unknown, path: string): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${path}: число должно быть конечным`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectNonFinite(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) rejectNonFinite(item, `${path}.${key}`);
  }
}

export function parseAdminInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.parse(input);
  rejectNonFinite(parsed, "input");
  return parsed;
}
