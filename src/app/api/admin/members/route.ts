import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAdmin } from "@/lib/auth";
import { addMember } from "@/lib/members";

const schema = z.object({
  familyId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["parent", "child"]),
  invite: z.boolean().default(true),
});

/** Site admin: add a parent or child to any family by email. */
export async function POST(req: Request) {
  if (!(await apiAdmin())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const r = await addMember({ ...p.data, revealOtherFamily: true });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
