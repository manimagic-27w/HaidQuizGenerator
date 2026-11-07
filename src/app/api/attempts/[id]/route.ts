import { NextResponse } from "next/server";
import { apiMember } from "@/lib/auth";
import { ownOpenAttempt, progressSchema, saveProgress } from "@/lib/attempts";

type Ctx = { params: Promise<{ id: string }> };

/** Save answers and timing while the quiz is in progress. */
export async function PATCH(req: Request, { params }: Ctx) {
  const viewer = await apiMember();
  if (!viewer) return NextResponse.json({ error: "Sign in again to keep saving." }, { status: 401 });
  const { id } = await params;
  const attempt = await ownOpenAttempt(id, viewer.id, viewer.familyId);
  if (!attempt) return NextResponse.json({ error: "This quiz attempt is closed." }, { status: 404 });
  const parsed = progressSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad progress data." }, { status: 400 });
  await saveProgress(id, parsed.data);
  return NextResponse.json({ ok: true });
}
