// On-demand image generation via Cloudflare Workers AI (free tier), using FLUX.2 [klein] 4B —
// a fast distilled model that unifies text-to-image AND image editing in one model. Mirrors the
// network-util style of `geocode.ts`: plain module, `fetch` with a timeout, returns a
// result-or-error and never throws to the caller.
//
//   • text → image  — send just a `prompt`.
//   • image → image — also send a reference under `input_image_0` (up to _3). The model edits /
//                     restyles the reference guided by the prompt ("make this a watercolor",
//                     "same scene at night", etc.).
//
// FLUX.2 quirks (verified against the live API):
//   • Input MUST be multipart/form-data — even for a prompt-only request (JSON is rejected).
//   • Reference images MUST be smaller than 512×512, passed as binary file parts. We resize
//     every reference down first (see resizeForReference) or the model silently ignores it.
//   • Steps are fixed at 4 (distilled) — there is no steps/strength knob; the prompt drives it.
//   • Output is base64 in `result.image`. We write it to the document directory as a PNG and
//     return a `file://` URI, so it drops straight into canvas media like any other image.
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import { writeAsStringAsync, documentDirectory } from "expo-file-system/legacy";

const ACCOUNT_ID = process.env.EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.EXPO_PUBLIC_CLOUDFLARE_API_TOKEN;
const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`;

// FLUX.2 requires reference images strictly under 512×512; keep a margin.
const REF_MAX = 480;
// Generation can take several seconds; be generous before giving up.
const TIMEOUT_MS = 60_000;

export type GenResult = { uri: string } | { error: string };

export async function generateImage(opts: {
  prompt: string;
  /** Local file URI of a reference image → switches to image editing / restyle. */
  referenceUri?: string | null;
}): Promise<GenResult> {
  const prompt = opts.prompt.trim();
  if (!prompt) return { error: "Enter a prompt first." };
  if (!ACCOUNT_ID || !API_TOKEN) return { error: "Cloudflare keys not configured." };

  try {
    const form = new FormData();
    form.append("prompt", prompt);
    if (opts.referenceUri) {
      const ref = await resizeForReference(opts.referenceUri);
      if (!ref) return { error: "Couldn't process the reference image." };
      // RN reads the file and sends it as a binary multipart part.
      form.append("input_image_0", { uri: ref, name: "input_image_0.jpg", type: "image/jpeg" } as any);
    }

    // NOTE: do not set Content-Type — fetch adds the multipart boundary for FormData bodies.
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json || json.success === false) {
      return { error: cfError(json) ?? `Generation failed (${res.status}).` };
    }
    const base64: string | undefined = json?.result?.image;
    if (!base64) return { error: "No image returned." };
    return { uri: await writeBase64(base64) };
  } catch (e: any) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return { error: "Generation timed out. Try again." };
    }
    return { error: "Network error. Check your connection." };
  }
}

/** Pick a reference image from the gallery; returns its local URI (unresized). */
export async function pickGalleryImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

/** Download a remote image to cache and return its local URI (for a URL reference). */
export async function downloadImage(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const file = await File.downloadFileAsync(trimmed, Paths.cache);
    return file.uri;
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Downscale a reference so both dimensions are < 512px (FLUX.2 requirement). Constrains width
// first; if the result is still too tall (very portrait images), constrain height too. Also
// normalises content:// gallery URIs to a file:// JPEG that RN FormData can upload.
async function resizeForReference(uri: string): Promise<string | null> {
  try {
    let r = await manipulateAsync(uri, [{ resize: { width: REF_MAX } }], {
      compress: 0.9,
      format: SaveFormat.JPEG,
    });
    if (r.height > REF_MAX) {
      r = await manipulateAsync(r.uri, [{ resize: { height: REF_MAX } }], {
        compress: 0.9,
        format: SaveFormat.JPEG,
      });
    }
    return r.uri;
  } catch {
    return null;
  }
}

function outName(): string {
  return `ai_${Date.now()}_${Math.floor(Math.random() * 1e6)}.png`;
}

async function writeBase64(base64: string): Promise<string> {
  const uri = `${documentDirectory}${outName()}`;
  await writeAsStringAsync(uri, base64, { encoding: "base64" });
  return uri;
}

function cfError(json: any): string | null {
  const first = json?.errors?.[0];
  if (!first) return null;
  return typeof first === "string" ? first : first?.message ?? null;
}
