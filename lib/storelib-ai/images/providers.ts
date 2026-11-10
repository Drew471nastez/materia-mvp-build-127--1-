/**
 * ===========================================================================
 *  THE THREE PICTURE SERVICES, OVER HTTP (round P, P1)
 * ===========================================================================
 * Each call takes its key and a fetch, and gives back bytes or a plain
 * failure. Nothing here reads the environment or the database (./generate.ts
 * does), so the tests drive each one with a fake fetch and check the request
 * against the provider's documented shape.
 *
 *   OpenAI   POST https://api.openai.com/v1/images/generations
 *            { model, prompt, n: 1, size, quality, output_format, moderation }
 *            → { data: [{ b64_json }], usage? }. GPT image models always answer
 *            base64 (response_format is not sent). gpt-image-1 was shut down on
 *            2026-10-23; its documented replacement gpt-image-2.5-flare is the
 *            default, overridable by OPENAI_IMAGE_MODEL. A model the account
 *            does not have (404, model_not_found) moves to the next one.
 *   Gemini   POST {base}/interactions (the Interactions API, Api-Revision
 *            2026-05-20) { model, input: [{ type: "text", text }],
 *            response_format: { type: "image", mime_type, aspect_ratio,
 *            image_size } } → steps[].content[] { type: "image", data,
 *            mime_type } (outputs[] on the older schema).
 *   Pexels   GET https://api.pexels.com/v1/search?query=&orientation=&per_page=
 *            with Authorization: <key> → photos[] { width, height, url, alt,
 *            photographer, photographer_url, src: { large2x, ... } }; the photo
 *            itself is then downloaded from images.pexels.com only.
 *
 * Every call has a deadline and one retry (a timeout, a dropped connection,
 * 429 or 5xx). A key never appears in an error, a log line or a result.
 */
import type { ImageAspect, StockCredit } from "./types"
import { ASPECT_SIZE } from "./types"

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface CallOptions {
  fetch: Fetch
  /** Per attempt. */
  timeoutMs: number
  /** Between the attempt and its retry. Tests pass 0. */
  retryDelayMs?: number
}

export type ProviderBytes =
  | { ok: true; bytes: Uint8Array; mime: string; model: string; usd: number; estimated: boolean }
  | { ok: false; kind: "auth" | "refused" | "unavailable" | "failed"; message: string }

/* ── shared ─────────────────────────────────────────────────────────── */

/** A provider's words with every key, bearer token and key-shaped string taken out. */
export function scrub(text: string, secrets: (string | undefined | null)[] = []): string {
  let out = String(text ?? "")
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[key]")
  return out
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, "[key]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [key]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[key]")
    .slice(0, 300)
}

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

/** One request with a deadline, retried once when it was the network's or the service's fault (not the request's). */
export async function withRetry(call: (signal: AbortSignal) => Promise<Response>, opts: CallOptions): Promise<Response | { error: string }> {
  let last = "no answer"
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(opts.retryDelayMs ?? 1_500)
    try {
      const res = await call(AbortSignal.timeout(opts.timeoutMs))
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        last = `status ${res.status}`
        await res.body?.cancel().catch(() => undefined)
        continue
      }
      return res
    } catch (thrown) {
      last = thrown instanceof Error && (thrown.name === "TimeoutError" || thrown.name === "AbortError") ? "timed out" : "the connection failed"
    }
  }
  return { error: last }
}

async function errorText(res: Response): Promise<{ code: string; message: string }> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown; status?: unknown } | string } | null
  const e = body?.error
  if (typeof e === "string") return { code: "", message: e }
  return { code: String(e?.code ?? e?.status ?? ""), message: String(e?.message ?? `status ${res.status}`) }
}

function base64Bytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"))
}

/* ── OpenAI ─────────────────────────────────────────────────────────── */

export const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"
/** gpt-image-1 was shut down 2026-10-23 (OpenAI deprecations); these are its documented replacements, in order. */
export const OPENAI_IMAGE_MODELS = ["gpt-image-2.5-flare", "gpt-image-2.6-flare"] as const
export type ImageQuality = "low" | "medium" | "high"

/**
 * USD per picture when the answer carries no usage: the published per-image
 * figures for GPT image models at these sizes (square, then the 3:2 sizes).
 * An over-estimate for the 2.5/2.6 models, whose output tokens cost less.
 */
const OPENAI_ESTIMATE: Record<ImageQuality, [number, number]> = { low: [0.011, 0.016], medium: [0.042, 0.063], high: [0.167, 0.25] }

export function openAIEstimate(aspect: ImageAspect, quality: ImageQuality): number {
  return OPENAI_ESTIMATE[quality][aspect === "square" ? 0 : 1]
}

/** Per 1M tokens (developers.openai.com/api/docs/pricing, GPT image 2.x): text in, image in, image out. */
const OPENAI_RATES = { text: 5, imageIn: 8, out: 30 }

export function openAIUsageUsd(usage: unknown): number | null {
  const u = usage as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } } | null
  if (!u || typeof u.output_tokens !== "number") return null
  const textIn = u.input_tokens_details?.text_tokens ?? u.input_tokens ?? 0
  const imageIn = u.input_tokens_details?.image_tokens ?? 0
  return Math.round(((textIn * OPENAI_RATES.text + imageIn * OPENAI_RATES.imageIn + u.output_tokens * OPENAI_RATES.out) / 1e6) * 1e6) / 1e6
}

export async function openAIImage(input: { key: string; prompt: string; aspect: ImageAspect; quality: ImageQuality; models: readonly string[] }, opts: CallOptions): Promise<ProviderBytes> {
  let last: ProviderBytes = { ok: false, kind: "failed", message: "no model answered" }
  for (const model of input.models) {
    const body = {
      model,
      prompt: input.prompt,
      n: 1,
      size: ASPECT_SIZE[input.aspect].openai,
      quality: input.quality,
      output_format: "jpeg",
      output_compression: 88,
      moderation: "auto",
    }
    const res = await withRetry(
      (signal) => opts.fetch(OPENAI_IMAGES_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.key}` }, body: JSON.stringify(body), signal }),
      opts,
    )
    if ("error" in res) return { ok: false, kind: "unavailable", message: `OpenAI images ${res.error}` }
    if (!res.ok) {
      const e = await errorText(res)
      const message = scrub(`OpenAI images: ${e.message}`, [input.key])
      if (res.status === 401 || res.status === 403) return { ok: false, kind: "auth", message }
      if (res.status === 404 || /model_not_found|does not exist|not found/i.test(`${e.code} ${e.message}`)) {
        last = { ok: false, kind: "unavailable", message }
        continue
      }
      if (/moderation|safety|content_policy/i.test(`${e.code} ${e.message}`)) return { ok: false, kind: "refused", message: "OpenAI's safety check refused this picture." }
      return { ok: false, kind: res.status === 429 || res.status >= 500 ? "unavailable" : "failed", message }
    }
    const json = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; usage?: unknown } | null
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) return { ok: false, kind: "failed", message: "OpenAI images answered without a picture." }
    const measured = openAIUsageUsd(json?.usage)
    return { ok: true, bytes: base64Bytes(b64), mime: "image/jpeg", model, usd: measured ?? openAIEstimate(input.aspect, input.quality), estimated: measured === null }
  }
  return last
}

/* ── Gemini ─────────────────────────────────────────────────────────── */

export const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta"
/** ai.google.dev image generation (Nano Banana 2.1 recommended; 3.1 Flash Image the one before). */
export const GEMINI_IMAGE_MODELS = ["gemini-nano-banana-2.1", "gemini-3.1-flash-image"] as const
export const GEMINI_API_REVISION = "2026-05-20"
/** The docs give no per-image price; a cautious estimate, overridable by GEMINI_IMAGE_USD. */
export const GEMINI_IMAGE_ESTIMATE_USD = 0.07

type GeminiBlock = { type?: string; data?: string; mime_type?: string; mimeType?: string }

/** The last image block in an interaction, whichever schema answered (steps, or the older outputs). */
export function geminiImageOf(json: unknown): { data: string; mime: string } | null {
  const j = json as { steps?: { type?: string; content?: GeminiBlock[] }[]; outputs?: GeminiBlock[]; output_image?: GeminiBlock } | null
  const blocks: GeminiBlock[] = []
  for (const step of j?.steps ?? []) for (const b of step?.content ?? []) blocks.push(b)
  for (const b of j?.outputs ?? []) blocks.push(b)
  if (j?.output_image) blocks.push({ type: "image", ...j.output_image })
  const img = blocks.filter((b) => b?.type === "image" && typeof b.data === "string" && b.data.length > 0).pop()
  return img ? { data: img.data as string, mime: img.mime_type ?? img.mimeType ?? "image/jpeg" } : null
}

export async function geminiImage(input: { key: string; prompt: string; aspect: ImageAspect; models: readonly string[]; base?: string; usd?: number }, opts: CallOptions): Promise<ProviderBytes> {
  const base = (input.base || GEMINI_DEFAULT_BASE).replace(/\/+$/, "")
  let last: ProviderBytes = { ok: false, kind: "failed", message: "no model answered" }
  for (const model of input.models) {
    const body = {
      model,
      input: [{ type: "text", text: input.prompt }],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: ASPECT_SIZE[input.aspect].ratio, image_size: "1K" },
    }
    const res = await withRetry(
      (signal) => opts.fetch(`${base}/interactions`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": input.key, "Api-Revision": GEMINI_API_REVISION }, body: JSON.stringify(body), signal }),
      opts,
    )
    if ("error" in res) return { ok: false, kind: "unavailable", message: `Gemini images ${res.error}` }
    if (!res.ok) {
      const e = await errorText(res)
      const message = scrub(`Gemini images: ${e.message}`, [input.key])
      if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/.test(e.code)) return { ok: false, kind: "auth", message }
      if (res.status === 404 || /NOT_FOUND/.test(e.code)) {
        last = { ok: false, kind: "unavailable", message }
        continue
      }
      return { ok: false, kind: res.status === 429 || res.status >= 500 ? "unavailable" : "failed", message }
    }
    const json = await res.json().catch(() => null)
    const img = geminiImageOf(json)
    /* An answer with no picture is the model's safety filter, or a text reply instead of a picture. */
    if (!img) return { ok: false, kind: "refused", message: "Gemini answered without a picture (its safety check, or it would not draw this)." }
    return { ok: true, bytes: base64Bytes(img.data), mime: img.mime, model, usd: input.usd ?? GEMINI_IMAGE_ESTIMATE_USD, estimated: true }
  }
  return last
}

/* ── Pexels ─────────────────────────────────────────────────────────── */

export const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search"
const PEXELS_IMAGE_HOST = "images.pexels.com"

export type StockPhoto =
  | { ok: true; bytes: Uint8Array; mime: string; width: number; height: number; alt: string; credit: StockCredit }
  | { ok: false; kind: "auth" | "none" | "unavailable" | "failed"; message: string }

export async function pexelsPhoto(input: { key: string; query: string; aspect: ImageAspect; pick?: number }, opts: CallOptions): Promise<StockPhoto> {
  const url = `${PEXELS_SEARCH_URL}?${new URLSearchParams({ query: input.query.slice(0, 120), orientation: input.aspect, size: "large", per_page: "10" })}`
  const res = await withRetry((signal) => opts.fetch(url, { method: "GET", headers: { Authorization: input.key }, signal }), opts)
  if ("error" in res) return { ok: false, kind: "unavailable", message: `Pexels ${res.error}` }
  if (!res.ok) {
    const message = scrub(`Pexels: status ${res.status}`, [input.key])
    return { ok: false, kind: res.status === 401 || res.status === 403 ? "auth" : res.status === 429 || res.status >= 500 ? "unavailable" : "failed", message }
  }
  const json = (await res.json().catch(() => null)) as { photos?: { width?: number; height?: number; url?: string; alt?: string; photographer?: string; photographer_url?: string; src?: Record<string, string> }[] } | null
  const usable = (json?.photos ?? []).filter((p) => {
    const src = p?.src?.large2x ?? p?.src?.large
    try {
      return !!src && new URL(src).hostname === PEXELS_IMAGE_HOST && !!p.photographer
    } catch {
      return false
    }
  })
  /* The first match, or another of the matches for a Regenerate. */
  const photo = usable.length ? usable[Math.abs(Math.floor(input.pick ?? 0)) % usable.length] : undefined
  if (!photo) return { ok: false, kind: "none", message: "No stock photo matched." }
  const src = (photo.src?.large2x ?? photo.src?.large) as string
  const img = await withRetry((signal) => opts.fetch(src, { method: "GET", signal, redirect: "error" }), opts)
  if ("error" in img || !img.ok) return { ok: false, kind: "unavailable", message: "The stock photo could not be downloaded." }
  const len = Number(img.headers.get("content-length") ?? 0)
  if (len > 15 * 1024 * 1024) return { ok: false, kind: "failed", message: "The stock photo is too large." }
  const bytes = new Uint8Array(await img.arrayBuffer())
  /* large2x is sized to a 940 px box at 2x: the real pixels are measured from the bytes later; these are the photo's own. */
  return {
    ok: true,
    bytes,
    mime: img.headers.get("content-type") ?? "image/jpeg",
    width: Number(photo.width) || 0,
    height: Number(photo.height) || 0,
    alt: String(photo.alt ?? "").slice(0, 200),
    credit: { provider: "pexels", photographer: String(photo.photographer).slice(0, 120), photographerUrl: photo.photographer_url ?? null, sourceUrl: photo.url ?? null },
  }
}
