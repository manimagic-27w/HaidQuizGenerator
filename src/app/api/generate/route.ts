import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { generateQuiz, StudyGuideError, type StudyFile } from "@/lib/generate";

export const runtime = "nodejs";
export const maxDuration = 300; // reading a multi-page guide and writing 20 questions can take a minute or two

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 4_300_000; // Vercel caps request bodies at 4.5 MB

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isParent) return NextResponse.json({ error: "Only a parent can make quizzes." }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't set in the Vercel environment variables." }, { status: 500 });
  }

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
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof StudyGuideError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("generate failed", e);
    const err = e as { status?: number; message?: string; error?: { error?: { message?: string } } };
    const status = err.status;
    const detail = err.error?.error?.message || err.message || "";
    const msg = /credit balance/i.test(detail) ? "Your Anthropic account is out of API credits. Add credits at console.anthropic.com > Billing, then try again."
      : status === 429 ? "The Claude API is busy or your usage limit was reached. Try again in a few minutes."
      : status === 401 ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel."
      : status === 404 ? `The model "${process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"}" wasn't found. Check ANTHROPIC_MODEL in Vercel. (${detail})`
      : status === 413 || /too large|too many pages|exceed/i.test(detail) ? `That file is too big for one request. Try fewer pages. (${detail})`
      : `Something went wrong while writing questions${status ? ` (error ${status})` : ""}: ${detail || "no details"}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
