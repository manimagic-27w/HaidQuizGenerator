import { and, eq, gte, sql } from "drizzle-orm";
import { db, families, generations } from "@/db";

/** Start of the current calendar month, US Eastern time. Limits reset on the 1st. */
export function monthStart(now = new Date()): Date {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = now.getTime() - et.getTime();
  return new Date(new Date(et.getFullYear(), et.getMonth(), 1).getTime() + offset);
}

export type Allowance = { used: number; limit: number | null; left: number | null };

export async function allowance(familyId: string): Promise<Allowance> {
  const [fam] = await db.select({ limit: families.monthlyLimit }).from(families).where(eq(families.id, familyId));
  const [{ used }] = await db.select({ used: sql<number>`count(*)::int` }).from(generations)
    .where(and(eq(generations.familyId, familyId), gte(generations.createdAt, monthStart())));
  const limit = fam?.limit ?? null;
  return { used, limit, left: limit == null ? null : Math.max(0, limit - used) };
}

/** Null when the family can generate; otherwise the message to show. */
export async function limitReached(familyId: string): Promise<string | null> {
  const a = await allowance(familyId);
  if (a.left == null || a.left > 0) return null;
  return `Your family has used all ${a.limit} of this month's quiz and spelling-list creations. The count resets on the 1st. Ask the site admin if you need more.`;
}

export async function recordGeneration(familyId: string, userId: string, kind: "quiz" | "round" | "spelling") {
  await db.insert(generations).values({ familyId, userId, kind });
}
