import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSiteRestaurant, getSiteSettings } from "@/lib/site";
import {
  printFileStem,
  printMaterialDesignSchema,
  withCanonicalQrUrl,
} from "@/lib/print-materials";
import { exportPrintMaterial } from "@/lib/print-materials-server";

export const runtime = "nodejs";

const requestSchema = z.object({
  design: printMaterialDesignSchema,
  format: z.enum(["svg", "png", "pdf"]),
});

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_ACTIVE_EXPORTS = 2;
let activeExports = 0;

class PayloadTooLargeError extends Error {}

async function readLimitedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new PayloadTooLargeError();
  }
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`print-export:${ip}`, 8, 60_000)) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }
  if (activeExports >= MAX_ACTIVE_EXPORTS) {
    return NextResponse.json({ error: "Экспорт уже выполняется, попробуйте ещё раз" }, { status: 429 });
  }
  activeExports += 1;

  try {
    const parsedResult = requestSchema.safeParse(await readLimitedJson(request));
    if (!parsedResult.success) {
      return NextResponse.json({ error: "Проверьте параметры макета" }, { status: 400 });
    }
    const parsed = parsedResult.data;
    const [restaurant, siteSettings] = await Promise.all([getSiteRestaurant(), getSiteSettings()]);
    const design = withCanonicalQrUrl(parsed.design, siteSettings.domains.canonical);
    const result = await exportPrintMaterial({
      design,
      restaurant,
      format: parsed.format,
    });
    const fileName = `${printFileStem(restaurant.slug, design)}.${result.extension}`;

    const responseBody = new Uint8Array(result.body.byteLength);
    responseBody.set(result.body);
    return new Response(responseBody.buffer, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Слишком большой запрос" }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Проверьте параметры макета" }, { status: 400 });
    }
    console.error("print material export failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Не удалось сформировать файл" }, { status: 500 });
  } finally {
    activeExports -= 1;
  }
}
