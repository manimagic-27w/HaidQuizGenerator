import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, families, familyMembers } from "@/db";

export type AddResult =
  | { ok: true; linked: boolean; invited: boolean; inviteError: string }
  | { ok: false; status: number; error: string };

const clerkMessage = (e: unknown) => {
  const err = e as { errors?: { longMessage?: string; message?: string }[]; message?: string };
  return err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "Clerk didn't send the invitation.";
};

/**
 * Add someone to a family by email. If they already have an account it's linked now; otherwise Clerk emails an
 * invitation and the account links the first time they sign in. `revealOtherFamily` is false for parents, so a
 * parent never learns which family another email belongs to.
 */
export async function addMember(o: { familyId: string; email: string; role: "parent" | "child"; invite?: boolean; revealOtherFamily: boolean }): Promise<AddResult> {
  const email = o.email.trim().toLowerCase();
  const [fam] = await db.select().from(families).where(eq(families.id, o.familyId));
  if (!fam) return { ok: false, status: 404, error: "That family no longer exists." };

  const [existing] = await db.select({ familyId: familyMembers.familyId }).from(familyMembers).where(eq(familyMembers.email, email));
  if (existing) {
    if (existing.familyId === o.familyId) return { ok: false, status: 409, error: `${email} is already in this family.` };
    if (!o.revealOtherFamily) return { ok: false, status: 409, error: `${email} is already in another family. Ask the site admin to move them.` };
    const [other] = await db.select({ name: families.name }).from(families).where(eq(families.id, existing.familyId));
    return { ok: false, status: 409, error: `${email} is already in ${other?.name || "another family"}. Use Move instead.` };
  }

  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ emailAddress: [email], limit: 1 });
  const userId = users[0]?.id ?? null;
  if (userId) {
    const [taken] = await db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.userId, userId));
    if (taken) return { ok: false, status: 409, error: o.revealOtherFamily ? "That account is already in a family under a different email." : `${email} is already in another family. Ask the site admin to move them.` };
  }
  await db.insert(familyMembers).values({ familyId: o.familyId, email, role: o.role, userId });

  let invited = false, inviteError = "";
  if (!userId && o.invite !== false) {
    try { await sendInvite(email); invited = true; } catch (e) { inviteError = clerkMessage(e); }
  }
  return { ok: true, linked: !!userId, invited, inviteError };
}

/** Email a (new) Clerk invitation. Any earlier pending one for the same address is revoked first. */
export async function sendInvite(email: string) {
  const client = await clerkClient();
  await revokeInvites(email);
  await client.invitations.createInvitation({ emailAddress: email, notify: true, ignoreExisting: true });
}

export async function revokeInvites(email: string) {
  const client = await clerkClient();
  try {
    const { data } = await client.invitations.getInvitationList({ query: email, status: "pending" });
    await Promise.all(data.filter((i) => i.emailAddress.toLowerCase() === email.toLowerCase()).map((i) => client.invitations.revokeInvitation(i.id)));
  } catch { /* nothing to revoke */ }
}

export { clerkMessage };
