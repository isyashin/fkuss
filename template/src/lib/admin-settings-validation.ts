import { settingsSchema, themeSchema } from "./content-schema";
import { deliveryGeoMode, GEO_CONFIGURATION_ERROR } from "./delivery/geo-policy";

const themeMutationSchema = themeSchema.pick({ preset: true, accent: true });

/** Проверка серверных изменений, включая суммы доставки и лимиты бонусов. */
export function validateSettingsMutation(input: unknown) {
  const settings = settingsSchema.parse(input);
  if (deliveryGeoMode(settings.delivery) === "invalid") throw new Error(GEO_CONFIGURATION_ERROR);
  return settings;
}

export function validatePreOrderMutation(input: unknown) {
  return settingsSchema.shape.preOrder.parse(input);
}

export function validateThemeMutation(input: unknown) {
  return themeMutationSchema.parse(input);
}

export function validateBackgroundMutation(input: unknown) {
  return themeSchema.shape.background.parse(input);
}
