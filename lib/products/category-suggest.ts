/**
 * ===========================================================================
 *  SUGGESTING A PRODUCT'S CATEGORY
 * ===========================================================================
 * The editor offers one category as "Suggested", read from what the creator
 * has already given it: the title, the description and the pictures. Two
 * readers, and the second is always there:
 *
 *   THE MODEL (ChatGPT), through app/api/app/products/category-suggestion/route.ts, which
 *   sees the words and up to MAX_IMAGES of the pictures and has to choose a
 *   group and a category from lib/products/category-groups.ts.
 *
 *   THE KEYWORDS below, the editor's own guess since before there was a
 *   route. Used on the phone the moment something is typed, and by the route
 *   whenever the model cannot answer: no key configured, an error, a timeout, or
 *   an answer that is not a name on the list.
 *
 * Everything here is plain and synchronous except `resolveSuggestion`, which
 * takes the model call as an argument, so the rules (what a request may
 * carry, what an answer must be, when to fall back) are tested without a
 * network: tests/category-suggest.test.ts.
 */

import { CATEGORY_GROUPS, groupOfCategory, isCategory } from "./category-groups"
import { toStorageUrl } from "@/lib/storage/media-url"

/* ── what a request may carry ─────────────────────────────────────────── */

export const SUGGEST_LIMITS = {
  /** The raw JSON body, in characters. */
  body: 16_000,
  title: 300,
  /** The description as plain text. The editor sends at most this much. */
  text: 6_000,
  /** Pictures looked at. The first ones: the first is the thumbnail. */
  images: 3,
  url: 1_000,
} as const

export interface SuggestInput {
  title: string
  text: string
  images: string[]
}

export type ParsedRequest =
  | { ok: true; input: SuggestInput }
  | { ok: false; status: 400 | 413; error: string }

/**
 * A picture this route may hand to the model: a public object in THIS project's
 * Supabase storage, in the signed in creator's own folder. Anything else (a
 * YouTube thumbnail, another site, another creator's file, a signed URL, a
 * render URL) is refused, so the route cannot be used to make Anthropic fetch
 * arbitrary addresses.
 */
export function isOwnStorageImage(url: string, storageOrigin: string, creatorId: string): boolean {
  if (typeof url !== "string" || url.length > SUGGEST_LIMITS.url || !storageOrigin || !creatorId) return false
  let u: URL
  let origin: string
  try {
    u = new URL(toStorageUrl(url))
    origin = new URL(storageOrigin).origin
  } catch {
    return false
  }
  if (u.protocol !== "https:" || u.origin !== origin || u.username || u.password) return false
  const prefix = "/storage/v1/object/public/"
  if (!u.pathname.startsWith(prefix)) return false
  const [bucket, owner, ...rest] = u.pathname.slice(prefix.length).split("/")
  if (!bucket || owner !== creatorId || rest.length === 0 || rest.some((p) => !p || p === ".." || p === ".")) return false
  return /\.(jpe?g|png|webp|gif)$/i.test(u.pathname)
}

/**
 * The body, checked. Wrong types and oversized fields are refused rather
 * than trimmed: the editor never sends them, so something else did.
 * Pictures that are not the creator's own are dropped, not refused, so a
 * product whose first picture came from elsewhere is still read by its words.
 */
export function parseSuggestRequest(raw: string, opts: { storageOrigin: string; creatorId: string }): ParsedRequest {
  if (raw.length > SUGGEST_LIMITS.body) return { ok: false, status: 413, error: "Too much to read." }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return { ok: false, status: 400, error: "Not JSON." }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "Not an object." }
  const { title = "", text = "", images = [] } = body as Record<string, unknown>
  if (typeof title !== "string" || typeof text !== "string" || !Array.isArray(images)) return { ok: false, status: 400, error: "Wrong types." }
  if (title.length > SUGGEST_LIMITS.title || text.length > SUGGEST_LIMITS.text) return { ok: false, status: 413, error: "Too much to read." }
  if (images.length > SUGGEST_LIMITS.images || images.some((u) => typeof u !== "string")) return { ok: false, status: 400, error: "Too many pictures." }
  const input: SuggestInput = {
    title: title.trim(),
    text: plainText(text),
    images: (images as string[]).filter((u) => isOwnStorageImage(u, opts.storageOrigin, opts.creatorId)),
  }
  if (!input.title && !input.text && input.images.length === 0) return { ok: false, status: 400, error: "Nothing to read." }
  return { ok: true, input }
}

/** Markup to words: tags out, the common entities back, spaces collapsed. */
export function plainText(html: string): string {
  return String(html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/* ── what an answer must be ───────────────────────────────────────────── */

export interface CategoryChoice {
  group: string
  category: string
}

/**
 * The model's answer, accepted only when the category is a name on the list and
 * the group is the one that category is in. A JSON string or an object; any
 * other shape, an invented category, or a category put in the wrong group is
 * null, and the caller falls back.
 */
export function readAnswer(answer: unknown): CategoryChoice | null {
  let value = answer
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const { group, category } = value as Record<string, unknown>
  if (!isCategory(category)) return null
  const real = groupOfCategory(category)
  if (typeof group !== "string" || group !== real) return null
  return { group: real, category }
}

/* ── the keywords ─────────────────────────────────────────────────────── */

/** Category keywords with weights (higher weight, more confident match). */
const KEYWORDS: Record<string, { keywords: string[]; weight: number }[]> = {
  // Audio & Sound
  "Sound Effects": [
    { keywords: ["sound effect", "sfx", "sound fx"], weight: 10 },
    { keywords: ["audio effect", "whoosh", "swoosh", "impact", "transition sound"], weight: 8 },
    { keywords: ["foley", "ambient sound", "noise"], weight: 6 },
  ],
  "Sample Packs": [
    { keywords: ["sample pack", "drum kit", "drum samples"], weight: 10 },
    { keywords: ["loops", "one shots", "wav samples", "audio samples"], weight: 8 },
    { keywords: ["producer", "fl studio", "ableton"], weight: 5 },
  ],
  "Beats": [
    { keywords: ["beat", "beats", "instrumental", "type beat"], weight: 10 },
    { keywords: ["hip hop", "trap", "r&b", "drill", "boom bap"], weight: 7 },
    { keywords: ["rapper", "vocalist"], weight: 4 },
  ],
  "Music Tracks": [
    { keywords: ["music track", "royalty free music", "background music"], weight: 10 },
    { keywords: ["soundtrack", "cinematic music", "production music"], weight: 8 },
    { keywords: ["license", "commercial use"], weight: 3 },
  ],
  // Design & Creative
  "Lightroom Presets": [
    { keywords: ["lightroom preset", "lr preset", "lightroom"], weight: 10 },
    { keywords: ["photo preset", "color preset", "mobile preset"], weight: 7 },
    { keywords: ["instagram filter", "photo editing"], weight: 4 },
  ],
  "Photoshop Actions": [
    { keywords: ["photoshop action", "ps action", "photoshop"], weight: 10 },
    { keywords: ["psd", "photo manipulation", "retouching"], weight: 6 },
  ],
  "Procreate Brushes": [
    { keywords: ["procreate brush", "procreate"], weight: 10 },
    { keywords: ["ipad brush", "digital brush", "illustration brush"], weight: 6 },
  ],
  "Video LUTs": [
    { keywords: ["lut", "luts", "color lut"], weight: 10 },
    { keywords: ["color grade", "color grading", "cinematic look"], weight: 8 },
    { keywords: ["davinci", "premiere", "final cut"], weight: 4 },
  ],
  "Fonts": [
    { keywords: ["font", "fonts", "typeface"], weight: 10 },
    { keywords: ["typography", "lettering", "handwritten"], weight: 6 },
    { keywords: ["otf", "ttf", "woff"], weight: 5 },
  ],
  "Icons": [
    { keywords: ["icon pack", "icon set", "icons"], weight: 10 },
    { keywords: ["vector icons", "ui icons", "line icons"], weight: 7 },
  ],
  // Templates
  "Notion Templates": [
    { keywords: ["notion template", "notion"], weight: 10 },
    { keywords: ["notion workspace", "notion dashboard"], weight: 8 },
  ],
  "Figma Templates": [
    { keywords: ["figma template", "figma"], weight: 10 },
    { keywords: ["figma ui", "figma design"], weight: 7 },
  ],
  "Canva Templates": [
    { keywords: ["canva template", "canva"], weight: 10 },
  ],
  "Social Media Templates": [
    { keywords: ["instagram template", "social media template"], weight: 10 },
    { keywords: ["story template", "post template", "reel template"], weight: 8 },
    { keywords: ["tiktok", "facebook", "twitter", "linkedin"], weight: 5 },
  ],
  "Resume Templates": [
    { keywords: ["resume template", "cv template", "resume"], weight: 10 },
    { keywords: ["curriculum vitae", "job application"], weight: 6 },
  ],
  // AI & Prompts
  "AI Prompts": [
    { keywords: ["ai prompt", "prompt pack", "prompts"], weight: 10 },
    { keywords: ["chatgpt", "midjourney", "dall-e", "stable diffusion"], weight: 8 },
    { keywords: ["prompt engineering", "gpt"], weight: 5 },
  ],
  "ChatGPT Prompts": [
    { keywords: ["chatgpt prompt", "chatgpt", "gpt prompt"], weight: 10 },
    { keywords: ["openai", "gpt-4", "gpt-3"], weight: 7 },
  ],
  "Midjourney Prompts": [
    { keywords: ["midjourney prompt", "midjourney", "mj prompt"], weight: 10 },
    { keywords: ["ai art prompt", "image generation"], weight: 5 },
  ],
  // Education
  "Online Courses": [
    { keywords: ["online course", "course", "masterclass"], weight: 10 },
    { keywords: ["video course", "learn", "training", "tutorial"], weight: 7 },
    { keywords: ["lesson", "module", "curriculum"], weight: 4 },
  ],
  "Ebooks": [
    { keywords: ["ebook", "e-book", "digital book"], weight: 10 },
    { keywords: ["pdf guide", "pdf book"], weight: 8 },
    { keywords: ["guide", "handbook", "manual"], weight: 4 },
  ],
  // Business
  "Spreadsheets": [
    { keywords: ["spreadsheet", "excel template", "google sheets"], weight: 10 },
    { keywords: ["excel", "xlsx", "csv"], weight: 6 },
    { keywords: ["calculator", "tracker"], weight: 3 },
  ],
  "Business Plans": [
    { keywords: ["business plan", "startup plan"], weight: 10 },
    { keywords: ["pitch deck", "investor"], weight: 5 },
  ],
  // Art & Crafts
  "SVG Files": [
    { keywords: ["svg", "svg file", "cut file"], weight: 10 },
    { keywords: ["cricut", "silhouette", "vinyl"], weight: 8 },
    { keywords: ["laser cut", "cnc"], weight: 5 },
  ],
  "Printables": [
    { keywords: ["printable", "print at home"], weight: 10 },
    { keywords: ["wall art", "poster", "art print"], weight: 6 },
    { keywords: ["digital download", "instant download"], weight: 3 },
  ],
  // Development
  "WordPress Themes": [
    { keywords: ["wordpress theme", "wp theme"], weight: 10 },
    { keywords: ["wordpress"], weight: 5 },
  ],
  "Shopify Themes": [
    { keywords: ["shopify theme", "shopify template"], weight: 10 },
    { keywords: ["shopify"], weight: 5 },
  ],
  "UI Kits": [
    { keywords: ["ui kit", "design system"], weight: 10 },
    { keywords: ["user interface", "ui/ux", "component"], weight: 6 },
  ],
  "Source Code": [
    { keywords: ["source code", "github", "repository"], weight: 10 },
    { keywords: ["script", "code", "api"], weight: 4 },
  ],
  // Fitness
  "Workout Plans": [
    { keywords: ["workout plan", "fitness program"], weight: 10 },
    { keywords: ["exercise", "gym", "training plan"], weight: 6 },
    { keywords: ["weight loss", "muscle", "strength"], weight: 3 },
  ],
  "Meal Plans": [
    { keywords: ["meal plan", "diet plan"], weight: 10 },
    { keywords: ["nutrition", "recipe", "food"], weight: 5 },
    { keywords: ["keto", "vegan", "healthy"], weight: 3 },
  ],
  // Personal
  "Planners": [
    { keywords: ["planner", "digital planner"], weight: 10 },
    { keywords: ["daily planner", "weekly planner", "monthly"], weight: 7 },
    { keywords: ["organizer", "schedule"], weight: 4 },
  ],
  "Journals": [
    { keywords: ["journal", "journaling"], weight: 10 },
    { keywords: ["diary", "gratitude", "reflection"], weight: 5 },
  ],
  // 3D & Games
  "3D Assets": [
    { keywords: ["3d model", "3d asset"], weight: 10 },
    { keywords: ["blender", "maya", "c4d", "3ds max"], weight: 7 },
    { keywords: ["fbx", "obj", "stl"], weight: 5 },
  ],
  "Game Assets": [
    { keywords: ["game asset", "sprite", "tileset"], weight: 10 },
    { keywords: ["unity", "unreal", "godot"], weight: 7 },
    { keywords: ["pixel art", "game art", "character"], weight: 5 },
  ],}

/** The best keyword match in the words given, or null under three characters or with no match. */
export function keywordSuggestion(words: string): string | null {
  const text = plainText(words)
  if (text.length < 3) return null
  const lower = text.toLowerCase()
  let best: string | null = null
  let bestScore = 0
  for (const [category, groups] of Object.entries(KEYWORDS)) {
    let score = 0
    for (const group of groups) {
      for (const keyword of group.keywords) {
        /* Weighted, plus a little for a longer (more specific) keyword. */
        if (lower.includes(keyword)) score += group.weight + keyword.length * 0.5
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = category
    }
  }
  return best
}

/* ── the two together ─────────────────────────────────────────────────── */

export type SuggestSource = "ai" | "keywords" | "none"

export interface Suggestion {
  category: string | null
  group: string | null
  source: SuggestSource
}

/**
 * The model first when `ask` is given, the keywords otherwise and whenever
 * its answer is missing, throws, or is not on the list. Never throws.
 */
export async function resolveSuggestion(
  input: SuggestInput,
  ask: ((input: SuggestInput) => Promise<unknown>) | null,
): Promise<Suggestion> {
  if (ask) {
    try {
      const choice = readAnswer(await ask(input))
      if (choice) return { ...choice, source: "ai" }
    } catch {
      /* The keywords below are the answer. */
    }
  }
  const category = keywordSuggestion(`${input.title} ${input.text}`)
  return category ? { category, group: groupOfCategory(category), source: "keywords" } : { category: null, group: null, source: "none" }
}

/** The list, as the model is shown it: one group a line, its categories after. */
export function categoryListText(): string {
  return CATEGORY_GROUPS.map((g) => `${g.name}: ${g.categories.join(" | ")}`).join("\n")
}

/**
 * A short fingerprint of what was read (FNV-1a), for the editor's cache: the
 * same title, words and pictures are never asked about twice in a visit.
 */
export function contentKey(input: SuggestInput): string {
  const s = `${input.title}\u0000${input.text}\u0000${input.images.join("\u0000")}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${s.length.toString(36)}-${h.toString(36)}`
}
