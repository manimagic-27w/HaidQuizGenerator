"use client";

import type { Student } from "@/lib/auth";

/** Choose who sees a quiz. An empty selection means every student. */
export default function AssignPicker({ students, value, onChange, idPrefix }: {
  students: Student[]; value: string[]; onChange: (ids: string[]) => void; idPrefix: string;
}) {
  if (!students.length) {
    return <p className="small muted">No students have signed up yet, so this quiz goes to everyone. Invite a student in Clerk and they&apos;ll show up here.</p>;
  }
  const everyone = value.length === 0;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className="assign">
      <legend className="label">Assign to</legend>
      <label className="check">
        <input type="checkbox" id={`${idPrefix}-all`} checked={everyone} onChange={() => onChange([])} />
        <span>Every student</span>
      </label>
      {students.map((s) => (
        <label className="check" key={s.id}>
          <input type="checkbox" id={`${idPrefix}-${s.id}`} checked={value.includes(s.id)} onChange={() => toggle(s.id)} />
          <span>{s.name}{s.name !== s.email && <span className="muted small"> · {s.email}</span>}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function assigneeLabel(assignedTo: string[], students: Student[]) {
  if (!assignedTo.length) return "Every student";
  const names = assignedTo.map((id) => students.find((s) => s.id === id)?.name).filter(Boolean) as string[];
  return names.length ? names.join(", ") : "A student who no longer has an account";
}
