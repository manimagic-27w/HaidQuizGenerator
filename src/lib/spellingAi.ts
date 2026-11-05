import Anthropic from "@anthropic-ai/sdk";
import { StudyGuideError, type StudyFile } from "@/lib/generate";
import { cleanTricky, trickyFromPattern, type ListDraft } from "@/lib/spelling";

const PROMPT = (typed: string[], hasFiles: boolean, note: string) => `You are preparing a spelling list for a 5th-grade student's practice games.${
  note ? `\nA parent added this note: "${note}"` : ""
}
${hasFiles ? `The attached image(s) or PDF show the spelling list from school. Read every spelling word exactly as printed, keeping its spelling and capitalization. Include bonus or challenge words. Ignore numbering, headings, directions, names and dates.` : ""}
${typed.length ? `${hasFiles ? "Also include these words the parent typed" : "The words are"}:\n${typed.map((w) => `- ${w}`).join("\n")}` : ""}

For each word give:
- word: the word exactly as spelled on the list.
- sentence: one short, fun sentence a 5th grader would enjoy that uses the word exactly as spelled (same form, no -s/-ed/-ing added). It is read aloud to help the student hear which word is meant.
- meaning: a kid-friendly meaning in under 12 words.
- tricky: the word with its hardest-to-spell letters replaced by underscores, one underscore per letter, same length as the word. Blank the parts students usually get wrong: double letters, silent letters, vowel teams like ie/ei/ou, -tion/-sion, schwa vowels, ph/gh. Blank about a third of the letters; never blank every letter. Example: "necessary" -> "ne_e__ary".

Also give a short title for the list, like "Spelling Week 12" or "Words with -tion" if the list has a theme.

Deliver everything by calling the save_spelling_list tool once. Do not write it out as text.${hasFiles ? `\nIf the files don't contain a spelling or word list, call the tool with not_word_list set to a short reason and an empty words list.` : ""}`;

const tool: Anthropic.Tool = {
  name: "save_spelling_list",
  description: "Save the prepared spelling list.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      not_word_list: { type: "string", description: "Only when the files hold no spelling list." },
      words: {
        type: "array",
        items: {
          type: "object",
          properties: {
            word: { type: "string" }, sentence: { type: "string" }, meaning: { type: "string" },
            tricky: { type: "string", description: "The word with tricky letters replaced by underscores, same length" },
          },
          required: ["word", "sentence", "meaning", "tricky"],
        },
      },
    },
    required: ["title", "words"],
  },
};

export async function prepareSpellingList(files: StudyFile[], typed: string[], note: string): Promise<ListDraft> {
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = files.map((f) =>
    f.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } }
      : { type: "image", source: { type: "base64", media_type: f.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: f.base64 } },
  );
  content.push({ type: "text", text: PROMPT(typed, files.length > 0, note) });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 8000,
    tools: [tool],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
  });
  const use = msg.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  let raw: unknown = use?.input;
  if (!raw) {
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s >= 0 && e > s) { try { raw = JSON.parse(text.slice(s, e + 1)); } catch { /* below */ } }
  }
  if (!raw) throw new StudyGuideError("Claude didn't return the word list. Try again.");
  const input = raw as { title?: string; not_word_list?: string; words?: { word?: string; sentence?: string; meaning?: string; tricky?: string }[] };
  if (input.not_word_list && !input.words?.length) throw new StudyGuideError(`That doesn't look like a spelling list: ${input.not_word_list}`);

  const seen = new Set<string>();
  const words = (input.words || []).flatMap((w) => {
    const word = (w.word || "").trim().slice(0, 40);
    if (!word || seen.has(word.toLowerCase())) return [];
    seen.add(word.toLowerCase());
    return [{
      word,
      sentence: (w.sentence || "").trim().slice(0, 300),
      meaning: (w.meaning || "").trim().slice(0, 200),
      tricky: cleanTricky(word, trickyFromPattern(word, w.tricky)),
    }];
  });
  if (!words.length) throw new StudyGuideError("No words came back. Check the photo or typed list and try again.");
  return { title: (input.title || "Spelling words").slice(0, 120), words: words.slice(0, 60) };
}
