/**
 * ===========================================================================
 *  PICTURES THE AI MAKES OR FINDS: THE SHAPES (round P, P1)
 * ===========================================================================
 * Shared by the generator (./generate.ts), the agent's tools
 * (lib/ai-builder/agent/tools-impl.ts generate_image, find_photo) and the
 * editor's Regenerate route (app/api/website-builder/images/regenerate).
 * Pure: no keys, no network.
 */

/** The three shapes every provider can make: 1024x1024, 1536x1024, 1024x1536. */
export type ImageAspect = "square" | "landscape" | "portrait"
export const IMAGE_ASPECTS: readonly ImageAspect[] = ["square", "landscape", "portrait"]

export function isImageAspect(value: unknown): value is ImageAspect {
  return value === "square" || value === "landscape" || value === "portrait"
}

/** Who answered: OpenAI's image model, Gemini's, or a Pexels stock photo. */
export type ImageProviderId = "openai" | "gemini" | "pexels"

/**
 * The art direction a picture is made to: from the job's concept and chosen
 * direction (DESIGN.md), so every picture on a site shares one light and one
 * palette. Every field is optional; empty means a plain, natural photograph.
 */
export interface ImageDirection {
  /** The concept's imagery brief, e.g. "real training in the real gym, hard side light". */
  imagery?: string
  mood?: string[]
  /** Hex colours the pictures should sit with (background, accent...). */
  palette?: string[]
  /** "light", "dark" or "mixed": the page the picture sits on. */
  mode?: string
  /** What this site's pictures never show. */
  avoid?: string[]
}

export interface GenerateImageInput {
  /** What the picture shows, in plain words. Checked (./safety.ts) and shaped (./prompt.ts). */
  prompt: string
  aspect?: ImageAspect
  /** "photo" (default), "studio", "editorial", "illustration": how it is made. */
  style?: string
  creatorId: string
  /** The agent job that asked, for the media row and the spend. Null from the editor. */
  jobId?: string | null
  /** What the picture is for: "hero", "product", "portrait", "gallery", "background"... Steers composition and the progress words. */
  purpose?: string
  /** The alt text the page will use. Made from the prompt when absent. */
  alt?: string
  direction?: ImageDirection
  /** The store owner's auth user id (the media library's folder). Looked up from the creator when absent. */
  ownerUserId?: string | null
  /** Refuse a provider whose cost estimate is above this (USD). The job's spend left, or the editor's per-call cap. */
  maxUsd?: number
  /** Skip straight to stock (no paid provider): set when the creator's own key was refused, so platform credit is never spent in its place. */
  stockOnly?: boolean
  /** Which of the stock matches (0 the best). Regenerate asks for another. */
  stockPick?: number
}

export interface StockCredit {
  provider: "pexels"
  photographer: string
  photographerUrl: string | null
  /** The photo's page on Pexels. */
  sourceUrl: string | null
}

export interface StoredImage {
  /** Storelib's /media/ address of the stored copy: what an image_picker setting takes. */
  url: string
  width: number
  height: number
  alt: string
  /** bucket:path, the media library's id for the file (lib/files/library.ts LibraryFile.id). */
  mediaId: string
  source: "ai" | "stock"
  provider: ImageProviderId
  /** The model that made it (never for stock). */
  model?: string
  /** What it cost, USD (an estimate when the provider does not say). 0 for stock. */
  usd: number
  /** True when the creator's own OpenAI key paid. */
  ownKey?: boolean
  credit?: StockCredit
}

export type ImageFailureCode = "unsafe" | "no_provider" | "over_budget" | "failed" | "storage"

export type ImageOutcome = ({ ok: true } & StoredImage) | { ok: false; code: ImageFailureCode; reason: string; usd: number }

/** What the media row keeps about a picture the AI made or found (file_details.origin, SQL part 441). */
export interface ImageOrigin {
  source: "ai" | "stock"
  provider: ImageProviderId
  model?: string
  /** The words it was made from (the creator's or the agent's, before shaping). */
  prompt: string
  aspect: ImageAspect
  style?: string
  purpose?: string
  jobId?: string | null
  width: number
  height: number
  credit?: StockCredit
  /** The direction it was made to, so Regenerate makes the next one in the same light. */
  direction?: ImageDirection
  createdAt: string
}

/** Pixel size per aspect: the three sizes OpenAI's image models take, and what Gemini is asked for. */
export const ASPECT_SIZE: Record<ImageAspect, { width: number; height: number; openai: string; ratio: string }> = {
  square: { width: 1024, height: 1024, openai: "1024x1024", ratio: "1:1" },
  landscape: { width: 1536, height: 1024, openai: "1536x1024", ratio: "3:2" },
  portrait: { width: 1024, height: 1536, openai: "1024x1536", ratio: "2:3" },
}

/** The media library folder AI and stock pictures go in: store-builder-images/<owner>/ai-images/<file>. */
export const AI_IMAGE_BUCKET = "store-builder-images"
export const AI_IMAGE_FOLDER = "ai-images"
