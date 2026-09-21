import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-auth";
import { getSiteRestaurant } from "@/lib/site";
import { printFileStem, printMaterialDesignSchema } from "@/lib/print-materials";
import { exportPrintMaterial } from "@/lib/print-materials-server";

export const runtime = "nodejs";

const requestSchema = z.object({
  design: printMaterialDesignSchema,
  format: z.enum(["svg", "png", "pdf"]),
});

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const parsed = requestSchema.parse(await request.json());
    const restaurant = await getSiteRestaurant();
    const result = await exportPrintMaterial({
      design: parsed.design,
      restaurant,
      format: parsed.format,
    });
    const fileName = `${printFileStem(restaurant.slug, parsed.design)}.${result.extension}`;

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
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Проверьте параметры макета" }, { status: 400 });
    }
    console.error("print material export failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Не удалось сформировать файл" }, { status: 500 });
  }
}
