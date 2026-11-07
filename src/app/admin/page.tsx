import { asc, gte, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db, families, familyMembers, generations } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { monthStart } from "@/lib/usage";
import Families, { type FamilyRow } from "./Families";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [fams, members, used] = await Promise.all([
    db.select().from(families).orderBy(asc(families.createdAt)),
    db.select().from(familyMembers).orderBy(asc(familyMembers.createdAt)),
    db.select({ familyId: generations.familyId, n: sql<number>`count(*)::int` }).from(generations)
      .where(gte(generations.createdAt, monthStart())).groupBy(generations.familyId),
  ]);
  const ids = members.map((m) => m.userId).filter((x): x is string => !!x);
  const names = new Map<string, string>();
  if (ids.length) {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: ids, limit: 200 });
    for (const u of data) names.set(u.id, [u.firstName, u.lastName].filter(Boolean).join(" "));
  }
  const rows: FamilyRow[] = fams.map((f) => ({
    id: f.id, name: f.name, monthlyLimit: f.monthlyLimit, used: used.find((u) => u.familyId === f.id)?.n ?? 0,
    members: members.filter((m) => m.familyId === f.id).map((m) => ({
      id: m.id, email: m.email, role: m.role, signedIn: !!m.userId, name: (m.userId && names.get(m.userId)) || "", isYou: m.userId === admin.id,
    })),
  }));

  return (
    <>
      <section className="stack">
        <h1>Families</h1>
        <p className="muted">Each family only sees its own quizzes, spelling lists and results. Parents in a family get the Parent dashboard; children see the work assigned to them. Each person can be in one family.</p>
        {!admin.familyId && <p className="small err">You aren&apos;t in a family yet, so you won&apos;t see the Quizzes or Parent pages until you add yourself to one.</p>}
      </section>
      <Families families={rows} />
    </>
  );
}
