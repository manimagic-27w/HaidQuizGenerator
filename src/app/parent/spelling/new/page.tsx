import Link from "next/link";
import { listStudents, requireParent } from "@/lib/auth";
import SpellingImport from "./SpellingImport";

export default async function NewSpellingPage() {
  await requireParent();
  const students = await listStudents();
  return (
    <>
      <section className="stack">
        <Link href="/parent" className="small">← Parent dashboard</Link>
        <h1>New spelling list</h1>
        <p className="muted">Type or paste the words, or snap a photo of the list from school. Claude adds a sentence and meaning for each word and picks the tricky letters for Missing Letters.</p>
      </section>
      <SpellingImport students={students} />
    </>
  );
}
