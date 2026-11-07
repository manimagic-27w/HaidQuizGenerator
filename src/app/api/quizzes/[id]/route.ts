import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, quizzes } from "@/db";
import { apiParent } from "@/lib/auth";
import { cleanAssignees } from "@/lib/assign";

type Ctx = { params: Promise<{ id: string }> };

/** Hide/show a quiz, or change which students it's assigned to. */
export async function PATCH(req: Request, { params }: Ctx) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const set: { archived?: boolean; assignedTo?: string[] } = {};
  if ("archived" in body) set.archived = !!body.archived;
  if ("assignedTo" in body) set.assignedTo = await cleanAssignees(body.assignedTo, viewer.familyId);
  if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  await db.update(quizzes).set(set).where(and(eq(quizzes.id, id), eq(quizzes.ownerFamilyId, viewer.familyId)));
  return NextResponse.json({ ok: true });
}

/** Delete a quiz. Past attempts keep their scores and time stats. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  await db.delete(quizzes).where(and(eq(quizzes.id, id), eq(quizzes.ownerFamilyId, viewer.familyId)));
  return NextResponse.json({ ok: true });
}
