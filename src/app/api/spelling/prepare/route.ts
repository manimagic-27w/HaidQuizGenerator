import { NextResponse } from "next/server";
import { apiParent } from "@/lib/auth";
import { limitReached, recordGeneration } from "@/lib/usage";
import { apiErrorMessage, StudyGuideError, type StudyFile } from "@/lib/generate";
import { parseWordList } from "@/lib/spelling";
import { prepareSpellingList } from "@/lib/spellingAi";

export const runtime = "nodejs";
export const maxDuration = 120;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 4_300_000;

/** Read a spelling list from a photo/PDF and/or typed words; add a sentence, meaning and tricky letters for each. */
export async function POST(req: Request) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Only a parent can add spelling lists." }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't set in the Vercel environment variables." }, { status: 500 });

  const blocked = await limitReached(viewer.familyId);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  const form = await req.formData();
  const typed = parseWordList(String(form.get("words") || ""));
  const note = String(form.get("note") || "").slice(0, 300);
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!typed.length && !uploads.length) return NextResponse.json({ error: "Type some words or add a photo of the list." }, { status: 400 });

  let total = 0;
  const files: StudyFile[] = [];
  for (const f of uploads) {
    if (f.type !== "application/pdf" && !IMAGE_TYPES.includes(f.type)) return NextResponse.json({ error: `${f.name} isn't a photo or PDF.` }, { status: 400 });
    total += f.size;
    if (total > MAX_BYTES) return NextResponse.json({ error: "The files are too large together. Use one photo or a smaller PDF." }, { status: 413 });
    files.push({ mediaType: f.type, base64: Buffer.from(await f.arrayBuffer()).toString("base64") });
  }

  try {
    const draft = await prepareSpellingList(files, typed, note);
    await recordGeneration(viewer.familyId, viewer.id, "spelling");
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof StudyGuideError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("spelling prepare failed", e);
    return NextResponse.json({ error: apiErrorMessage(e) }, { status: 502 });
  }
}
