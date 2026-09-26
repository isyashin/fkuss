import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { requestAuthCode } from "@/lib/auth";

const schema = z.object({ email: z.email() });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите корректный email" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  // Rate limits: 1 код/мин на email, 5/час с IP
  if (!rateLimit(`code:email:${email}`, 1, 60_000)) {
    return NextResponse.json({ error: "Код уже отправлен. Подождите минуту." }, { status: 429 });
  }
  if (!rateLimit(`code:ip:${ip}`, 5, 3600_000)) {
    return NextResponse.json({ error: "Слишком много запросов. Попробуйте позже." }, { status: 429 });
  }

  const result = await requestAuthCode(email);
  if (result.deliveryFailed) {
    return NextResponse.json({ error: "Не удалось отправить код. Попробуйте позже." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, devCode: result.devCode });
}
