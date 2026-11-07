import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, families, familyMembers } from "@/db";
import { apiAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  monthlyLimit: z.number().int().min(0).max(10000).nullable().optional(),
});

/** Rename a family or change its monthly limit (null = no limit). */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await apiAdmin())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success || !Object.keys(p.data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  await db.update(families).set(p.data).where(eq(families.id, id));
  return NextResponse.json({ ok: true });
}

/** Delete an empty family (and anything it made). Families with people in them can't be deleted. */
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await apiAdmin())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(familyMembers).where(eq(familyMembers.familyId, id));
  if (n > 0) return NextResponse.json({ error: "Remove or move everyone out of this family first." }, { status: 409 });
  await db.delete(families).where(eq(families.id, id));
  return NextResponse.json({ ok: true });
}
