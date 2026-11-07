import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, familyMembers } from "@/db";
import { apiParent } from "@/lib/auth";
import { clerkMessage, sendInvite } from "@/lib/members";

type Ctx = { params: Promise<{ id: string }> };

/** Parent: email a pending child's invitation again. */
export async function POST(_req: Request, { params }: Ctx) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [m] = await db.select().from(familyMembers).where(and(
    eq(familyMembers.id, id), eq(familyMembers.familyId, viewer.familyId), eq(familyMembers.role, "child"), isNull(familyMembers.userId)));
  if (!m) return NextResponse.json({ error: "That invite is no longer pending." }, { status: 404 });
  try { await sendInvite(m.email); } catch (e) { return NextResponse.json({ error: clerkMessage(e) }, { status: 502 }); }
  return NextResponse.json({ ok: true });
}
