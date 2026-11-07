import { NextResponse } from "next/server";
import { db, spellingLists, spellingWords } from "@/db";
import { apiParent } from "@/lib/auth";
import { cleanAssignees } from "@/lib/assign";
import { cleanTricky, listDraftSchema } from "@/lib/spelling";

/** Publish a reviewed spelling list. */
export async function POST(req: Request) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Only a parent can publish spelling lists." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = listDraftSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Every word needs to be filled in (40 letters at most)." }, { status: 400 });
  const assignedTo = await cleanAssignees(body?.assignedTo, viewer.familyId);
  const [list] = await db.insert(spellingLists).values({ ownerFamilyId: viewer.familyId, title: parsed.data.title, createdBy: viewer.id, assignedTo }).returning({ id: spellingLists.id });
  await db.insert(spellingWords).values(parsed.data.words.map((w, i) => ({
    listId: list.id, position: i, word: w.word, sentence: w.sentence, meaning: w.meaning, tricky: cleanTricky(w.word, w.tricky),
  })));
  return NextResponse.json({ id: list.id });
}
