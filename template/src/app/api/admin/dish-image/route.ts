import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

const schema = z.object({ dishId: z.string(), image: z.string().regex(/^images\//) });

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const prisma = getPrisma();
  await prisma.dish.update({ where: { id: parsed.data.dishId }, data: { image: parsed.data.image } });
  return NextResponse.json({ ok: true });
}
