import { NextResponse } from "next/server";
import { z } from "zod";
import { db, families } from "@/db";
import { apiAdmin } from "@/lib/auth";

const schema = z.object({ name: z.string().trim().min(1).max(80), monthlyLimit: z.number().int().min(0).max(10000).nullable().default(20) });

/** Create a family. */
export async function POST(req: Request) {
  if (!(await apiAdmin())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Give the family a name." }, { status: 400 });
  const [f] = await db.insert(families).values(p.data).returning({ id: families.id });
  return NextResponse.json({ id: f.id });
}
