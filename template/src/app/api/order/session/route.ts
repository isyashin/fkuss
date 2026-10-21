import { rateLimit } from "@/lib/rate-limit";
import { ensureTrackingSession, privateOrderJson, sameOrderOrigin } from "@/lib/order/guest-order-tracking";

export async function POST(request: Request) {
  if (!sameOrderOrigin(request)) return privateOrderJson({ error: "Недопустимый источник запроса" }, 403);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`order-session:${ip}`, 60, 10*60*1000)) return privateOrderJson({ error: "Подождите и попробуйте ещё раз" }, 429);
  return ensureTrackingSession(request);
}
