/**
 * Живой бейдж на фавиконе вкладки: красный кружок со счётом новых
 * заказов+броней, мигает, пока есть необработанные события; префикс "(N)"
 * в заголовке вкладки. Только для админки (на витрине не подключаем).
 */
const CANVAS_SIZE = 48;
const BLINK_MS = 900;

let baseHrefs: string[] = [];
let baseImage: HTMLImageElement | null = null;
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

function loadBaseImage(): Promise<HTMLImageElement | null> {
  if (baseImage) return Promise.resolve(baseImage);
  const href = baseHrefs[0];
  if (!href) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { baseImage = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = href;
  });
}

function drawBadge(count: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return badgeUrl;
  if (baseImage) ctx.drawImage(baseImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const label = count > 9 ? "9+" : String(count);
  const radius = label.length > 1 ? 12 : 10;
  const cx = CANVAS_SIZE - radius - 1;
  const cy = CANVAS_SIZE - radius - 1;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#d92d20";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${label.length > 1 ? 11 : 13}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 0.5);

  return canvas.toDataURL("image/png");
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

  const img = await loadBaseImage();
  if (!img) return;
  badgeUrl = drawBadge(count);

  if (originalTitle && !document.title.startsWith("(")) originalTitle = document.title;
  document.title = `(${count}) ${originalTitle}`;

  if (blinkTimer === null) {
    badgeVisible = true;
    applyHrefs(badgeUrl);
    blinkTimer = window.setInterval(() => {
      badgeVisible = !badgeVisible;
      applyHrefs(badgeVisible ? badgeUrl : baseHrefs[0]);
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
