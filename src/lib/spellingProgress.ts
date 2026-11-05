import { and, desc, eq, inArray } from "drizzle-orm";
import { db, spellingSessions, spellingResults, spellingWords } from "@/db";
import { mastery, type Mastery } from "@/lib/spelling";

export type WordProgress = {
  wordId: string; word: string; status: Mastery; tries: number; firstTryCount: number; wrong: string[]; lastAt: Date | null;
};

/** Per-word mastery for one student across every game on the given lists. */
export async function wordProgress(listIds: string[], studentId: string): Promise<Map<string, WordProgress[]>> {
  const out = new Map<string, WordProgress[]>();
  if (!listIds.length) return out;
  const words = await db.select().from(spellingWords).where(inArray(spellingWords.listId, listIds));
  const rows = await db
    .select({ r: spellingResults, listId: spellingSessions.listId, at: spellingSessions.startedAt })
    .from(spellingResults)
    .innerJoin(spellingSessions, eq(spellingSessions.id, spellingResults.sessionId))
    .where(and(inArray(spellingSessions.listId, listIds), eq(spellingSessions.studentId, studentId)))
    .orderBy(desc(spellingSessions.startedAt));
  for (const listId of listIds) {
    const list = words.filter((w) => w.listId === listId).sort((a, b) => a.position - b.position);
    out.set(listId, list.map((w) => {
      const mine = rows.filter((x) => x.r.wordId === w.id);
      return {
        wordId: w.id, word: w.word, status: mastery(mine.map((x) => x.r)), tries: mine.length,
        firstTryCount: mine.filter((x) => x.r.firstTry).length,
        wrong: [...new Set(mine.flatMap((x) => x.r.wrong))].slice(0, 6),
        lastAt: mine[0]?.at ?? null,
      };
    }));
  }
  return out;
}

export const summarize = (words: WordProgress[]) => ({
  total: words.length,
  mastered: words.filter((w) => w.status === "mastered").length,
  learning: words.filter((w) => w.status === "learning").length,
  fresh: words.filter((w) => w.status === "new").length,
});
