import { NextResponse } from "next/server";
import { z } from "zod";
import { apiMember } from "@/lib/auth";
import { checkAnswer, ownOpenAttempt } from "@/lib/attempts";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({
  position: z.number().int().min(0).max(99),
  choice: z.number().int().min(0).max(3),
  firstChoice: z.number().int().min(0).max(3).nullable().default(null),
  changes: z.number().int().min(0).max(1000).default(0),
});

/** Check one answer during the quiz, lock it, and return the right answer with its explanation. */
export async function POST(req: Request, { params }: Ctx) {
  const viewer = await apiMember();
  if (!viewer) return NextResponse.json({ error: "Sign in again to keep going." }, { status: 401 });
  const { id } = await params;
  const attempt = await ownOpenAttempt(id, viewer.id, viewer.familyId);
  if (!attempt) return NextResponse.json({ error: "This quiz attempt is closed." }, { status: 404 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success || p.data.position >= attempt.total) return NextResponse.json({ error: "Bad answer." }, { status: 400 });
  const fb = await checkAnswer(attempt, p.data.position, p.data.choice, p.data.firstChoice, p.data.changes);
  if (!fb) return NextResponse.json({ error: "That question isn't available anymore." }, { status: 404 });
  return NextResponse.json(fb);
}
