import { NextResponse } from "next/server";
import { apiMember } from "@/lib/auth";
import { apiErrorMessage, StudyGuideError } from "@/lib/generate";
import { makePractice, practiceStatus } from "@/lib/practice";
import { limitReached } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

/** A child makes their one practice quiz from a quiz a parent made. */
export async function POST(_req: Request, { params }: Ctx) {
  const viewer = await apiMember();
  if (!viewer) return NextResponse.json({ error: "Sign in again to keep going." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const status = await practiceStatus(id, viewer);
  if (status.kind === "made") return NextResponse.json({ id: status.quizId });
  if (status.kind !== "available") return NextResponse.json({ error: "You can make a practice quiz after you finish this one." }, { status: 403 });
  if (await limitReached(viewer.familyId)) {
    return NextResponse.json({ error: "Your family has used all of this month's new quizzes. Ask a parent." }, { status: 429 });
  }
  try {
    return NextResponse.json({ id: await makePractice(id, viewer) });
  } catch (e) {
    if (e instanceof StudyGuideError) return NextResponse.json({ error: e.message }, { status: 422 });
    if ((e as Error).message === "not_found") return NextResponse.json({ error: "That quiz isn't available anymore." }, { status: 404 });
    console.error("practice failed", e);
    return NextResponse.json({ error: apiErrorMessage(e) }, { status: 502 });
  }
}
