import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, quizzes, questions } from "@/db";
import { apiParent } from "@/lib/auth";
import { cleanAssignees } from "@/lib/assign";
import { draftSchema } from "@/lib/generate";

/** Publish a reviewed draft. Answer order is shuffled so the correct answer isn't predictable. */
export async function POST(req: Request) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Only a parent can publish quizzes." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Every question needs text, 4 choices and a correct answer." }, { status: 400 });
  const d = parsed.data;
  const assignedTo = await cleanAssignees(body?.assignedTo, viewer.familyId);

  // A new round joins the family of the quiz it was made from.
  let familyId: string | null = null;
  if (d.sourceQuizId) {
    const [src] = await db.select({ id: quizzes.id, familyId: quizzes.familyId }).from(quizzes).where(and(eq(quizzes.id, d.sourceQuizId), eq(quizzes.ownerFamilyId, viewer.familyId)));
    if (src) familyId = src.familyId ?? src.id;
  }

  const [quiz] = await db.insert(quizzes).values({
    ownerFamilyId: viewer.familyId, title: d.title, subject: d.subject, createdBy: viewer.id, assignedTo, studyNotes: d.studyNotes, familyId,
  }).returning({ id: quizzes.id });
  await db.insert(questions).values(d.questions.map((q, i) => {
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    return {
      quizId: quiz.id, position: i, prompt: q.prompt,
      choices: order.map((j) => q.choices[j]), answerIndex: order.indexOf(q.answerIndex), explanation: q.explanation, topic: q.topic,
    };
  }));
  return NextResponse.json({ id: quiz.id });
}
