import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db, families, familyMembers } from "@/db";
import { apiAdmin } from "@/lib/auth";

const schema = z.object({
  familyId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["parent", "child"]),
  invite: z.boolean().default(true),
});

/**
 * Add a person to a family by email. If they already have an account, it's linked now; otherwise Clerk emails
 * them an invitation and the account links the first time they sign in.
 */
export async function POST(req: Request) {
  if (!(await apiAdmin())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { familyId, email, role, invite } = p.data;

  const [fam] = await db.select().from(families).where(eq(families.id, familyId));
  if (!fam) return NextResponse.json({ error: "That family no longer exists." }, { status: 404 });
  const [existing] = await db.select({ familyId: familyMembers.familyId }).from(familyMembers).where(eq(familyMembers.email, email));
  if (existing) {
    const [other] = await db.select({ name: families.name }).from(families).where(eq(families.id, existing.familyId));
    return NextResponse.json({ error: `${email} is already in ${other?.name || "another family"}. Use Move instead.` }, { status: 409 });
  }

  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({ emailAddress: [email], limit: 1 });
  const userId = users[0]?.id ?? null;
  if (userId) {
    const [taken] = await db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.userId, userId));
    if (taken) return NextResponse.json({ error: "That account is already in a family under a different email." }, { status: 409 });
  }
  await db.insert(familyMembers).values({ familyId, email, role, userId });

  let invited = false, inviteError = "";
  if (!userId && invite) {
    try {
      await client.invitations.createInvitation({ emailAddress: email, notify: true, ignoreExisting: true });
      invited = true;
    } catch (e) {
      const err = e as { errors?: { longMessage?: string; message?: string }[]; message?: string };
      inviteError = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "Clerk didn't send the invitation.";
    }
  }
  return NextResponse.json({ ok: true, linked: !!userId, invited, inviteError });
}
