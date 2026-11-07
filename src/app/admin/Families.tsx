"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type MemberRow = { id: string; email: string; role: "parent" | "child"; signedIn: boolean; name: string; isYou: boolean };
export type FamilyRow = { id: string; name: string; monthlyLimit: number | null; used: number; members: MemberRow[] };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
  return data;
}

export default function Families({ families }: { families: FamilyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("20");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true); setError("");
    try {
      await send("/api/admin/families", "POST", { name, monthlyLimit: limit.trim() === "" ? null : Number(limit) });
      setName(""); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      {families.map((f) => <FamilyCard key={f.id} f={f} others={families.filter((o) => o.id !== f.id)} />)}
      <section className="sheet stack">
        <h2>New family</h2>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field"><label className="label" htmlFor="nf-name">Family name</label>
            <input id="nf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Garcias" /></div>
          <div className="field" style={{ maxWidth: 200 }}><label className="label" htmlFor="nf-limit">Monthly limit</label>
            <input id="nf-limit" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} placeholder="blank = no limit" /></div>
          <button className="btn primary" disabled={busy || !name.trim()} onClick={create}>Create family</button>
        </div>
        <p className="small muted">The monthly limit counts new quizzes, next rounds and spelling lists, the things that use your Claude API credits. Leave it blank for no limit.</p>
        {error && <p className="err small">{error}</p>}
      </section>
    </>
  );
}

function FamilyCard({ f, others }: { f: FamilyRow; others: FamilyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState(f.name);
  const [limit, setLimit] = useState(f.monthlyLimit == null ? "" : String(f.monthlyLimit));
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"parent" | "child">("child");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ ok: true, text: t }); setConfirm(null); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const dirty = name.trim() !== f.name || (limit === "" ? null : Number(limit)) !== f.monthlyLimit;
  const parents = f.members.filter((m) => m.role === "parent").length;
  const kids = f.members.length - parents;

  return (
    <section className="sheet stack">
      <div className="spread">
        <h2>{f.name}</h2>
        <span className="small muted">{parents} {parents === 1 ? "parent" : "parents"} · {kids} {kids === 1 ? "child" : "children"} · <b className="mono">{f.used}</b>{f.monthlyLimit != null ? ` of ${f.monthlyLimit}` : ""} used this month</span>
      </div>

      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field"><label className="label" htmlFor={`fn-${f.id}`}>Name</label>
          <input id={`fn-${f.id}`} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field" style={{ maxWidth: 200 }}><label className="label" htmlFor={`fl-${f.id}`}>Monthly limit</label>
          <input id={`fl-${f.id}`} inputMode="numeric" value={limit} placeholder="no limit" onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} /></div>
        <button className="btn" disabled={!dirty || !name.trim() || busy === "save"}
          onClick={() => act("save", () => send(`/api/admin/families/${f.id}`, "PATCH", { name, monthlyLimit: limit === "" ? null : Number(limit) }).then(() => "Saved."))}>Save</button>
      </div>

      {f.members.length > 0 && (
        <div className="tablebox">
          <table style={{ minWidth: 560 }}>
            <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Move to</th><th></th></tr></thead>
            <tbody>
              {f.members.map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: "normal" }}><b>{m.name || m.email}</b>{m.isYou && <span className="pill info" style={{ marginLeft: 6 }}>You</span>}{m.name && <div className="small muted">{m.email}</div>}</td>
                  <td>
                    <select aria-label={`Role for ${m.email}`} value={m.role} disabled={busy === m.id}
                      onChange={(e) => act(m.id, () => send(`/api/admin/members/${m.id}`, "PATCH", { role: e.target.value }))}>
                      <option value="parent">Parent</option><option value="child">Child</option>
                    </select>
                  </td>
                  <td>{m.signedIn ? <span className="pill good">Signed in</span> : <span className="pill warn">Invited</span>}</td>
                  <td>
                    {others.length > 0 ? (
                      <select aria-label={`Move ${m.email}`} value="" disabled={busy === m.id}
                        onChange={(e) => e.target.value && act(m.id, () => send(`/api/admin/members/${m.id}`, "PATCH", { familyId: e.target.value }).then(() => `Moved ${m.email}.`))}>
                        <option value="">—</option>{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    ) : <span className="muted small">—</span>}
                  </td>
                  <td>{!m.isYou && (
                    <button className="btn sm danger" disabled={busy === m.id}
                      onClick={() => confirm === m.id ? act(m.id, () => send(`/api/admin/members/${m.id}`, "DELETE").then(() => `Removed ${m.email}.`)) : setConfirm(m.id)}>
                      {confirm === m.id ? "Confirm" : "Remove"}
                    </button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field"><label className="label" htmlFor={`ae-${f.id}`}>Add someone by email</label>
          <input id={`ae-${f.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoCapitalize="off" /></div>
        <div className="field" style={{ maxWidth: 160 }}><label className="label" htmlFor={`ar-${f.id}`}>As</label>
          <select id={`ar-${f.id}`} value={role} onChange={(e) => setRole(e.target.value as "parent" | "child")}
            style={{ border: "1px solid var(--rule)", background: "var(--paper)", borderRadius: 8, padding: "9px 11px" }}>
            <option value="child">Child</option><option value="parent">Parent</option>
          </select></div>
        <button className="btn primary" disabled={!email.includes("@") || busy === "add"}
          onClick={() => act("add", async () => {
            const r = await send("/api/admin/members", "POST", { familyId: f.id, email, role });
            setEmail("");
            return r.linked ? `${email} already had an account and is now in ${f.name}.`
              : r.invited ? `Invitation emailed to ${email}. They'll be in ${f.name} once they sign up.`
              : `Added ${email}, but the invitation didn't send: ${r.inviteError} Send one from Clerk → Users → Invite.`;
          })}>Add</button>
      </div>

      {msg && <p className={`small ${msg.ok ? "muted" : "err"}`}>{msg.text}</p>}
      {f.members.length === 0 && (
        <button className="btn sm danger" style={{ alignSelf: "flex-start" }} disabled={busy === "del"}
          onClick={() => confirm === "fam" ? act("del", () => send(`/api/admin/families/${f.id}`, "DELETE")) : setConfirm("fam")}>
          {confirm === "fam" ? "Confirm: delete this family and everything it made" : "Delete family"}
        </button>
      )}
    </section>
  );
}
