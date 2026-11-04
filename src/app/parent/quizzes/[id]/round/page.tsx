import Link from "next/link";
import { notFound } from "next/navigation";
import { listStudents, requireParent } from "@/lib/auth";
import { familyMisses, familyNotes, familyTakers, loadFamily, nextRound, topicCounts } from "@/lib/rounds";
import NextRound, { type FocusOption } from "./NextRound";

export const dynamic = "force-dynamic";

export default async function NextRoundPage({ params }: { params: Promise<{ id: string }> }) {
  await requireParent();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const f = await loadFamily(id);
  if (!f) notFound();

  const ids = f.members.map((m) => m.id);
  const [students, takers] = await Promise.all([listStudents(), familyTakers(ids)]);
  const { notes, fromQuestions } = familyNotes(f);
  const { round, title } = nextRound(f);

  // One focus option per student who has taken a round, plus "everyone combined" when there are several.
  const options: FocusOption[] = [];
  for (const sid of takers) {
    const misses = await familyMisses(ids, sid);
    options.push({ id: sid, name: students.find((s) => s.id === sid)?.name || "Student", misses, topics: topicCounts(misses) });
  }
  if (takers.length > 1) {
    const misses = await familyMisses(ids, null);
    options.unshift({ id: null, name: "All students combined", misses, topics: topicCounts(misses) });
  }
  const assigned = f.quiz.assignedTo;
  const defaultFocus = options.find((o) => o.id && assigned.length === 1 && o.id === assigned[0])?.id ?? options[0]?.id ?? null;

  return (
    <>
      <section className="stack">
        <Link href="/parent" className="small">← Parent dashboard</Link>
        <h1>Round {round}</h1>
        <p className="muted">
          A fresh set of 20 questions on <b>{f.members[0].title.replace(/\s*·\s*Round \d+$/i, "")}</b>, written from the saved study guide notes.
          No upload needed. About half go back over what was missed, asked a different way.
        </p>
        <p className="small muted">{f.members.length} {f.members.length === 1 ? "quiz" : "quizzes"} from this guide so far · {f.questions.length} questions already used, none will be repeated</p>
      </section>
      <NextRound quizId={f.quiz.id} title={title} notes={notes} notesFromQuestions={fromQuestions}
        options={options} defaultFocus={defaultFocus} students={students} assignedTo={assigned} />
    </>
  );
}
