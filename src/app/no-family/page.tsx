import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NoFamily() {
  const v = await getViewer();
  if (!v) redirect("/sign-in");
  if (v.familyId) redirect("/");
  return (
    <section className="notice stack" style={{ textAlign: "left" }}>
      <h2>Your account isn&apos;t set up yet</h2>
      <p>You&apos;re signed in as <b>{v.email}</b>, but that email hasn&apos;t been added to a family yet.</p>
      <p className="small">Ask the person who invited you to add this email address. If you were invited at a different address, sign out and sign in with that one.</p>
    </section>
  );
}
