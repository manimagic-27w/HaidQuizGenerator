import { clerkClient } from "@clerk/nextjs/server";
import { eq, isNull } from "drizzle-orm";
import { legacyParentEmails } from "@/lib/emails";
import { db, families, familyMembers, quizzes, attempts, spellingLists, spellingSessions } from "@/db";

/** Fixed id for the family created from the site's original users, so the one-time move can't run twice. */
export const FIRST_FAMILY_ID = "00000000-0000-4000-8000-000000000001";
let bootstrapped = false;

/**
 * One-time move to families. The first time anyone signs in after the upgrade, everyone who already has an
 * account goes into one family (PARENT_EMAILS / ADMIN_EMAILS become its parents, everyone else a child), and
 * every existing quiz, attempt, spelling list and game is stamped with that family. Safe to run again.
 */
export async function ensureBootstrap() {
  if (bootstrapped) return;
  const existing = await db.select({ id: families.id }).from(families).limit(1);
  if (!existing.length) await createFirstFamily();
  // Stamp anything still unowned (no-op once done; reruns if an earlier attempt stopped partway).
  const [first] = await db.select({ id: families.id }).from(families).where(eq(families.id, FIRST_FAMILY_ID));
  if (first) {
    await db.update(quizzes).set({ ownerFamilyId: FIRST_FAMILY_ID }).where(isNull(quizzes.ownerFamilyId));
    await db.update(attempts).set({ ownerFamilyId: FIRST_FAMILY_ID }).where(isNull(attempts.ownerFamilyId));
    await db.update(spellingLists).set({ ownerFamilyId: FIRST_FAMILY_ID }).where(isNull(spellingLists.ownerFamilyId));
    await db.update(spellingSessions).set({ ownerFamilyId: FIRST_FAMILY_ID }).where(isNull(spellingSessions.ownerFamilyId));
  }
  bootstrapped = true;
}

async function createFirstFamily() {
  const parents = legacyParentEmails();
  await db.insert(families).values({ id: FIRST_FAMILY_ID, name: process.env.FIRST_FAMILY_NAME || "My family", monthlyLimit: null }).onConflictDoNothing();

  const client = await clerkClient();
  const { data } = await client.users.getUserList({ limit: 500 });
  const rows = data.flatMap((u) => {
    const email = (u.primaryEmailAddress?.emailAddress || u.emailAddresses[0]?.emailAddress || "").toLowerCase();
    if (!email) return [];
    const isParent = u.emailAddresses.some((e) => parents.includes(e.emailAddress.toLowerCase()));
    return [{ familyId: FIRST_FAMILY_ID, email, userId: u.id, role: (isParent ? "parent" : "child") as "parent" | "child" }];
  });
  if (rows.length) await db.insert(familyMembers).values(rows).onConflictDoNothing();
}
