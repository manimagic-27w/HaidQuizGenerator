import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, spellingSessions, spellingResults } from "@/db";
import { getViewer } from "@/lib/auth";

const schema = z.object({
  results: z.array(z.object({
    position: z.number().int().min(0).max(99),
    wordId: z.string().uuid().nullable(),
    word: z.string().max(40),
    firstTry: z.boolean(),
    mistakes: z.number().int().min(0).max(500),
    hints: z.number().int().min(0).max(100),
    wrong: z.array(z.string().max(60)).max(30),
    ms: z.number().min(0).max(86_400_000),
  })).max(100),
  awayMs: z.number().min(0).max(86_400_000),
  awayCount: z.number().int().min(0).max(10_000),
  idleMs: z.number().min(0).max(86_400_000),
  done: z.boolean().default(false),
});

type Ctx = { params: Promise<{ id: string }> };

/** Save word results and timing as she plays; done: true closes the session. */
export async function PATCH(req: Request, { params }: Ctx) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in again to keep saving." }, { status: 401 });
  const { id } = await params;
  const [s] = await db.select().from(spellingSessions)
    .where(and(eq(spellingSessions.id, id), eq(spellingSessions.studentId, viewer.id), eq(spellingSessions.status, "in_progress")));
  if (!s) return NextResponse.json({ error: "This game already ended." }, { status: 404 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Bad data." }, { status: 400 });
  const d = p.data;

  if (d.results.length) {
    await db.insert(spellingResults).values(d.results.map((r) => ({ sessionId: id, ...r, ms: Math.round(r.ms) })))
      .onConflictDoUpdate({
        target: [spellingResults.sessionId, spellingResults.position],
        set: {
          firstTry: sql`excluded.first_try`, mistakes: sql`excluded.mistakes`, hints: sql`excluded.hints`,
          wrong: sql`excluded.wrong`, ms: sql`excluded.ms`,
        },
      });
  }
  await db.update(spellingSessions).set({
    awayMs: Math.round(d.awayMs), awayCount: d.awayCount, idleMs: Math.round(d.idleMs), updatedAt: new Date(),
    ...(d.done ? { status: "done" as const, finishedAt: new Date() } : {}),
  }).where(eq(spellingSessions.id, id));
  return NextResponse.json({ ok: true });
}
