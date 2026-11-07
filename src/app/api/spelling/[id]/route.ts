import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, spellingLists } from "@/db";
import { apiParent } from "@/lib/auth";
import { cleanAssignees } from "@/lib/assign";

type Ctx = { params: Promise<{ id: string }> };

/** Hide/show a list, or change who it's assigned to. */
export async function PATCH(req: Request, { params }: Ctx) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const set: { archived?: boolean; assignedTo?: string[] } = {};
  if ("archived" in body) set.archived = !!body.archived;
  if ("assignedTo" in body) set.assignedTo = await cleanAssignees(body.assignedTo, viewer.familyId);
  if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  await db.update(spellingLists).set(set).where(and(eq(spellingLists.id, id), eq(spellingLists.ownerFamilyId, viewer.familyId)));
  return NextResponse.json({ ok: true });
}

/** Delete a list. Past game results are kept. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  await db.delete(spellingLists).where(and(eq(spellingLists.id, id), eq(spellingLists.ownerFamilyId, viewer.familyId)));
  return NextResponse.json({ ok: true });
}
