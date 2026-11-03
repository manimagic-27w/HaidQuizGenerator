import { NextResponse } from "next/server";
import { db, quizzes, questions } from "@/db";
import { getViewer } from "@/lib/auth";
import { draftSchema } from "@/lib/generate";

/** Publish a reviewed draft. Answer order is shuffled so the correct answer isn't predictable. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isParent) return NextResponse.json({ error: "Only a parent can publish quizzes." }, { status: 403 });
  const parsed = draftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Every question needs text, 4 choices and a correct answer." }, { status: 400 });
  const d = parsed.data;

  const [quiz] = await db.insert(quizzes).values({ title: d.title, subject: d.subject, createdBy: viewer.id }).returning({ id: quizzes.id });
  await db.insert(questions).values(d.questions.map((q, i) => {
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    return {
      quizId: quiz.id, position: i, prompt: q.prompt,
      choices: order.map((j) => q.choices[j]), answerIndex: order.indexOf(q.answerIndex), explanation: q.explanation,
    };
  }));
  return NextResponse.json({ id: quiz.id });
}
