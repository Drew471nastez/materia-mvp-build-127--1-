/**
 * ===========================================================================
 *  generateImage / findPhoto: A PICTURE FOR A WEBSITE, KEPT IN ITS FILES (P1)
 * ===========================================================================
 * The chain, first that works wins:
 *
 *   1. OpenAI's image model, on the creator's own OpenAI key when they
 *      connected one (Settings, Your own AI: lib/ai-keys/store), else on
 *      Storelib's OPENAI_API_KEY. Model OPENAI_IMAGE_MODEL, else
 *      gpt-image-2.5-flare (gpt-image-1, named in the brief, was shut down
 *      2026-10-23); quality OPENAI_IMAGE_QUALITY, else medium.
 *   2. Gemini's image model on GEMINI_API_KEY (or GOOGLE_AI_API_KEY), the
 *      key the store translator uses (lib/markets/open-translate.ts), at
 *      GEMINI_API_BASE when set. Model GEMINI_IMAGE_MODEL, else
 *      gemini-nano-banana-2.1.
 *   3. A Pexels stock photo when PEXELS_API_KEY is set (the Pexels licence
 *      allows this use; the photographer's credit is kept on the file).
 *   4. Nothing: { ok: false, code: "no_provider" } in plain words, and the
 *      agent designs that spot without a picture (never a grey box).
 *
 * A creator's own key that is refused is noted on their connection
 * (lib/ai-keys/store noteUse) and NEVER replaced by Storelib's paid
 * providers: the chain goes straight to stock, the same rule the chat agent
 * keeps (lib/sites/agent/provider.ts).
 *
 * An unsafe prompt (./safety.ts) is refused before anything is called; a
 * provider's own safety refusal is final too (not retried elsewhere).
 * `maxUsd` skips a provider whose estimate is over it. Keys are read here
 * and handed to ./providers.ts only; logs carry the provider and a scrubbed
 * reason, never a key.
 */
import "server-only"

import { checkImagePrompt, checkPhotoQuery } from "./safety"
import { altFromPrompt, shapeImagePrompt } from "./prompt"
import { GEMINI_IMAGE_ESTIMATE_USD, GEMINI_IMAGE_MODELS, OPENAI_IMAGE_MODELS, geminiImage, openAIEstimate, openAIImage, pexelsPhoto, scrub, type Fetch, type ImageQuality } from "./providers"
import type { GenerateImageInput, ImageAspect, ImageOrigin, ImageOutcome, ImageProviderId } from "./types"
import type { SavedImage, SaveImageInput } from "./store"

type Env = Record<string, string | undefined>

export interface ImageDeps {
  fetch?: Fetch
  env?: Env
  /** The creator's own OpenAI key, or null. Default: lib/ai-keys/store readKeys. */
  ownOpenAIKey?: (creatorId: string) => Promise<string | null>
  /** After a run on their own key: used, or refused with the provider's words. */
  noteOwnKey?: (creatorId: string, error: string | null) => Promise<void>
  /** Stores the bytes in the media library. Default: ./store saveImageToLibrary on the admin client. */
  save?: (input: SaveImageInput) => Promise<SavedImage>
  /** The owner's auth user id when the input has none. */
  ownerOf?: (creatorId: string) => Promise<string | null>
  log?: (line: string) => void
  timeoutMs?: number
  retryDelayMs?: number
  now?: () => number
}

const env = (deps: ImageDeps): Env => deps.env ?? process.env
const trim = (v: string | undefined) => (v ?? "").trim()

export function openAIModels(e: Env): string[] {
  const own = trim(e.OPENAI_IMAGE_MODEL)
  return [...new Set([...(own ? [own] : []), ...OPENAI_IMAGE_MODELS])]
}
export function geminiModels(e: Env): string[] {
  const own = trim(e.GEMINI_IMAGE_MODEL)
  return [...new Set([...(own ? [own] : []), ...GEMINI_IMAGE_MODELS])]
}
export function openAIQuality(e: Env): ImageQuality {
  const q = trim(e.OPENAI_IMAGE_QUALITY)
  return q === "low" || q === "high" ? q : "medium"
}
const geminiKey = (e: Env) => trim(e.GEMINI_API_KEY) || trim(e.GOOGLE_AI_API_KEY)
const geminiUsd = (e: Env) => {
  const n = Number(e.GEMINI_IMAGE_USD)
  return Number.isFinite(n) && n > 0 ? n : GEMINI_IMAGE_ESTIMATE_USD
}

/** Which services this environment has, before any call. `ownOpenAI` is whether the creator connected an OpenAI key. */
export function imageServices(e: Env, ownOpenAI = false): { generate: ImageProviderId | null; stock: boolean } {
  const generate: ImageProviderId | null = ownOpenAI || trim(e.OPENAI_API_KEY) ? "openai" : geminiKey(e) ? "gemini" : null
  return { generate, stock: !!trim(e.PEXELS_API_KEY) }
}

/** The worst a picture can cost here, for the job's spend check before it starts. */
export function imageCostCeiling(e: Env, aspect: ImageAspect): number {
  return Math.max(openAIEstimate(aspect, openAIQuality(e)), geminiUsd(e))
}

/* ── defaults on the real services, loaded only when used ───────────── */

async function defaultOwnKey(creatorId: string): Promise<string | null> {
  const { readKeys } = await import("@/lib/ai-keys/store")
  const keys = await readKeys(creatorId).catch(() => ({}) as Record<string, string>)
  return (keys as { openai?: string }).openai ?? null
}
async function defaultNoteOwnKey(creatorId: string, error: string | null): Promise<void> {
  const { noteUse } = await import("@/lib/ai-keys/store")
  await noteUse(creatorId, "openai", error)
}
async function adminClient() {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  return createAdminClient()
}
async function defaultSave(input: SaveImageInput): Promise<SavedImage> {
  const { saveImageToLibrary } = await import("./store")
  return saveImageToLibrary(await adminClient(), input)
}
async function defaultOwnerOf(creatorId: string): Promise<string | null> {
  const { ownerUserIdOf } = await import("./store")
  return ownerUserIdOf(await adminClient(), creatorId)
}

/** Search words from a sentence: the nouns and adjectives, not the art direction. */
export function stockQuery(text: string): string {
  const STOP = new Set("a an the of in on at with and or for to from by into over under near is are be being photo photograph picture image shot showing shows real natural light lighting lens style mood frame".split(" "))
  const words = String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w))
  return words.slice(0, 7).join(" ") || "texture"
}

/* ── the chain ──────────────────────────────────────────────────────── */

export async function generateImage(input: GenerateImageInput, deps: ImageDeps = {}): Promise<ImageOutcome> {
  const e = env(deps)
  const log = deps.log ?? ((line: string) => console.warn(line))
  const verdict = checkImagePrompt(input.prompt)
  if (verdict.ok === false) return { ok: false, code: "unsafe", reason: `That picture was refused: ${verdict.reason}`, usd: 0 }
  const aspect: ImageAspect = input.aspect ?? "landscape"
  const prompt = String(input.prompt).replace(/\s+/g, " ").trim()
  const alt = (input.alt ?? "").trim().slice(0, 200) || altFromPrompt(prompt)
  const shaped = shapeImagePrompt({ prompt, aspect, style: input.style, purpose: input.purpose, direction: input.direction })
  const opts = { fetch: deps.fetch ?? (globalThis.fetch as Fetch), timeoutMs: deps.timeoutMs ?? 120_000, retryDelayMs: deps.retryDelayMs }
  const cap = input.maxUsd ?? Infinity
  let spent = 0
  const notes: string[] = []

  const ownerUserId = input.ownerUserId ?? (await (deps.ownerOf ?? defaultOwnerOf)(input.creatorId).catch(() => null))
  if (!ownerUserId) return { ok: false, code: "storage", reason: "The store's files folder could not be found.", usd: 0 }

  const keep = async (bytes: Uint8Array, made: { source: "ai" | "stock"; provider: ImageProviderId; model?: string; width: number; height: number; usd: number; ownKey?: boolean; credit?: ImageOrigin["credit"]; alt?: string }): Promise<ImageOutcome> => {
    const origin: ImageOrigin = {
      source: made.source,
      provider: made.provider,
      ...(made.model ? { model: made.model } : {}),
      prompt: prompt.slice(0, 1_200),
      aspect,
      ...(input.style ? { style: String(input.style).slice(0, 40) } : {}),
      ...(input.purpose ? { purpose: String(input.purpose).slice(0, 60) } : {}),
      jobId: input.jobId ?? null,
      width: made.width,
      height: made.height,
      ...(made.credit ? { credit: made.credit } : {}),
      ...(input.direction ? { direction: input.direction } : {}),
      createdAt: new Date((deps.now ?? Date.now)()).toISOString(),
    }
    const finalAlt = made.alt && !input.alt ? made.alt : alt
    const saved = await (deps.save ?? defaultSave)({ ownerUserId, creatorId: input.creatorId, bytes, alt: finalAlt, origin }).catch(() => ({ ok: false as const, error: "The picture could not be stored." }))
    if (saved.ok === false) {
      log(`[ai-images] store failed after ${made.provider}`)
      return { ok: false, code: "storage", reason: saved.error, usd: spent }
    }
    return { ok: true, url: saved.url, width: saved.width, height: saved.height, alt: finalAlt, mediaId: saved.mediaId, source: made.source, provider: made.provider, ...(made.model ? { model: made.model } : {}), usd: made.usd, ...(made.ownKey ? { ownKey: true } : {}), ...(made.credit ? { credit: made.credit } : {}) }
  }

  let paid = !input.stockOnly

  /* 1. OpenAI: their own key first, else Storelib's. */
  if (paid) {
    const own = await (deps.ownOpenAIKey ?? defaultOwnKey)(input.creatorId).catch(() => null)
    const key = own || trim(e.OPENAI_API_KEY)
    if (key) {
      const quality = openAIQuality(e)
      const estimate = openAIEstimate(aspect, quality)
      if (spent + estimate > cap) notes.push("over the spending left")
      else {
        const r = await openAIImage({ key, prompt: shaped, aspect, quality, models: openAIModels(e) }, opts)
        if (r.ok === true) {
          spent += r.usd
          if (own) await (deps.noteOwnKey ?? defaultNoteOwnKey)(input.creatorId, null).catch(() => undefined)
          const size = { square: [1024, 1024], landscape: [1536, 1024], portrait: [1024, 1536] }[aspect]
          return keep(r.bytes, { source: "ai", provider: "openai", model: r.model, width: size[0], height: size[1], usd: r.usd, ownKey: !!own })
        }
        log(`[ai-images] openai ${r.kind}: ${scrub(r.message, [key])}`)
        if (r.kind === "refused") return { ok: false, code: "unsafe", reason: r.message, usd: spent }
        if (own && r.kind === "auth") {
          await (deps.noteOwnKey ?? defaultNoteOwnKey)(input.creatorId, r.message).catch(() => undefined)
          /* Their key was refused: Storelib's paid services never answer in its place. */
          paid = false
          notes.push("your OpenAI key was refused")
        } else notes.push(r.kind === "auth" ? "the OpenAI key was refused" : "OpenAI did not make it")
      }
    }
  }

  /* 2. Gemini on Storelib's key. */
  if (paid) {
    const key = geminiKey(e)
    if (key) {
      const usd = geminiUsd(e)
      if (spent + usd > cap) notes.push("over the spending left")
      else {
        const r = await geminiImage({ key, prompt: shaped, aspect, models: geminiModels(e), base: trim(e.GEMINI_API_BASE) || undefined, usd }, opts)
        if (r.ok === true) {
          spent += r.usd
          const ratio = { square: [1024, 1024], landscape: [1248, 832], portrait: [832, 1248] }[aspect]
          return keep(r.bytes, { source: "ai", provider: "gemini", model: r.model, width: ratio[0], height: ratio[1], usd: r.usd })
        }
        log(`[ai-images] gemini ${r.kind}: ${scrub(r.message, [key])}`)
        if (r.kind === "refused") return { ok: false, code: "unsafe", reason: r.message, usd: spent }
        notes.push("Gemini did not make it")
      }
    }
  }

  /* 3. A stock photo. */
  const pexels = trim(e.PEXELS_API_KEY)
  if (pexels) {
    const r = await pexelsPhoto({ key: pexels, query: stockQuery(prompt), aspect, pick: input.stockPick }, opts)
    if (r.ok === true) return keep(r.bytes, { source: "stock", provider: "pexels", width: r.width, height: r.height, usd: 0, credit: r.credit, alt: r.alt || undefined })
    log(`[ai-images] pexels ${r.kind}: ${scrub(r.message, [pexels])}`)
    notes.push(r.kind === "none" ? "no stock photo matched" : "the stock photo service did not answer")
  }

  if (!notes.length) return { ok: false, code: "no_provider", reason: "No picture service is set up here (no OpenAI, Gemini or Pexels key). Design this spot without a picture.", usd: 0 }
  const over = notes.every((n) => n === "over the spending left")
  return { ok: false, code: over ? "over_budget" : "failed", reason: `No picture: ${[...new Set(notes)].join("; ")}. Design this spot without a picture.`, usd: spent }
}

/** A stock photo only (the agent's find_photo): Pexels, kept in the files like any picture. */
export async function findPhoto(input: { query: string; aspect?: ImageAspect; creatorId: string; ownerUserId?: string | null; jobId?: string | null; alt?: string; purpose?: string }, deps: ImageDeps = {}): Promise<ImageOutcome> {
  const verdict = checkPhotoQuery(input.query)
  if (verdict.ok === false) return { ok: false, code: "unsafe", reason: `That search was refused: ${verdict.reason}`, usd: 0 }
  if (!trim(env(deps).PEXELS_API_KEY)) return { ok: false, code: "no_provider", reason: "No stock photo service is set up here (PEXELS_API_KEY). Use generate_image, or design this spot without a picture.", usd: 0 }
  return generateImage({ prompt: input.query, aspect: input.aspect, creatorId: input.creatorId, ownerUserId: input.ownerUserId, jobId: input.jobId, alt: input.alt, purpose: input.purpose, stockOnly: true }, deps)
}

/**
 * The editor's Regenerate: a new picture from what an AI picture was made
 * from (its prompt, shape, style and the site's direction), kept beside it.
 * Stock photos come back as a different stock photo for the same words.
 */
export async function regenerateImage(input: { creatorId: string; ownerUserId: string; origin: ImageOrigin; alt?: string | null; maxUsd: number }, deps: ImageDeps = {}): Promise<ImageOutcome> {
  const o = input.origin
  return generateImage(
    {
      prompt: o.prompt,
      aspect: o.aspect,
      style: o.style,
      purpose: o.purpose,
      direction: o.direction,
      alt: input.alt ?? undefined,
      creatorId: input.creatorId,
      ownerUserId: input.ownerUserId,
      jobId: null,
      maxUsd: input.maxUsd,
      stockOnly: o.source === "stock",
      /* Another match than the one there now. */
      stockPick: 1 + Math.floor(Math.random() * 9),
    },
    deps,
  )
}
