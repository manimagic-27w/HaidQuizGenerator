import { cache } from "react";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, familyMembers } from "@/db";
import { ensureBootstrap } from "@/lib/families";
import { adminEmails } from "@/lib/emails";

export type Viewer = {
  id: string; name: string; email: string;
  /** Site admin: sets up families. Listed in ADMIN_EMAILS (or PARENT_EMAILS on older setups). */
  isAdmin: boolean;
  familyId: string | null;
  role: "parent" | "child" | null;
  isParent: boolean;
};

/** The signed-in person with their family and role, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const { userId } = await auth();
  if (!userId) return null;
  await ensureBootstrap();
  const user = await currentUser();
  // Only verified addresses count, so nobody can claim an admin email or someone else's invite by adding it unverified.
  const emails = (user?.emailAddresses || []).filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress.toLowerCase());
  const email = emails.includes((user?.primaryEmailAddress?.emailAddress || "").toLowerCase()) ? user!.primaryEmailAddress!.emailAddress.toLowerCase() : emails[0] || "";

  let [m] = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId));
  if (!m && emails.length) {
    // First sign-in after the admin added this email: link the account.
    const [byEmail] = await db.select().from(familyMembers).where(and(inArray(familyMembers.email, emails), isNull(familyMembers.userId)));
    if (byEmail) {
      [m] = await db.update(familyMembers).set({ userId }).where(eq(familyMembers.id, byEmail.id)).returning();
    }
  }
  return {
    id: userId, email,
    name: user?.firstName || user?.username || "",
    isAdmin: emails.some((e) => adminEmails().includes(e)),
    familyId: m?.familyId ?? null,
    role: m?.role ?? null,
    isParent: m?.role === "parent",
  };
});

/** Signed in and in a family (parent or child). */
export async function requireViewer(): Promise<Viewer & { familyId: string }> {
  const v = await getViewer();
  if (!v) redirect("/sign-in");
  if (!v.familyId) redirect(v.isAdmin ? "/admin" : "/no-family");
  return v as Viewer & { familyId: string };
}

export async function requireParent(): Promise<Viewer & { familyId: string }> {
  const v = await requireViewer();
  if (!v.isParent) redirect("/");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/sign-in");
  if (!v.isAdmin) redirect("/");
  return v;
}

export type Student = { id: string; name: string; email: string };

/** The children in a family who have signed in at least once (only they can be assigned work). */
export async function listStudents(familyId: string): Promise<Student[]> {
  const kids = await db.select().from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.role, "child")));
  const ids = kids.map((k) => k.userId).filter((x): x is string => !!x);
  if (!ids.length) return [];
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ userId: ids, limit: 100 });
  return ids.map((id) => {
    const u = data.find((x) => x.id === id);
    const email = kids.find((k) => k.userId === id)!.email;
    return { id, email, name: (u && [u.firstName, u.lastName].filter(Boolean).join(" ")) || email };
  });
}

/** True when a student may see the item: it's assigned to everyone, or to them. */
export const canSee = (assignedTo: string[], studentId: string) => !assignedTo.length || assignedTo.includes(studentId);

/** For API routes: the signed-in parent with their family, or null. */
export async function apiParent(): Promise<(Viewer & { familyId: string }) | null> {
  const v = await getViewer();
  return v?.isParent && v.familyId ? (v as Viewer & { familyId: string }) : null;
}

/** For API routes: any signed-in family member, or null. */
export async function apiMember(): Promise<(Viewer & { familyId: string }) | null> {
  const v = await getViewer();
  return v?.familyId ? (v as Viewer & { familyId: string }) : null;
}

/** For API routes: the site admin, or null. */
export async function apiAdmin(): Promise<Viewer | null> {
  const v = await getViewer();
  return v?.isAdmin ? v : null;
}
