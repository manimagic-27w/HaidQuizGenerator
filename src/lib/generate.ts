import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const QUESTION_COUNT = 20;

export const draftQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(600),
  choices: z.array(z.string().trim().min(1).max(300)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(600).default(""),
  topic: z.string().trim().max(80).default(""),
});
export const draftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(40).default(""),
  studyNotes: z.string().trim().max(30000).default(""),
  sourceQuizId: z.string().uuid().nullish(),
  questions: z.array(draftQuestionSchema).min(1).max(40),
});
export type Draft = z.infer<typeof draftSchema>;

export type StudyFile = { mediaType: string; base64: string };

/** A question the student got wrong or skipped on an earlier round. */
export type Miss = { topic: string; prompt: string; correct: string; picked: string | null; times: number };

const RULES = `Rules:
- Mix vocabulary, recall and understanding questions. No trick wording.
- Each question has exactly 4 answer choices with one clearly correct answer. Wrong choices should be plausible to a student who did not study. Never use "All of the above" or "None of the above".
- Spread the correct answer across positions A-D.
- Keep the language at an 8th-grade reading level.
- Give a one-sentence explanation of why the correct answer is right.
- Tag each question with a short topic (2-5 words) naming the part of the material it tests, e.g. "Water cycle stages" or "Causes of the Civil War". Reuse the same topic names for questions on the same part.`;

const FIRST_PROMPT = (focus: string) => `You are writing a practice quiz for an 8th-grade student. The attached file(s) are a study guide from their class.${
  focus ? `\nA parent added this note: "${focus}"` : ""
}

Do two things, and deliver both in one call to the save_quiz tool (do not write them out as text):

1. study_notes: a thorough outline of everything on the study guide, organized under the guide's own section headings. Include every key term with its definition, every fact, date, name, formula, process step and example that a test question could ask about. Plain text with headings and bullet points, typically 400-1500 words. These notes replace the original pages later, when new quizzes are written without them, so leave nothing testable out.

2. questions: exactly ${QUESTION_COUNT} multiple-choice questions that test the material on the study guide.
- Use only facts, terms and ideas that appear on the study guide. You may phrase questions as application or "which best explains" questions.
- Cover the whole guide rather than clustering on one section.
- Skip anything you cannot read clearly.

${RULES}

If the files are not a study guide, notes, or class material, call save_quiz with not_study_material set to a short reason and an empty questions list.`;

const ROUND_PROMPT = (o: { notes: string; title: string; misses: Miss[]; previous: string[]; focus: string; reviewShare: number }) => {
  const missText = o.misses.length
    ? o.misses.map((m, i) => `${i + 1}. [${m.topic || "untagged"}] ${m.prompt}\n   Correct answer: ${m.correct}\n   ${m.picked ? `Student answered: ${m.picked}` : "Student skipped it"}${m.times > 1 ? ` (missed ${m.times} times)` : ""}`).join("\n")
    : "";
  const reviewCount = o.misses.length ? Math.max(4, Math.min(QUESTION_COUNT - 4, Math.round(QUESTION_COUNT * o.reviewShare))) : 0;
  return `You are writing a new practice quiz for an 8th-grade student. Below are study notes taken from their class study guide for "${o.title}", followed by what the student has gotten wrong on earlier quizzes from this guide.${
    o.focus ? `\nA parent added this note: "${o.focus}"` : ""
  }

<study_notes>
${o.notes}
</study_notes>

${o.misses.length ? `<missed_questions>
${missText}
</missed_questions>

Write exactly ${QUESTION_COUNT} NEW multiple-choice questions:
- About ${reviewCount} of them should target the concepts behind the missed questions, weighted toward the topics missed most. Ask about each concept from a different angle than before: new wording, an application or example, a related fact, or the reverse direction (term from definition instead of definition from term). Never repeat a missed question with its choices reshuffled. Where the student's wrong answer shows a specific mix-up, write a question whose wrong choices test that same mix-up.
- Use the rest to cover other parts of the notes so the whole guide stays fresh.
- Mix the review questions in with the others rather than putting them first.` : `The student has no misses on record yet. Write exactly ${QUESTION_COUNT} NEW multiple-choice questions covering the whole guide, a little harder than a first pass.`}

Do not reuse any of these earlier questions; ask about different details or from a different angle:
<earlier_questions>
${o.previous.map((p) => `- ${p}`).join("\n")}
</earlier_questions>

Use only facts in the study notes.

${RULES}

Deliver the quiz by calling the save_quiz tool once with all ${QUESTION_COUNT} questions. Do not write it out as text. Leave study_notes empty.`;
};

const tool: Anthropic.Tool = {
  name: "save_quiz",
  description: "Save the finished multiple-choice quiz.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short quiz title, e.g. 'Chapter 7: The Water Cycle'" },
      subject: { type: "string", description: "School subject, e.g. Science, History, ELA, Math" },
      study_notes: { type: "string", description: "Thorough outline of the study guide's content (first quiz only)." },
      not_study_material: { type: "string", description: "Only set when the files are not class material; explain why in one sentence." },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            choices: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
            correct_index: { type: "integer", minimum: 0, maximum: 3, description: "0-based index of the correct choice" },
            explanation: { type: "string" },
            topic: { type: "string", description: "2-5 word name of the part of the material this tests" },
          },
          required: ["question", "choices", "correct_index", "explanation", "topic"],
        },
      },
    },
    required: ["title", "subject", "questions"],
  },
};

export class StudyGuideError extends Error {}

type RawQuiz = {
  title?: string; subject?: string; study_notes?: string; not_study_material?: string;
  questions?: { question?: string; choices?: string[]; correct_index?: number; explanation?: string; topic?: string }[];
};

async function ask(content: Anthropic.ContentBlockParam[]): Promise<RawQuiz> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 20000,
    tools: [tool],
    tool_choice: { type: "auto" }, // some models refuse forced tool use; the prompt asks for save_quiz
    messages: [{ role: "user", content }],
  });
  const use = msg.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  let raw: unknown = use?.input;
  if (!raw) {
    // Fallback: the model answered in text. Take the JSON object out of it.
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start >= 0 && end > start) { try { raw = JSON.parse(text.slice(start, end + 1)); } catch { /* handled below */ } }
  }
  if (!raw) throw new StudyGuideError(msg.stop_reason === "max_tokens" ? "The quiz was cut off before it finished. Try fewer pages." : "Claude didn't return a quiz. Try again.");
  return raw as RawQuiz;
}

function toQuestions(input: RawQuiz) {
  const questions = (input.questions || [])
    .map((q) => draftQuestionSchema.safeParse({
      prompt: q.question, choices: q.choices, answerIndex: q.correct_index, explanation: q.explanation ?? "", topic: q.topic ?? "",
    }))
    .filter((r) => r.success)
    .map((r) => r.data!);
  if (!questions.length) throw new StudyGuideError("The questions came back incomplete. Try again.");
  return questions;
}

/** First quiz from uploaded pages. Also returns the study notes so later rounds don't need the files. */
export async function generateQuiz(files: StudyFile[], focus: string): Promise<Draft> {
  const content: Anthropic.ContentBlockParam[] = files.map((f) =>
    f.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } }
      : { type: "image", source: { type: "base64", media_type: f.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: f.base64 } },
  );
  content.push({ type: "text", text: FIRST_PROMPT(focus) });
  const input = await ask(content);
  if (input.not_study_material && !input.questions?.length) {
    throw new StudyGuideError(`That doesn't look like a study guide: ${input.not_study_material}`);
  }
  return {
    title: (input.title || "Study guide quiz").slice(0, 120),
    subject: (input.subject || "").slice(0, 40),
    studyNotes: (input.study_notes || "").trim().slice(0, 30000),
    questions: toQuestions(input),
  };
}

/** A new round written from saved study notes, aimed at what the student missed. */
export async function generateRound(o: {
  notes: string; title: string; subject: string; misses: Miss[]; previous: string[]; focus: string; reviewShare: number;
}): Promise<Omit<Draft, "title" | "sourceQuizId" | "studyNotes" | "subject"> & { subject: string }> {
  const input = await ask([{ type: "text", text: ROUND_PROMPT(o) }]);
  return { subject: o.subject, questions: toQuestions(input) };
}

/** Turn an Anthropic API failure into a message a parent can act on. */
export function apiErrorMessage(e: unknown): string {
  const err = e as { status?: number; message?: string; error?: { error?: { message?: string } } };
  const status = err.status;
  const detail = err.error?.error?.message || err.message || "";
  return /credit balance/i.test(detail) ? "Your Anthropic account is out of API credits. Add credits at console.anthropic.com > Billing, then try again."
    : status === 429 ? "The Claude API is busy or your usage limit was reached. Try again in a few minutes."
    : status === 401 ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel."
    : status === 404 ? `The model "${process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"}" wasn't found. Check ANTHROPIC_MODEL in Vercel. (${detail})`
    : status === 413 || /too large|too many pages|exceed/i.test(detail) ? `That file is too big for one request. Try fewer pages. (${detail})`
    : `Something went wrong while writing questions${status ? ` (error ${status})` : ""}: ${detail || "no details"}`;
}
