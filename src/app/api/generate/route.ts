import { NextResponse } from "next/server";
import { apiParent } from "@/lib/auth";
import { limitReached, recordGeneration } from "@/lib/usage";
import { apiErrorMessage, generateQuiz, StudyGuideError, type StudyFile } from "@/lib/generate";

export const runtime = "nodejs";
export const maxDuration = 300; // reading a multi-page guide and writing 20 questions can take a minute or two

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 4_300_000; // Vercel caps request bodies at 4.5 MB

export async function POST(req: Request) {
  const viewer = await apiParent();
  if (!viewer) return NextResponse.json({ error: "Only a parent can make quizzes." }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't set in the Vercel environment variables." }, { status: 500 });
  }

  const blocked = await limitReached(viewer.familyId);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

  const form = await req.formData();
  const focus = String(form.get("focus") || "").slice(0, 400);
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!uploads.length) return NextResponse.json({ error: "Add at least one photo or PDF." }, { status: 400 });

  let total = 0;
  const files: StudyFile[] = [];
  for (const f of uploads) {
    const type = f.type === "application/pdf" || IMAGE_TYPES.includes(f.type) ? f.type : null;
    if (!type) return NextResponse.json({ error: `${f.name} isn't a photo or PDF.` }, { status: 400 });
    total += f.size;
    if (total > MAX_BYTES) {
      return NextResponse.json({ error: "The files are too large together. Use fewer pages or a smaller PDF (under about 4 MB)." }, { status: 413 });
    }
    files.push({ mediaType: type, base64: Buffer.from(await f.arrayBuffer()).toString("base64") });
  }

  try {
    const draft = await generateQuiz(files, focus);
    await recordGeneration(viewer.familyId, viewer.id, "quiz");
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof StudyGuideError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("generate failed", e);
    return NextResponse.json({ error: apiErrorMessage(e) }, { status: 502 });
  }
}
