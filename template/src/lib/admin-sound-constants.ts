/** Лимиты повторов сигнала о новом заказе/брони (клиент+сервер, без зависимостей).
    0 — бесконечная серия: сигнал идёт, пока заказ/бронь не примут. */
export const MIN_SOUND_REPEATS = 0;
export const MAX_SOUND_REPEATS = 20;
export const DEFAULT_SOUND_REPEATS = 10;
/** Значение счётчика alertLoop.remaining для бесконечной серии (repeats=0). */
export const SOUND_REPEAT_UNTIL_ACCEPTED = -1;
