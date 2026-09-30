/**
 * Живой бейдж на фавиконе вкладки: красный кружок со счётом новых
 * заказов+броней, мигает, пока есть необработанные события; префикс "(N)"
 * в заголовке вкладки. Только для админки (на витрине не подключаем).
 */
const CANVAS_SIZE = 48;
const BLINK_MS = 900;

let baseHrefs: string[] = [];
let badgeUrl = "";
let originalTitle = "";
let blinkTimer: number | null = null;
let badgeVisible = false;
let currentCount = 0;

function iconLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
}

function applyHrefs(href: string) {
  for (const link of iconLinks()) link.href = href;
}

/** Индикатор на ВЕСЬ фавикон: красный круг по холсту с крупным счётом — читаемо на 16px. */
function drawBadge(count: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return badgeUrl;

  const c = CANVAS_SIZE / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 1, 0, Math.PI * 2);
  ctx.fillStyle = "#d92d20";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  const label = count > 9 ? "9+" : String(count);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${label.length > 1 ? 24 : 30}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, c, c + 1);

  return canvas.toDataURL("image/png");
}

/** Поддержание префикса "(N)" в заголовке: Next перезаписывает metadata.title при refresh — возвращаем. */
function reassertTitle(): void {
  if (currentCount > 0 && originalTitle) {
    const expected = `(${currentCount}) ${originalTitle}`;
    if (document.title !== expected) document.title = expected;
  }
}

/** Показать/обновить бейдж; count<=0 — снять. */
export async function setFaviconBadge(count: number): Promise<void> {
  if (typeof document === "undefined") return;
  if (baseHrefs.length === 0) {
    baseHrefs = iconLinks().map((link) => link.href);
    if (baseHrefs.length === 0) return;
    originalTitle = document.title;
  }
  currentCount = count;
  if (count <= 0) {
    clearFaviconBadge();
    return;
  }

  badgeUrl = drawBadge(count);
  reassertTitle();

  if (blinkTimer === null) {
    badgeVisible = true;
    applyHrefs(badgeUrl);
    blinkTimer = window.setInterval(() => {
      badgeVisible = !badgeVisible;
      applyHrefs(badgeVisible ? badgeUrl : baseHrefs[0]);
      reassertTitle();
    }, BLINK_MS);
  }
}

/** Снять бейдж и вернуть заголовок. */
export function clearFaviconBadge(): void {
  if (typeof document === "undefined") return;
  if (blinkTimer !== null) {
    window.clearInterval(blinkTimer);
    blinkTimer = null;
  }
  badgeVisible = false;
  currentCount = 0;
  if (baseHrefs.length > 0) applyHrefs(baseHrefs[0]);
  if (originalTitle) document.title = originalTitle;
}

export function faviconBadgeCount(): number {
  return currentCount;
}
