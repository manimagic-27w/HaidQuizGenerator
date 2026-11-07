import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, familyMembers } from "@/db";
import { apiParent } from "@/lib/auth";
import { revokeInvites } from "@/lib/members";

type Ctx = { params: Promise<{ id: string }> };

/** Parent: remove a child from their own family (or cancel a pending invite). Past results stay. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [m] = await db.select().from(familyMembers)
    .where(and(eq(familyMembers.id, id), eq(familyMembers.familyId, viewer.familyId), eq(familyMembers.role, "child")));
  if (!m) return NextResponse.json({ error: "That child isn't in your family." }, { status: 404 });
  await db.delete(familyMembers).where(eq(familyMembers.id, m.id));
  if (!m.userId) await revokeInvites(m.email);
  return NextResponse.json({ ok: true });
}
