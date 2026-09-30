import { settingsSchema, themeSchema } from "./content-schema";

const themeMutationSchema = themeSchema.pick({ preset: true, accent: true });

/** Проверка серверных изменений, включая суммы доставки и лимиты бонусов. */
export function validateSettingsMutation(input: unknown) {
  return settingsSchema.parse(input);
}

export function validateThemeMutation(input: unknown) {
  return themeMutationSchema.parse(input);
}

export function validateBackgroundMutation(input: unknown) {
  return themeSchema.shape.background.parse(input);
}
