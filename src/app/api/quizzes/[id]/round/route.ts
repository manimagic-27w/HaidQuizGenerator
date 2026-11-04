import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { apiErrorMessage, generateRound, StudyGuideError, type Draft } from "@/lib/generate";
import { familyMisses, familyNotes, loadFamily, nextRound } from "@/lib/rounds";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  studentId: z.string().max(100).nullish(),
  focus: z.string().max(400).default(""),
  reviewShare: z.number().min(0).max(0.8).default(0.5),
  notes: z.string().max(30000).nullish(), // parent's edited notes, if any
});

type Ctx = { params: Promise<{ id: string }> };

/** Write the next round of a quiz from its saved study notes, aimed at what the student missed. */
export async function POST(req: Request, { params }: Ctx) {
  const viewer = await getViewer();
  if (!viewer?.isParent) return NextResponse.json({ error: "Only a parent can make quizzes." }, { status: 403 });
  const { id } = await params;
  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const f = await loadFamily(id);
  if (!f) return NextResponse.json({ error: "That quiz no longer exists." }, { status: 404 });
  const saved = familyNotes(f);
  const notes = body.data.notes?.trim() || saved.notes;
  if (!notes.trim()) return NextResponse.json({ error: "There are no study notes for this quiz. Make a new quiz from the study guide instead." }, { status: 422 });

  const ids = f.members.map((m) => m.id);
  const misses = await familyMisses(ids, body.data.studentId || null);
  const { title } = nextRound(f);

  try {
    const out = await generateRound({
      notes, title: f.members[0].title, subject: f.quiz.subject, misses,
      previous: f.questions.map((q) => q.prompt), focus: body.data.focus, reviewShare: body.data.reviewShare,
    });
    const draft: Draft = { title, subject: out.subject, studyNotes: notes, sourceQuizId: f.quiz.id, questions: out.questions };
    return NextResponse.json({ draft, focusedOn: misses.length });
  } catch (e) {
    if (e instanceof StudyGuideError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("round failed", e);
    return NextResponse.json({ error: apiErrorMessage(e) }, { status: 502 });
  }
}
