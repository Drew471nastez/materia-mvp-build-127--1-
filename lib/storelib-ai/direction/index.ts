/**
 * ===========================================================================
 *  CREATIVE BRIEF AND DIRECTION (round O): O6's STUB OF O2's MODULE
 * ===========================================================================
 * TODO(integrator, round O): O2 owns lib/storelib-ai/direction/ (CreativeBrief
 * from spec 3.1, briefFrom, chooseDirection with a deterministic seed, the
 * DesignContract and the per-site DESIGN.md). When O2's branch merges, take
 * its files whole and delete this stub. The exported names and parameter
 * order follow the round O brief so callers keep compiling:
 *
 *   briefFrom(prompt, options, capabilities)   → CreativeBrief
 *   chooseDirection(brief, references)         → DirectionChoice (primary + optional secondary)
 *   directionForPrompt(choice)                 → string for the job's brief
 *
 * Every call O6 makes into this module is in ONE file,
 * lib/ai-builder/agent/design-brief.ts, so a shape that differs is adjusted
 * there and nowhere else.
 *
 * The stub is deterministic and small: it reads the obvious facts out of the
 * prompt and picks from the existing direction library (L6, round N) while
 * refusing the editorial serif bundle unless the brief asks for it.
 */
import type { RuntimeCapabilities } from "@/lib/ai-builder/runtime-contract"
import type { StartOptions } from "@/lib/ai-builder/types"
import { suggestDirections, type Direction } from "@/lib/storelib-ai/library/concept"
import { firstFamily } from "@/lib/storelib-ai/library/type-systems"

export type MotionTier = "quiet" | "balanced" | "expressive"

/** Spec 3.1 / prompt C, the fields the stub can honestly fill. */
export interface CreativeBrief {
  prompt: string
  /** The business in a few words: the category the creator picked, else the prompt's opening. */
  business: string
  industry: string | null
  primaryAction: string | null
  /** Style words the creator used ("editorial", "y2k", "black and red"...). */
  requestedStyle: string[]
  motion: MotionTier | null
  colors: string[]
  pages: string[]
  /** Facts the site cannot state until the creator gives them. */
  uncertainties: string[]
  /** Deterministic seed: the same brief picks the same direction. */
  seed: string
}

export interface DirectionChoice {
  primary: Direction
  secondary: Direction | null
  /** One line: why this one, in concrete terms. */
  reason: string
}

/** Where O2 stores the per-site contract among the install's files (the Google design.md format). */
export const DESIGN_MD_PATH = "DESIGN.md"

const STYLE_WORDS = ["editorial", "serif", "magazine", "literary", "minimal", "brutalist", "y2k", "2000s", "retro", "vintage", "luxury", "playful", "bold", "experimental", "swiss", "japanese", "cinematic", "warm", "calm", "dark", "black", "red", "neon", "sport", "performance", "gallery", "aero"]

function motionOf(prompt: string): MotionTier | null {
  if (/\b(no|without|minimal) (motion|animation)s?\b|\bstatic\b|\bquiet\b/i.test(prompt)) return "quiet"
  if (/\b(smooth|scroll moments?|expressive|cinematic|immersive|lots of motion|animated)\b/i.test(prompt)) return "expressive"
  if (/\b(soft movement|subtle|gentle)\b/i.test(prompt)) return "balanced"
  return null
}

function actionOf(prompt: string, caps: RuntimeCapabilities | null | undefined): string | null {
  if (/\b(book|booking|consultation|appointment|call)\b/i.test(prompt) || caps?.forms.some((f) => f.booking)) return "book"
  if (/\b(shop|store|sell|buy|sample packs?|products?)\b/i.test(prompt) || (caps?.products.length ?? 0) > 0) return "buy"
  if (/\b(newsletter|subscribe|join|waitlist)\b/i.test(prompt)) return "subscribe"
  if (/\b(contact|enquir|inquir|hire)\b/i.test(prompt)) return "contact"
  return null
}

/** STUB: the brief, read deterministically from the prompt, the start options and the store. */
export function briefFrom(prompt: string, options?: StartOptions | null, capabilities?: RuntimeCapabilities | null): CreativeBrief {
  const text = (prompt ?? "").trim()
  const lower = text.toLowerCase()
  const industry = options?.category ? options.category.replace(/_/g, " ") : null
  const requestedStyle = STYLE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower))
  const uncertainties = [
    !capabilities?.products.length && /\b(price|pricing|plans?|packages?)\b/i.test(text) ? "prices" : "",
    !capabilities?.reviews.count ? "reviews and testimonials" : "",
    /\b(book|booking|consultation|appointment)\b/i.test(text) && !capabilities?.forms.some((f) => f.booking) ? "a booking form" : "",
  ].filter(Boolean)
  return {
    prompt: text,
    business: industry ?? text.slice(0, 80),
    industry,
    primaryAction: actionOf(text, capabilities),
    requestedStyle,
    motion: motionOf(text),
    colors: options?.preferences?.colors ?? [],
    pages: options?.preferences?.pages ?? [],
    uncertainties,
    seed: text.toLowerCase().replace(/\s+/g, " ").slice(0, 200),
  }
}

const SERIF = /serif|garamond|playfair|fraunces|bodoni|cormorant|caslon|newsreader|literata|spectral|gloock|lora|merriweather|baskerville|italiana|instrument/

/** A direction that is the editorial serif bundle: a serif display face on a light, warm page. */
export function isEditorialSerifBundle(d: Direction): boolean {
  const display = firstFamily(d.type.display)
  if (!SERIF.test(display) || /sans/.test(display)) return false
  if (d.palette.mode !== "light") return false
  const hex = d.palette.background.replace("#", "")
  if (hex.length !== 6) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  /* Cream, ivory, sand: light and warmer than it is blue. */
  return r > 225 && g > 215 && r >= b + 6
}

/** STUB: a primary direction and a secondary influence, deterministic for the brief. References are not used by the stub. */
export function chooseDirection(brief: CreativeBrief, _references?: unknown[]): DirectionChoice {
  const asksEditorial = brief.requestedStyle.some((w) => ["editorial", "serif", "magazine", "literary"].includes(w))
  const pool = suggestDirections(brief.industry ?? brief.business, { count: 6, seed: brief.seed })
  const fits = asksEditorial ? pool : pool.filter((d) => !isEditorialSerifBundle(d))
  const list = fits.length ? fits : pool
  const primary = list[0]
  const secondary = list.find((d) => d.id !== primary.id) ?? null
  return {
    primary,
    secondary,
    reason: `Suits ${brief.industry ?? "this business"}${brief.requestedStyle.length ? ` and the words "${brief.requestedStyle.join(", ")}"` : ""}${asksEditorial ? "" : "; the editorial serif bundle was left out because the brief did not ask for it"}.`,
  }
}

/** STUB: the choice, said for the job's brief. */
export function directionForPrompt(choice: DirectionChoice): string {
  const d = choice.primary
  const line = (x: Direction) => `${x.name} (${x.styles.join(" + ")}): ${x.mood.join(", ")}; type ${x.type.display} / ${x.type.body}; ${x.palette.mode} ${x.palette.background} / ${x.palette.text} / accent ${x.palette.accent}; imagery: ${x.imagery}; signature: ${x.signature}${x.layout ? `; layout: ${x.layout}` : ""}`
  return [`Primary: ${line(d)}`, choice.secondary ? `Secondary influence: ${choice.secondary.name}, for ${choice.secondary.mood.slice(0, 2).join(" and ")}` : "", `Why: ${choice.reason}`].filter(Boolean).join("\n")
}
