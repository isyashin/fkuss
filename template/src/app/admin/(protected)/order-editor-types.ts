export type CatalogModifier = { id: string; name: string; price: number };
export type CatalogGroup = { id: string; name: string; minSelected: number; maxSelected: number; modifiers: CatalogModifier[] };
export type CatalogDish = { id: string; name: string; price: number; modifiers: CatalogModifier[]; groups: CatalogGroup[] };
export type CatalogCategory = { id: string; name: string; dishes: CatalogDish[] };
export type DeliveryOptionChoice = { id: string; name: string };
export type DeliveryZoneChoice = { name: string };
