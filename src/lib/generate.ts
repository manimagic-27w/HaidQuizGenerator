import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const QUESTION_COUNT = 20;

export const draftQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(600),
  choices: z.array(z.string().trim().min(1).max(300)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(600).default(""),
});
export const draftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(40).default(""),
  questions: z.array(draftQuestionSchema).min(1).max(40),
});
export type Draft = z.infer<typeof draftSchema>;

export type StudyFile = { mediaType: string; base64: string };

const PROMPT = (focus: string) => `You are writing a practice quiz for an 8th-grade student. The attached file(s) are a study guide from their class.${
  focus ? `\nA parent added this note: "${focus}"` : ""
}

Write exactly ${QUESTION_COUNT} multiple-choice questions that test the material on the study guide, and save them with the save_quiz tool.

Rules:
- Use only facts, terms and ideas that appear on the study guide. You may phrase questions as application or "which best explains" questions.
- Cover the whole guide rather than clustering on one section.
- Mix vocabulary, recall and understanding questions. No trick wording.
- Each question has exactly 4 answer choices with one clearly correct answer. Wrong choices should be plausible to a student who did not study. Never use "All of the above" or "None of the above".
- Spread the correct answer across positions A-D.
- Keep the language at an 8th-grade reading level.
- Give a one-sentence explanation of why the correct answer is right.
- Skip anything you cannot read clearly.
- If the files are not a study guide, notes, or class material, call save_quiz with not_study_material set to a short reason and an empty questions list.`;

const tool: Anthropic.Tool = {
  name: "save_quiz",
  description: "Save the finished multiple-choice quiz.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short quiz title, e.g. 'Chapter 7: The Water Cycle'" },
      subject: { type: "string", description: "School subject, e.g. Science, History, ELA, Math" },
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
          },
          required: ["question", "choices", "correct_index", "explanation"],
        },
      },
    },
    required: ["title", "subject", "questions"],
  },
};

export class StudyGuideError extends Error {}

export async function generateQuiz(files: StudyFile[], focus: string): Promise<Draft> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const content: Anthropic.ContentBlockParam[] = files.map((f) =>
    f.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } }
      : { type: "image", source: { type: "base64", media_type: f.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: f.base64 } },
  );
  content.push({ type: "text", text: PROMPT(focus) });

  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 12000,
    tools: [tool],
    tool_choice: { type: "tool", name: "save_quiz" },
    messages: [{ role: "user", content }],
  });

  const use = msg.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!use) throw new StudyGuideError("Claude didn't return a quiz. Try again.");
  const input = use.input as {
    title?: string; subject?: string; not_study_material?: string;
    questions?: { question?: string; choices?: string[]; correct_index?: number; explanation?: string }[];
  };
  if (input.not_study_material && !input.questions?.length) {
    throw new StudyGuideError(`That doesn't look like a study guide: ${input.not_study_material}`);
  }
  const questions = (input.questions || [])
    .map((q) => draftQuestionSchema.safeParse({
      prompt: q.question, choices: q.choices, answerIndex: q.correct_index, explanation: q.explanation ?? "",
    }))
    .filter((r) => r.success)
    .map((r) => r.data!);
  if (!questions.length) throw new StudyGuideError("The questions came back incomplete. Try again.");
  return {
    title: (input.title || "Study guide quiz").slice(0, 120),
    subject: (input.subject || "").slice(0, 40),
    questions,
  };
}
