/**
 * ===========================================================================
 *  CREATIVE BRIEF AND DIRECTION (round O): O6's STUB OF O2's MODULE
 * ===========================================================================
 * TODO(integrator, round O): O2 owns lib/storelib-ai/direction/ (brief.ts,
 * directions.ts, choose.ts, design-md.ts). When O2's branch merges, take its
 * files whole and delete this stub. The signatures below are O2's, read from
 * its branch, so O6's one caller (lib/ai-builder/agent/design-brief.ts)
 * compiles against either:
 *
 *   briefFrom(prompt, options, caps)               → CreativeBrief
 *   chooseDirection(brief, references, opts)       → DirectionChoice
 *   directionForPrompt(brief, choice)              → the CREATIVE BRIEF and ART DIRECTION blocks
 *   DESIGN_MD_PATH                                 "DESIGN.md"
 *
 * The stub is deterministic and small: it reads the obvious facts out of the
 * prompt and picks from the existing direction library (L6, round N), leaving
 * out the editorial serif bundle unless the creator's words ask for it.
 */
import { suggestDirections, type Direction } from "@/lib/storelib-ai/library/concept"
import { firstFamily } from "@/lib/storelib-ai/library/type-systems"

export type Objective = "book" | "buy" | "enquire" | "join" | "view-work" | "read" | "visit" | "donate" | "listen"
export type MotionIntensity = "quiet" | "balanced" | "expressive"

/** O2's brief, the fields the stub fills. */
export interface CreativeBrief {
  prompt: string
  business: { kind: string; label: string; name: string | null }
  objective: Objective
  cta: string
  style: { requested: string[]; moods: string[]; colors: string[] }
  motion: MotionIntensity
  mustNotFabricate: string[]
}

/** Options on Describe your website, loosely (StartOptions fits). */
export interface BriefOptions {
  category?: string
  preferences?: { pages?: string[]; tone?: string; colors?: string[]; language?: string }
}

/** The store's real facts, loosely (RuntimeCapabilities fits). */
export interface BriefCapabilities {
  products?: { kind?: string }[]
  forms?: { kind?: string; booking?: boolean }[]
  reviews?: { count: number }
}

/** A reference, as the choice reads it (O1's DesignReference fits). */
export interface ReferenceHint {
  id: string
  styles?: string[]
  tags?: string[]
  industries?: string[]
}

export interface DirectionChoice {
  primary: Direction
  secondary: Direction | null
  reasons: string[]
  requested: boolean
  seed: string
}

/** Where the per-site contract lives among the install's files (the Google design.md format). */
export const DESIGN_MD_PATH = "DESIGN.md"

const STYLE_WORDS = ["editorial", "serif", "magazine", "literary", "minimal", "brutalist", "y2k", "retro", "vintage", "luxury", "playful", "bold", "experimental", "swiss", "japanese", "cinematic", "warm", "calm", "dark", "sport", "gallery"]
const EDITORIAL_WORDS = ["editorial", "serif", "magazine", "literary"]

function objectiveOf(prompt: string, caps: BriefCapabilities | null | undefined): { objective: Objective; cta: string } {
  if (/\b(book|booking|consultation|appointment|session)\b/i.test(prompt) || caps?.forms?.some((f) => f.booking)) return { objective: "book", cta: "Book a consultation" }
  if (/\b(shop|store|sell|buy|sample packs?|products?)\b/i.test(prompt) || (caps?.products?.length ?? 0) > 0) return { objective: "buy", cta: "Shop now" }
  if (/\b(newsletter|subscribe|join|waitlist|community)\b/i.test(prompt)) return { objective: "join", cta: "Join" }
  return { objective: "enquire", cta: "Get in touch" }
}

function motionOf(prompt: string): MotionIntensity {
  if (/\b(no|without|minimal) (motion|animations?)\b|\bstatic\b/i.test(prompt)) return "quiet"
  if (/\b(smooth|scroll moments?|expressive|cinematic|immersive|animated)\b/i.test(prompt)) return "expressive"
  return "balanced"
}

/** STUB of O2's briefFrom. */
export function briefFrom(prompt: string, options?: BriefOptions | null, caps?: BriefCapabilities | null): CreativeBrief {
  const text = (prompt ?? "").trim().slice(0, 2_000)
  const lower = text.toLowerCase()
  const label = options?.category ? options.category.replace(/_/g, " ") : text.slice(0, 80)
  const { objective, cta } = objectiveOf(text, caps)
  const requested = STYLE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower))
  return {
    prompt: text,
    business: { kind: options?.category ?? "other", label, name: null },
    objective,
    cta,
    style: { requested, moods: [], colors: options?.preferences?.colors ?? [] },
    motion: motionOf(text),
    mustNotFabricate: [!caps?.reviews?.count ? "reviews and testimonials" : "", "prices, credentials and results the creator did not give"].filter(Boolean),
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
  /* Cream, ivory, sand: light, and warmer than it is blue. */
  return r > 225 && g > 215 && r >= b + 6
}

/** STUB of O2's chooseDirection: deterministic for the brief; references are not read by the stub. */
export function chooseDirection(brief: CreativeBrief, _references: ReferenceHint[] = [], opts: { seed?: string; avoid?: string[] } = {}): DirectionChoice {
  const requested = brief.style.requested.some((w) => EDITORIAL_WORDS.includes(w))
  const seed = opts.seed ?? brief.prompt.toLowerCase().replace(/\s+/g, " ").slice(0, 200)
  const pool = suggestDirections(brief.business.label, { count: 6, seed }).filter((d) => !(opts.avoid ?? []).includes(d.id))
  const fits = requested ? pool : pool.filter((d) => !isEditorialSerifBundle(d))
  const list = fits.length ? fits : pool
  const primary = list[0]
  return {
    primary,
    secondary: list.find((d) => d.id !== primary.id) ?? null,
    reasons: [`Suits ${brief.business.label}.`, requested ? "The creator asked for an editorial look." : "The editorial serif bundle is left out: nobody asked for it."],
    requested,
    seed,
  }
}

/** STUB of O2's directionForPrompt: the brief and the chosen direction, as blocks for the agent's turn. */
export function directionForPrompt(brief: CreativeBrief, choice: DirectionChoice): string {
  const d = choice.primary
  return [
    "CREATIVE BRIEF (read from the request and the store; never past what is real):",
    `- Business: ${brief.business.label}`,
    `- Main action: ${brief.objective}: "${brief.cta}"`,
    brief.style.requested.length || brief.style.colors.length ? `- Asked for: ${[brief.style.requested.length ? `style ${brief.style.requested.join(", ")}` : "", brief.style.colors.length ? `colours ${brief.style.colors.join(", ")}` : ""].filter(Boolean).join("; ")}` : null,
    `- Never invent: ${brief.mustNotFabricate.join("; ")}`,
    "",
    `ART DIRECTION (chosen for this business${choice.requested ? "; the creator named it, it wins" : ""}):`,
    `- Primary: ${d.name} (${d.styles.join(" + ")}): ${d.mood.join(", ")}; type ${d.type.display} / ${d.type.body}; ${d.palette.mode} ${d.palette.background} / ${d.palette.text} / accent ${d.palette.accent}; imagery: ${d.imagery}; signature: ${d.signature}${d.layout ? `; layout: ${d.layout}` : ""}`,
    choice.secondary ? `- Secondary influence: ${choice.secondary.name}. Borrow one idea from it, not its look.` : null,
    `- Why: ${choice.reasons.join(" ")}`,
    "Your concept follows this direction; adapt names and details to this creator, do not paste it.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n")
}
