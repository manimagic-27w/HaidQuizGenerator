import { notFound } from "next/navigation";
import { and, asc, eq, notExists } from "drizzle-orm";
import { db, spellingLists, spellingWords, spellingSessions, spellingResults } from "@/db";
import { canSee, requireViewer } from "@/lib/auth";
import { GAMES, shuffle, type Game } from "@/lib/spelling";
import GameShell from "./GameShell";

export const dynamic = "force-dynamic";

export default async function SpellingGame({ params }: { params: Promise<{ id: string; game: string }> }) {
  const viewer = await requireViewer();
  const { id, game } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(game in GAMES)) notFound();
  const [list] = await db.select().from(spellingLists).where(eq(spellingLists.id, id));
  if (!list || list.ownerFamilyId !== viewer.familyId || (!viewer.isParent && (list.archived || !canSee(list.assignedTo, viewer.id)))) notFound();
  const words = await db.select().from(spellingWords).where(eq(spellingWords.listId, id)).orderBy(asc(spellingWords.position));
  if (!words.length) notFound();

  // Parents play a preview that saves nothing. Students get a fresh session; empty abandoned ones are cleared first.
  let sessionId: string | null = null;
  if (!viewer.isParent) {
    await db.delete(spellingSessions).where(and(
      eq(spellingSessions.listId, id), eq(spellingSessions.studentId, viewer.id), eq(spellingSessions.game, game as Game),
      eq(spellingSessions.status, "in_progress"),
      notExists(db.select().from(spellingResults).where(eq(spellingResults.sessionId, spellingSessions.id))),
    ));
    const [s] = await db.insert(spellingSessions).values({
      ownerFamilyId: viewer.familyId, listId: id, listTitle: list.title, studentId: viewer.id, studentName: viewer.name, game: game as Game, total: words.length,
    }).returning({ id: spellingSessions.id });
    sessionId = s.id;
  }

  const other = (Object.keys(GAMES) as Game[]).find((g) => g !== game)!;
  return (
    <GameShell key={sessionId ?? "preview"} game={game as Game} listId={id} title={list.title} sessionId={sessionId} otherGame={other}
      words={shuffle(words).map((w) => ({ id: w.id, word: w.word, sentence: w.sentence, meaning: w.meaning, tricky: w.tricky }))} />
  );
}
