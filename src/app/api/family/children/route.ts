import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, familyMembers } from "@/db";
import { apiParent } from "@/lib/auth";
import { addMember } from "@/lib/members";

const MAX_PEOPLE = 12; // per family, so invites can't be used to spam
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

/** Parent: invite a child into their own family. */
export async function POST(req: Request) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Only a parent can invite children." }, { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(familyMembers).where(eq(familyMembers.familyId, viewer.familyId));
  if (n >= MAX_PEOPLE) return NextResponse.json({ error: `A family can have up to ${MAX_PEOPLE} people. Ask the site admin if you need more.` }, { status: 409 });
  const r = await addMember({ familyId: viewer.familyId, email: p.data.email, role: "child", revealOtherFamily: false });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
