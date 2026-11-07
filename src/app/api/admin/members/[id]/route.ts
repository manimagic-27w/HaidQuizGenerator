import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, families, familyMembers } from "@/db";
import { apiAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ role: z.enum(["parent", "child"]).optional(), familyId: z.string().uuid().optional() });

/** Change someone's role, or move them to another family. Past results stay with the family they were made in. */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await apiAdmin();
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success || !Object.keys(p.data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  if (p.data.familyId) {
    const [fam] = await db.select({ id: families.id }).from(families).where(eq(families.id, p.data.familyId));
    if (!fam) return NextResponse.json({ error: "That family no longer exists." }, { status: 404 });
  }
  await db.update(familyMembers).set(p.data).where(eq(familyMembers.id, id));
  return NextResponse.json({ ok: true });
}

/** Take someone out of their family. Their account and past results stay; they just can't see anything until re-added. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const admin = await apiAdmin();
  if (!admin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  const [m] = await db.select().from(familyMembers).where(eq(familyMembers.id, id));
  if (m && m.userId === admin.id) return NextResponse.json({ error: "You can't remove yourself. Move yourself to another family instead." }, { status: 409 });
  await db.delete(familyMembers).where(eq(familyMembers.id, id));
  return NextResponse.json({ ok: true });
}
