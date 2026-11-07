import { listStudents } from "@/lib/auth";

/** Keep only ids of this family's students; an empty list means every student in the family. */
export async function cleanAssignees(ids: unknown, familyId: string): Promise<string[]> {
  if (!Array.isArray(ids) || !ids.length) return [];
  const known = new Set((await listStudents(familyId)).map((s) => s.id));
  return [...new Set(ids.filter((x): x is string => typeof x === "string" && known.has(x)))];
}
