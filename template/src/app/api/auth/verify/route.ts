import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuthCode } from "@/lib/auth";

const schema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте email и код" }, { status: 400 });
  }

  const result = await verifyAuthCode(parsed.data.email.toLowerCase().trim(), parsed.data.code);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
