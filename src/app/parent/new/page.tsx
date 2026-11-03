import Link from "next/link";
import { requireParent } from "@/lib/auth";
import NewQuiz from "./NewQuiz";

export default async function NewQuizPage() {
  await requireParent();
  return (
    <>
      <section className="stack">
        <Link href="/parent" className="small">← Parent dashboard</Link>
        <h1>New quiz</h1>
        <p className="muted">Upload photos of the study guide or a PDF. Claude writes 20 questions, you check them, then publish.</p>
      </section>
      <NewQuiz />
    </>
  );
}
