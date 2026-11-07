"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Person = { id: string; name: string; email: string; role: "parent" | "child"; signedIn: boolean; isYou: boolean };

export default function FamilyPeople({ familyName, people }: { familyName: string; people: Person[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(key: string, url: string, method: string, body: unknown, ok: (d: Record<string, unknown>) => string) {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      setMsg({ ok: true, text: ok(data) }); setConfirm(null); router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const invite = () => act("add", "/api/family/children", "POST", { email }, (d) => {
    const e = email; setEmail("");
    return d.linked ? `${e} already had an account and is now in your family. They can sign in right away.`
      : d.invited ? `Invitation emailed to ${e}. They'll see their quizzes once they sign up.`
      : `Added ${e}, but the email didn't send (${d.inviteError}). Try Resend.`;
  });

  return (
    <section className="stack">
      <div className="spread"><h2>Family</h2><span className="small muted">{familyName}</span></div>
      <div className="sheet" style={{ paddingBlock: 4 }}>
        {people.map((p) => (
          <div className="mq" key={p.id}>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <b>{p.name || p.email}</b> {p.isYou && <span className="pill info">You</span>}
              <div className="small muted">{p.name && p.name !== p.email ? `${p.email} · ` : ""}{p.role === "parent" ? "Parent" : "Child"}</div>
            </div>
            <div className="row">
              {p.role === "child" && (p.signedIn ? <span className="pill good">Signed in</span> : <span className="pill warn">Invite sent</span>)}
              {p.role === "child" && !p.signedIn && (
                <button className="btn sm" disabled={busy === p.id}
                  onClick={() => act(p.id, `/api/family/children/${p.id}/resend`, "POST", null, () => `Sent ${p.email} a new invitation.`)}>Resend</button>
              )}
              {p.role === "child" && (
                <button className="btn sm danger" disabled={busy === p.id}
                  onClick={() => confirm === p.id
                    ? act(p.id, `/api/family/children/${p.id}`, "DELETE", null, () => p.signedIn ? `Removed ${p.email}. Their past results are kept.` : `Cancelled the invite for ${p.email}.`)
                    : setConfirm(p.id)}>
                  {confirm === p.id ? "Confirm" : p.signedIn ? "Remove" : "Cancel invite"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label className="label" htmlFor="kid-email">Invite a child</label>
          <input id="kid-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their email address" autoCapitalize="off"
            onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) invite(); }} />
        </div>
        <button className="btn primary" disabled={!email.includes("@") || busy === "add"} onClick={invite}>{busy === "add" ? "Sending…" : "Send invite"}</button>
      </div>
      <p className="small muted">They get an email to create their account and will only see work you assign them. Once they sign in, you can pick them under Assign on any quiz or spelling list.</p>
      {msg && <p className={`small ${msg.ok ? "muted" : "err"}`}>{msg.text}</p>}
    </section>
  );
}
