import { listStudents } from "@/lib/auth";

/** Keep only ids of real students; an empty list means every student. */
export async function cleanAssignees(ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids) || !ids.length) return [];
  const known = new Set((await listStudents()).map((s) => s.id));
  return [...new Set(ids.filter((x): x is string => typeof x === "string" && known.has(x)))];
}
