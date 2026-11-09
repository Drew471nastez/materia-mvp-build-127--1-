/**
 * ===========================================================================
 *  THE ANTI-SLOP EVALUATOR
 * ===========================================================================
 * Deterministic checks on generated output (a .storelib section, HTML and
 * CSS, design tokens, the page's section list) for the habits that make a
 * site read as machine-made. Each finding names the habit, shows the
 * evidence, says how to fix it and links the knowledge entry that explains
 * it (lib/storelib-ai/library/entries/anti-slop).
 *
 * RELATIVE TO THE CONCEPT. The agent declares a visual concept before it
 * builds (lib/storelib-ai/library/concept.ts). A habit the concept chose on
 * purpose (glass in a glassmorphism concept, pills in a playful one) is
 * downgraded to info and marked excused. Some findings are never excused:
 * fabricated proof, empty marketing words, weak mobile, missing reduced
 * motion. Contrast is the compiler's and the contrast checker's job, not this.
 *
 * `slopIssues` is the contract form (ValidationIssue, code slop.*) for the
 * agent's validate step; `evaluateSlop` is the full report with a score.
 * This is the deterministic half; the LLM review pass in verify (L3) can be
 * handed `describeSlop` as its starting point.
 *
 * Pure. No DOM, no network. Browser safe.
 */
import { conceptAllowances, type SlopAllowance, type VisualConcept } from "@/lib/storelib-ai/library/concept"
import { firstFamily, isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"
import type { DesignTokens, ValidationIssue } from "./types"

export type SlopSeverity = "error" | "warn" | "info"

export const SLOP_RULES = [
  "gradients",
  "purple",
  "glow",
  "glass",
  "generic-hero",
  "identical-layout",
  "random-icons",
  "floating-cards",
  "typography",
  "pills",
  "radius",
  "empty-words",
  "fake-proof",
  "repetitive-structure",
  "spacing",
  "stock-imagery",
  "weak-mobile",
  "animation",
  /* Round N (N4): type and layout habits. */
  "default-fonts",
  "type-scale",
  "card-grid",
  "hero-three-cards",
  "layout-rhythm",
  "emoji-icons",
  "stock-copy",
] as const
export type SlopRule = (typeof SLOP_RULES)[number]

export interface SlopFinding {
  rule: SlopRule
  severity: SlopSeverity
  message: string
  fix: string
  evidence: string[]
  /** True when the concept chose this on purpose; severity is then info. */
  excused: boolean
  /** The knowledge entry that explains the habit. */
  knowledge: string
  path?: string
}

export interface SlopInput {
  /** One or more .storelib section sources (template, style, script, schema). */
  sources?: { path: string; content: string }[]
  /** Rendered or hand written markup. */
  html?: string
  css?: string
  tokens?: Partial<DesignTokens>
  /** The page's sections in order (types), for repetition across a page. */
  sections?: { type: string }[]
  /**
   * Units in page order with what they are for, when the caller knows it
   * (the engine passes files; html input is already in order).
   */
  /** Facts the store or creator actually supplied, so a real number or quote is not called fake. */
  facts?: { numbers?: string[]; quotes?: boolean; reviews?: boolean; logos?: boolean }
}

export interface SlopReport {
  /** 100 is clean. Errors cost 15, warnings 6, info 1. */
  score: number
  findings: SlopFinding[]
  counts: { error: number; warn: number; info: number }
}

/* ── extraction ────────────────────────────────────────────────────────── */

function block(source: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(source)
  return m ? m[1] : ""
}

/** The template, style and the creator facing strings of a .storelib file. */
export function splitStorelib(source: string): { template: string; style: string; copy: string[]; schema: string } {
  const template = /<template[\s>]/i.test(source) ? block(source, "template") : source
  const style = block(source, "style")
  const copy: string[] = []
  const schema = block(source, "schema")
  if (schema.trim()) {
    try {
      collectCopy(JSON.parse(schema), copy, "")
    } catch {
      /* the compiler reports bad JSON; nothing to read here */
    }
  }
  return { template, style, copy, schema }
}

const NOT_COPY_KEYS = new Set(["type", "id", "label", "info", "name", "tag", "class", "category", "icon", "visible_if", "unit", "placeholder"])

function collectCopy(v: unknown, out: string[], key: string): void {
  if (typeof v === "string") {
    if (!NOT_COPY_KEYS.has(key) && /\s/.test(v)) out.push(v)
  } else if (Array.isArray(v)) {
    for (const x of v) collectCopy(x, out, key)
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) collectCopy(x, out, k)
  }
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\{#[\s\S]*?#\}/g, " ")
    .replace(/\{%[\s\S]*?%\}/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/* ── colour ────────────────────────────────────────────────────────────── */

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h, s, l]
}

const TW_HUES: Record<string, number> = { purple: 271, violet: 258, indigo: 239, fuchsia: 292, blue: 217, sky: 199, pink: 330, rose: 350, red: 0, orange: 25, amber: 38, yellow: 48, lime: 84, green: 142, emerald: 160, teal: 173, cyan: 189 }

/** Every chromatic colour mentioned, as HSL. Greys are dropped. */
export function colorsIn(text: string): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const m of text.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("")
    if (h.length !== 6 && h.length !== 8) continue
    out.push(rgbToHsl(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)))
  }
  for (const m of text.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) out.push(rgbToHsl(+m[1], +m[2], +m[3]))
  for (const m of text.matchAll(/hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%/gi)) out.push([((+m[1] % 360) + 360) % 360, +m[2] / 100, +m[3] / 100])
  for (const m of text.matchAll(/\b(?:bg|text|from|via|to|border|ring|shadow|fill|stroke)-(purple|violet|indigo|fuchsia|blue|sky|pink|rose|red|orange|amber|yellow|lime|green|emerald|teal|cyan)-(\d{2,3})\b/g)) {
    const shade = +m[2]
    out.push([TW_HUES[m[1]], 0.7, shade <= 300 ? 0.8 : shade >= 800 ? 0.25 : 0.55])
  }
  return out.filter(([, s, l]) => s >= 0.25 && l > 0.12 && l < 0.9)
}

function isPurpleBlue([h, s]: [number, number, number]): boolean {
  return h >= 228 && h <= 300 && s >= 0.3
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function all(re: RegExp, text: string): string[] {
  return [...text.matchAll(re)].map((m) => m[0])
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

function sample(xs: string[], n = 4): string[] {
  return uniq(xs.map((x) => x.trim().slice(0, 90))).slice(0, n)
}

function px(value: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(value.trim())
  if (!m) return null
  const n = parseFloat(m[1])
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n
}

/* ── the word list (CLAUDE.md, plus the usual company) ─────────────────── */

export const EMPTY_WORDS: RegExp[] = [
  /\bunlock(?:s|ed|ing)?\b/gi,
  /\belevat(?:e|es|ed|ing)\b/gi,
  /\bseamless(?:ly)?\b/gi,
  /\bpowerful\b/gi,
  /\beffortless(?:ly)?\b/gi,
  /\bsupercharg(?:e|es|ed|ing)\b/gi,
  /\btransform(?:s|ed|ing|ative)?\b/gi,
  /\bempower(?:s|ed|ing|ment)?\b/gi,
  /\bstreamlin(?:e|es|ed|ing)\b/gi,
  /\brevolutioni[sz](?:e|es|ed|ing)\b/gi,
  /\bgame[ -]?chang(?:er|ing)\b/gi,
  /\bnext[ -]level\b/gi,
  /\bcutting[ -]edge\b/gi,
  /\bstate[ -]of[ -]the[ -]art\b/gi,
  /\bworld[ -]class\b/gi,
  /\bunleash(?:es|ed|ing)?\b/gi,
  /\bharness(?:es|ed|ing)?\b/gi,
  /\bleverag(?:e|es|ed|ing)\b/gi,
  /\binnovative\b/gi,
  /\bdelv(?:e|es|ing)\b/gi,
  /\bembark\b/gi,
  /\btapestry\b/gi,
  /\blook no further\b/gi,
  /\bin today'?s fast[ -]paced\b/gi,
  /\byour (?:fitness |creative |wellness |learning )?journey\b/gi,
]

const FAKE_PROOF: RegExp[] = [
  /\b\d{1,3}(?:,\d{3})+\s*\+/g,
  /\b\d+(?:\.\d+)?\s*[kKmM]\s*\+/g,
  /\b\d{2,}\s*\+\s*(?:happy\s+)?(?:clients|customers|students|members|users|creators|brands|downloads|projects|reviews)\b/gi,
  /\b\d{2,3}\s*%\s*(?:satisfaction|success|of (?:clients|customers|students)|retention|faster|more)\b/gi,
  /\b[45]\.\d\s*(?:\/\s*5|out of 5|stars?)\b/gi,
  /\btrusted by\b/gi,
  /\bas seen (?:on|in)\b/gi,
  /\bjoin (?:thousands|millions|hundreds|over \d)/gi,
  /\b(?:Sarah|John|Emily|Michael|Jessica|David|Jane|Alex) [A-Z]\.(?=\s|,|<|$)/g,
  /\bloved by\b/gi,
]

const STOCK = /\b(handshake|high[- ]?five|business (?:meeting|people|team)|laptop (?:and|with) coffee|coffee and laptop|pointing at (?:a )?(?:screen|whiteboard)|lightbulb|light bulb|rocket|puzzle pieces?|headset|stock[- ]photo|smiling (?:woman|man|team)|diverse team|lotus pose|dumbbell model)\b/i
const PLACEHOLDER_IMG = /(via\.placeholder\.com|placehold\.co|placeholder\.com|picsum\.photos|source\.unsplash\.com|unsplash\.it|dummyimage\.com|loremflickr|fakeimg)/i

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

/* ── the checks ────────────────────────────────────────────────────────── */

interface Unit {
  path?: string
  html: string
  css: string
  copy: string[]
  /** The <schema> JSON text of a .storelib file, "" for plain html. */
  schema: string
}

interface Ctx {
  units: Unit[]
  css: string
  html: string
  text: string
  allow: Set<SlopAllowance>
  concept: VisualConcept | null
  input: SlopInput
}

type Raw = Omit<SlopFinding, "excused"> & { allowance?: SlopAllowance }

function gradients(c: Ctx): Raw[] {
  const found = [...all(/(?:repeating-)?(?:linear|radial|conic)-gradient\([^;{}]*\)/gi, c.css), ...all(/(?:repeating-)?(?:linear|radial|conic)-gradient\([^;"']*\)/gi, c.html), ...all(/\bbg-gradient-to-[a-z]+\b/g, c.html)]
  const textGrad = /background-clip\s*:\s*text|bg-clip-text/i.test(c.css + c.html) && found.length > 0
  /* A scrim (transparent to dark) is how text stays readable on a photo, not decoration. */
  const decorative = found.filter((g) => !/transparent|rgba\(0,\s*0,\s*0|rgba\(0 0 0|#000/.test(g) || colorsIn(g).length > 0)
  if (!decorative.length && !textGrad) return []
  const sev: SlopSeverity = decorative.length >= 5 || textGrad ? "error" : decorative.length >= 2 ? "warn" : "info"
  return [{
    rule: "gradients",
    severity: sev,
    message: `${decorative.length} decorative gradient${decorative.length === 1 ? "" : "s"}${textGrad ? ", including gradient text" : ""}.`,
    fix: "Use solid fills from the palette. Keep a gradient only as a readability scrim on photos, or one deliberate brand gradient in one place.",
    evidence: sample(decorative.length ? decorative : found),
    knowledge: "anti-slop-purple-gradients",
    allowance: "gradients",
  }]
}

function purple(c: Ctx): Raw[] {
  const colors = colorsIn(c.css + "\n" + c.html + "\n" + JSON.stringify(c.input.tokens?.colors ?? {}))
  if (!colors.length) return []
  const pb = colors.filter(isPurpleBlue)
  const hues = uniq(pb.map(([h]) => Math.round(h / 10)))
  const share = pb.length / colors.length
  if (pb.length < 2 || share < 0.4) return []
  return [{
    rule: "purple",
    severity: share >= 0.6 && hues.length >= 2 ? "error" : "warn",
    message: `${Math.round(share * 100)}% of the colours used are in the violet and indigo range, the default machine palette.`,
    fix: "Take the palette from the brand or the concept (color-palettes-by-mood). Keep one accent; neutrals tinted toward it.",
    evidence: [`${pb.length} of ${colors.length} chromatic colours`],
    knowledge: "anti-slop-purple-gradients",
    allowance: "purple",
  }]
}

function glow(c: Ctx): Raw[] {
  const shadows = all(/(?:box|text)-shadow\s*:[^;}]+/gi, c.css).filter((s) => {
    const blur = [...s.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => +m[1])
    return blur.some((b) => b >= 24) && colorsIn(s).length > 0
  })
  const blobs = all(/filter\s*:\s*blur\(\s*(\d+)px\)/gi, c.css).filter((s) => +(/(\d+)px/.exec(s)?.[1] ?? 0) >= 30)
  const tw = all(/\b(?:shadow-(?:purple|violet|indigo|fuchsia|blue|pink|cyan)-\d{3}|blur-3xl|blur-\[\d{2,}px\])\b/g, c.html)
  /* Decorative blobs and orbs by name, and big radial colour spots: the "gradient blob" background. */
  const named = all(/class="[^"]*\b(?:blob|orb|aurora|mesh-gradient|glow-(?:bg|blob|orb))[\w-]*/gi, c.html).map((m) => m.replace(/^class="/, ""))
  const spots = all(/radial-gradient\(\s*(?:circle|ellipse)[^;{}]*\)/gi, c.css).filter((g) => colorsIn(g).length > 0 && /transparent/i.test(g))
  const found = [...shadows, ...blobs, ...tw, ...named, ...spots]
  if (!found.length) return []
  return [{
    rule: "glow",
    severity: found.length >= 3 ? "error" : "warn",
    message: `${found.length} coloured glow${found.length === 1 ? "" : "s"} or blurred blob${found.length === 1 ? "" : "s"}.`,
    fix: "Remove glows and blur blobs. Separate surfaces with background steps or a hairline; if depth is needed, one soft neutral shadow.",
    evidence: sample(found),
    knowledge: "anti-slop-purple-gradients",
    allowance: "glow",
  }]
}

function glass(c: Ctx): Raw[] {
  const found = [...all(/backdrop-filter\s*:\s*blur\([^)]*\)/gi, c.css), ...all(/\bbackdrop-blur(?:-[a-z0-9]+)?\b/g, c.html)]
  if (!found.length) return []
  const fallback = /@supports/.test(c.css)
  return [{
    rule: "glass",
    severity: "warn",
    message: `Frosted glass panels (${found.length})${fallback ? "" : " without a solid fallback"}.`,
    fix: "Use a solid surface. If the concept is glassmorphism, keep it over a real image, test text contrast on the busiest part, and add an @supports fallback.",
    evidence: sample(found),
    knowledge: "style-glassmorphism",
    allowance: "glass",
  }]
}

function genericHero(c: Ctx): Raw[] {
  const first = /<section[\s\S]*?<\/section>/i.exec(c.html)?.[0] ?? c.html.slice(0, 4000)
  const h1 = first.search(/<h1[\s>]/i)
  if (h1 < 0) return []
  const before = first.slice(0, h1)
  const signs: string[] = []
  if (/class="[^"]*(?:badge|pill|chip|eyebrow|tag)\b|rounded-full/i.test(before)) signs.push("a pill or badge above the heading")
  if (/text-center|text-align\s*:\s*center|align-items\s*:\s*center[\s\S]{0,80}text-align/i.test(first) || /text-align\s*:\s*center/i.test(c.css.slice(0, 3000))) signs.push("centred text")
  const buttons = (first.match(/<(?:a|button)\b[^>]*class="[^"]*(?:btn|button)[^"]*"/gi) ?? []).length + (first.match(/<button\b/gi) ?? []).length
  if (buttons >= 2) signs.push("two or more buttons side by side")
  if (/gradient|bg-clip-text/i.test(first)) signs.push("a gradient in the hero")
  if (/glow|blur-3xl|shadow-(?:purple|indigo|violet)/i.test(first)) signs.push("a glow behind the hero")
  const words = EMPTY_WORDS.some((re) => new RegExp(re.source, "i").test(visibleText(first)))
  if (words) signs.push("generic heading words")
  if (signs.length < 3) return []
  return [{
    rule: "generic-hero",
    severity: signs.length >= 4 ? "error" : "warn",
    message: `The first section matches the template hero: ${signs.join(", ")}.`,
    fix: "Pick the hero type the business needs (immersive, editorial, split, product, statement), a heading only this business could use, and one primary action.",
    evidence: signs,
    knowledge: "anti-slop-generic-hero",
    allowance: "centered-hero",
  }]
}

/** Runs of three or more siblings that are each icon + heading + paragraph. */
function iconCardRuns(html: string): number {
  const cards = html.match(/<(?:div|li|article)\b[^>]*>\s*(?:<(?:svg|i|span|div)\b[^>]*(?:icon|lucide|heroicon|<path)[\s\S]{0,600}?)<h[2-4][^>]*>[\s\S]{0,200}?<\/h[2-4]>\s*<p[\s>]/gi) ?? []
  return cards.length
}

function identicalLayout(c: Ctx): Raw[] {
  const signs: string[] = []
  const cards = iconCardRuns(c.html)
  if (cards >= 3) signs.push(`${cards} icon + heading + paragraph cards`)
  if (/trusted by|logos?\b[^<]{0,40}(?:companies|brands)|logo[- ]cloud/i.test(c.text + c.html)) signs.push("a logo strip")
  const tiers = (c.html.match(/class="[^"]*(?:pricing|tier|plan)[-_ ]?(?:card|tier|column)?\b/gi) ?? []).length
  if (tiers >= 3) signs.push("three pricing tiers")
  if (/(?:most popular|recommended)/i.test(c.text) && tiers >= 3) signs.push("a raised middle plan")
  if (/class="[^"]*(?:testimonial|carousel)/i.test(c.html)) signs.push("a testimonial carousel")
  if (/class="[^"]*(?:cta-band|cta-section|cta_banner)|bg-gradient[^"]*"[\s\S]{0,200}<h2/i.test(c.html)) signs.push("a CTA band")
  if (signs.length < 3) return []
  return [{
    rule: "identical-layout",
    severity: signs.length >= 4 ? "error" : "warn",
    message: `The page follows the landing page template: ${signs.join(", ")}.`,
    fix: "Order sections by what this visitor needs (core-content-hierarchy). Show the real product or work instead of feature cards, take the number of items from the content, and drop parts with nothing real behind them.",
    evidence: signs,
    knowledge: "anti-slop-identical-saas",
    allowance: "bento",
  }]
}

function randomIcons(c: Ctx): Raw[] {
  const icons = (c.html.match(/<svg\b|<i\s+class="[^"]*(?:icon|fa-|bi-|ri-)[^"]*"|\blucide-[a-z-]+|\bheroicon/gi) ?? []).length
  const headings = Math.max(1, (c.html.match(/<h[1-6][\s>]/gi) ?? []).length)
  const emojiHeadings = (c.html.match(/<h[1-6][^>]*>[^<]*<\/h[1-6]>/gi) ?? []).filter((h) => EMOJI.test(h))
  const tiles = (c.html.match(/class="[^"]*(?:icon-(?:wrap|box|tile|circle|bg)|feature-icon)[^"]*"/gi) ?? []).length
  const emojiBullets = (c.html.match(/<li[^>]*>\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length
  const evidence: string[] = []
  if (icons >= 6 && icons / headings >= 1) evidence.push(`${icons} icons for ${headings} headings`)
  if (tiles >= 3) evidence.push(`${tiles} icon tiles`)
  if (emojiHeadings.length) evidence.push(`emoji in ${emojiHeadings.length} heading${emojiHeadings.length === 1 ? "" : "s"}`)
  if (emojiBullets >= 2) evidence.push(`${emojiBullets} emoji used as bullets`)
  if (!evidence.length) return []
  return [{
    rule: "random-icons",
    severity: emojiHeadings.length || tiles >= 4 ? "warn" : "info",
    message: `Decorative icons: ${evidence.join(", ")}.`,
    fix: "Remove icons that only decorate. Keep icons that help recognition (cart, menu, play, social), from one set at one stroke width, with accessible names.",
    evidence,
    knowledge: "anti-slop-random-icons",
    allowance: "icons",
  }]
}

function floatingCards(c: Ctx): Raw[] {
  const rules = c.css.match(/[^{}]+\{[^{}]*\}/g) ?? []
  const floating = rules.filter((r) => /position\s*:\s*absolute/i.test(r) && /box-shadow/i.test(r) && !/::(?:before|after)/.test(r))
  const bob = all(/@keyframes\s+[\w-]*(?:float|bob|hover|levitate)[\w-]*/gi, c.css)
  const nested = (c.html.match(/class="[^"]*\bcard\b[^"]*"[^>]*>(?:(?!<\/(?:div|article)>)[\s\S]){0,400}?class="[^"]*\bcard\b/gi) ?? []).length
  const evidence = [...floating.map((r) => r.split("{")[0].trim()), ...bob, ...(nested ? [`${nested} card inside a card`] : [])]
  if (floating.length + bob.length < 2 && !nested) return []
  return [{
    rule: "floating-cards",
    severity: floating.length + bob.length >= 3 ? "warn" : "info",
    message: `Floating or nested cards (${floating.length} floating, ${bob.length} float animations, ${nested} nested).`,
    fix: "Remove decorative floating cards; keep one only when it carries real information. Put text on the page background instead of in cards, and never a card inside a card.",
    evidence: sample(evidence),
    knowledge: "anti-slop-floating-cards",
    allowance: "floating-elements",
  }]
}

const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "cursive", "inherit", "initial", "unset", "-apple-system", "blinkmacsystemfont"])

function typography(c: Ctx): Raw[] {
  const families = uniq(
    all(/font-family\s*:\s*([^;}]+)/gi, c.css)
      .map((d) => d.replace(/font-family\s*:\s*/i, "").split(",")[0].trim().replace(/["']/g, "").toLowerCase())
      .filter((f) => f && !f.startsWith("var(") && !GENERIC_FAMILIES.has(f)),
  )
  for (const f of [c.input.tokens?.fonts?.heading, c.input.tokens?.fonts?.body, c.input.tokens?.fonts?.accent]) if (f) families.push(f.toLowerCase())
  const fams = uniq(families)
  const sizes = uniq(all(/font-size\s*:\s*([^;}]+)/gi, c.css).map((d) => d.replace(/font-size\s*:\s*/i, "").trim()).filter((s) => !/^(inherit|1em|100%)$/.test(s)))
  const twSizes = uniq(all(/\btext-(?:xs|sm|base|lg|xl|[2-9]xl|\[\d+(?:\.\d+)?(?:px|rem)\])\b/g, c.html))
  const allSizes = sizes.length + twSizes.length
  const out: Raw[] = []
  if (fams.length > 3) {
    out.push({ rule: "typography", severity: "error", message: `${fams.length} font families: ${fams.join(", ")}.`, fix: "Two families (display and body) plus an optional mono. Map every text style to them.", evidence: fams.slice(0, 6), knowledge: "anti-slop-typography-chaos" })
  } else if (fams.length === 3 && !fams.some((f) => /mono|code/.test(f))) {
    out.push({ rule: "typography", severity: "warn", message: `Three font families: ${fams.join(", ")}.`, fix: "Drop to a display and a body face; a third only if it is a mono for data.", evidence: fams, knowledge: "anti-slop-typography-chaos" })
  }
  if (allSizes > 10) {
    out.push({
      rule: "typography",
      severity: allSizes > 14 ? "warn" : "info",
      message: `${allSizes} different font sizes.`,
      fix: "Use a type scale of 6 to 8 steps as tokens (typography-scale) and replace near duplicates with one value.",
      evidence: sample([...sizes, ...twSizes], 8),
      knowledge: "anti-slop-typography-chaos",
      allowance: "many-sizes",
    })
  }
  return out
}

function radii(c: Ctx): number[] {
  const out: number[] = []
  for (const d of all(/border-radius\s*:\s*([^;}]+)/gi, c.css)) {
    const v = d.replace(/border-radius\s*:\s*/i, "").trim().split(/\s+/)[0]
    if (/%$/.test(v)) out.push(parseFloat(v) >= 50 ? 999 : 0)
    else if (/var\(/.test(v)) continue
    else {
      const n = px(v)
      if (n !== null) out.push(n)
    }
  }
  const tw: Record<string, number> = { "rounded-full": 999, "rounded-3xl": 24, "rounded-2xl": 16, "rounded-xl": 12, "rounded-lg": 8, "rounded-md": 6, rounded: 4, "rounded-sm": 2, "rounded-none": 0 }
  for (const m of c.html.matchAll(/\brounded(?:-(?:full|3xl|2xl|xl|lg|md|sm|none))?\b/g)) out.push(tw[m[0]] ?? 4)
  return out
}

function pills(c: Ctx): Raw[] {
  const r = radii(c)
  const pill = r.filter((x) => x >= 99).length
  /* Avatars and dots are round on purpose; discount one per img inside a rounded-full. */
  const avatars = (c.html.match(/<img[^>]*rounded-full|avatar/gi) ?? []).length
  const n = Math.max(0, pill - avatars)
  if (n < 4) return []
  return [{
    rule: "pills",
    severity: n >= 6 ? "warn" : "info",
    message: `${n} pill shaped elements.`,
    fix: "Delete badges that repeat a heading; keep chips that show real state (Sold out, a real filter). Labels can be plain small text.",
    evidence: [`${n} elements with a full radius`],
    knowledge: "anti-slop-pill-badges",
    allowance: "pills",
  }]
}

function radius(c: Ctx): Raw[] {
  const r = radii(c).filter((x) => x < 99)
  if (r.length < 3) return []
  const large = r.filter((x) => x >= 20)
  const want = c.concept?.layout.radius
  const conceptTight = typeof want === "number" && want <= 6
  /* Rounded-xl and up on everything: most corners round and many of them reads as the default kit. */
  const roundish = r.filter((x) => x >= 12)
  const everywhere = roundish.length >= 6 && roundish.length / r.length >= 0.7
  if (large.length / r.length < 0.5 && !(conceptTight && large.length >= 2) && !everywhere) return []
  return [{
    rule: "radius",
    severity: conceptTight || everywhere ? "warn" : "info",
    message: everywhere && large.length / r.length < 0.5 ? `${roundish.length} of ${r.length} corner radii are 12px or more: rounded corners on everything.` : `${large.length} of ${r.length} corner radii are 20px or more${conceptTight ? `, but the concept says ${want}px` : ""}.`,
    fix: "Use the concept's radius system: 0 for Swiss, editorial, luxury and brutalist; 2 to 6px for most sites; larger only for friendly concepts. Photos usually square cornered.",
    evidence: uniq((large.length ? large : roundish).map((x) => `${x}px`)).slice(0, 5),
    knowledge: "anti-slop-excessive-radius",
    allowance: "large-radius",
  }]
}

function emptyWords(c: Ctx): Raw[] {
  const hits: string[] = []
  for (const re of EMPTY_WORDS) for (const m of c.text.matchAll(new RegExp(re.source, "gi"))) hits.push(m[0].toLowerCase())
  if (!hits.length) return []
  return [{
    rule: "empty-words",
    severity: hits.length >= 3 ? "error" : "warn",
    message: `Empty marketing words: ${uniq(hits).join(", ")}.`,
    fix: "Replace each with the specific thing: what happens, for whom, how long, how many, made of what (core-copywriting).",
    evidence: uniq(hits).slice(0, 8),
    knowledge: "anti-slop-empty-words",
  }]
}

function fakeProof(c: Ctx): Raw[] {
  const real = new Set((c.input.facts?.numbers ?? []).map((n) => n.replace(/[^\d.]/g, "")).filter(Boolean))
  /* A number the store supplied stands as "N" so no pattern can call it invented, however it is formatted. */
  const text = c.text.replace(/\d[\d,.]*/g, (m) => (real.has(m.replace(/[^\d.]/g, "").replace(/\.$/, "")) ? "N" : m))
  const hits: string[] = []
  for (const re of FAKE_PROOF) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))) {
      if (/trusted by|as seen|loved by/i.test(m[0]) && c.input.facts?.logos) continue
      if (/out of 5|stars?|\/\s*5/i.test(m[0]) && c.input.facts?.reviews) continue
      hits.push(m[0])
    }
  }
  const testimonialMarkup = /<blockquote|class="[^"]*testimonial/i.test(c.html)
  const quotesBaked = testimonialMarkup && !c.input.facts?.quotes && /<blockquote[^>]*>\s*(?:<p>)?\s*["“]?[A-Z][^<{]{20,}/i.test(c.html)
  if (quotesBaked) hits.push("testimonial text written into the markup with no supplied quotes")
  if (!hits.length) return []
  return [{
    rule: "fake-proof",
    severity: "error",
    message: `Claims with nothing behind them: ${sample(hits, 5).join("; ")}.`,
    fix: "Remove numbers, ratings, logos and quotes the store or creator did not supply. Leave the section as an editor only prompt, or show real proof (the work, real product details).",
    evidence: sample(hits, 6),
    knowledge: "anti-slop-fake-proof",
  }]
}

/** A section's skeleton: the meaningful tags in order, runs collapsed. */
export function sectionFingerprint(html: string): string {
  const tags = (html.match(/<(h[1-6]|p|img|picture|video|ul|ol|li|button|form|blockquote|figure|table|a)\b/gi) ?? []).map((t) => t.slice(1).toLowerCase())
  const out: string[] = []
  for (const t of tags) {
    const last = out[out.length - 1]
    if (last && last.replace(/\*$/, "") === t) out[out.length - 1] = `${t}*`
    else out.push(t)
  }
  const centred = /text-center|text-align\s*:\s*center|data-align="center"/i.test(html) ? "C:" : ""
  return centred + out.join(">")
}

function repetitiveStructure(c: Ctx): Raw[] {
  const out: Raw[] = []
  const sections = c.html.match(/<section\b[\s\S]*?<\/section>/gi) ?? []
  if (sections.length >= 3) {
    const prints = sections.map(sectionFingerprint).filter((p) => p.length > 3)
    let run = 1
    let worst = 1
    for (let i = 1; i < prints.length; i++) {
      run = prints[i] === prints[i - 1] ? run + 1 : 1
      worst = Math.max(worst, run)
    }
    const counts = new Map<string, number>()
    for (const p of prints) counts.set(p, (counts.get(p) ?? 0) + 1)
    const most = Math.max(0, ...counts.values())
    if (worst >= 3 || (prints.length >= 4 && most / prints.length > 0.5)) {
      out.push({
        rule: "repetitive-structure",
        severity: worst >= 3 ? "warn" : "info",
        message: `${worst >= 3 ? `${worst} sections in a row` : `${most} of ${prints.length} sections`} share one structure.`,
        fix: "Vary on purpose: a full bleed band after a dense list, left aligned after centred, one large item instead of three small. Let each section's form come from its content.",
        evidence: sample([...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${n}x ${p}`), 3),
        knowledge: "anti-slop-repetitive-structure",
      })
    }
  }
  const types = (c.input.sections ?? []).map((s) => s.type)
  const typeCounts = new Map<string, number>()
  for (const t of types) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
  const repeated = [...typeCounts.entries()].filter(([, n]) => n >= 3)
  if (repeated.length) {
    out.push({
      rule: "repetitive-structure",
      severity: "warn",
      message: `The same section type placed ${repeated.map(([t, n]) => `${n} times (${t})`).join(", ")} on one page.`,
      fix: "Merge them, or use different section types for different jobs on the page.",
      evidence: repeated.map(([t, n]) => `${t} x${n}`),
      knowledge: "anti-slop-repetitive-structure",
    })
  }
  return out
}

function spacing(c: Ctx): Raw[] {
  const values: number[] = []
  for (const d of all(/(?:^|[;{\s])(?:margin|padding|gap|row-gap|column-gap)(?:-(?:top|bottom|left|right|block|inline))?\s*:\s*([^;}]+)/gi, c.css)) {
    const v = d.split(":")[1] ?? ""
    for (const part of v.trim().split(/\s+/)) {
      const n = px(part)
      if (n !== null && n > 0) values.push(Math.round(n * 100) / 100)
    }
  }
  const u = uniq(values)
  if (u.length < 8) return []
  const off = u.filter((v) => v % 4 !== 0)
  if (u.length <= 12 && off.length / u.length <= 0.35) return []
  return [{
    rule: "spacing",
    severity: off.length / u.length > 0.5 && u.length > 12 ? "warn" : "info",
    message: `${u.length} different spacing values, ${off.length} off the 4px grid.`,
    fix: "Use a spacing scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128) as tokens, fluid section padding with clamp, and closer spacing inside groups than between them.",
    evidence: off.slice(0, 8).map((v) => `${v}px`),
    knowledge: "anti-slop-unbalanced-spacing",
  }]
}

function stockImagery(c: Ctx): Raw[] {
  const imgs = c.html.match(/<img\b[^>]*>/gi) ?? []
  const hits = imgs.filter((t) => STOCK.test(t) || PLACEHOLDER_IMG.test(t))
  if (!hits.length) return []
  return [{
    rule: "stock-imagery",
    severity: hits.some((t) => PLACEHOLDER_IMG.test(t)) ? "warn" : "info",
    message: `${hits.length} image${hits.length === 1 ? "" : "s"} from placeholder services or stock clichés.`,
    fix: "Use the creator's own photos, or images chosen from the concept's imagery direction (subject, light, crop), in image_picker settings.",
    evidence: sample(hits.map((t) => /alt="([^"]*)"/.exec(t)?.[1] || /src="([^"]*)"/.exec(t)?.[1] || t), 4),
    knowledge: "anti-slop-stock-imagery",
  }]
}

function weakMobile(c: Ctx): Raw[] {
  const responsive = /@media[^{]*(?:min|max)-width|@media[^{]*width\s*[<>]|@container/i.test(c.css) || /\b(?:sm|md|lg|xl):/.test(c.html)
  const multi = all(/grid-template-columns\s*:\s*[^;}]+/gi, c.css).filter((d) => !/auto-(?:fill|fit)|minmax\(\s*min\(/i.test(d) && (/repeat\(\s*[2-9]/i.test(d) || d.split(":")[1].trim().split(/\s+/).length >= 2))
  const flexRow = /display\s*:\s*flex/i.test(c.css) && /flex-direction\s*:\s*row|flex\s*:\s*0 0 (?:[3-9]\d|\d{3})%/i.test(c.css)
  const twMulti = /\bgrid-cols-[2-9]\b/.test(c.html) && !/\b(?:sm|md|lg|xl):grid-cols/.test(c.html)
  const fixed = all(/(?:^|[;{\s])(?:min-)?width\s*:\s*(\d{3,})px/gi, c.css).filter((d) => +(/(\d{3,})px/.exec(d)?.[1] ?? 0) > 480)
  const tiny = all(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi, c.css).filter((d) => +(/(\d+(?:\.\d+)?)px/.exec(d)?.[1] ?? 99) < 12)
  const vw = all(/width\s*:\s*100vw/gi, c.css)
  const evidence: string[] = []
  if ((multi.length || flexRow || twMulti) && !responsive) evidence.push("multi column layout with no media or container queries")
  if (fixed.length) evidence.push(`fixed widths: ${sample(fixed, 3).join(", ")}`)
  if (tiny.length) evidence.push(`text under 12px: ${sample(tiny, 3).join(", ")}`)
  if (vw.length) evidence.push("width: 100vw (overflows when a scrollbar shows)")
  if (!evidence.length) return []
  return [{
    rule: "weak-mobile",
    severity: evidence[0].startsWith("multi") ? "error" : "warn",
    message: `Weak on phones: ${evidence.join("; ")}.`,
    fix: "Write the phone layout as the base and add breakpoints for wider screens; use minmax(min(240px, 100%), 1fr) grids, max-width instead of width, body text 16px or more, and width 100% instead of 100vw.",
    evidence,
    knowledge: "anti-slop-weak-mobile",
  }]
}

function animation(c: Ctx): Raw[] {
  const keyframes = all(/@keyframes\s+[\w-]+/gi, c.css)
  const infinite = all(/animation(?:-iteration-count)?\s*:[^;}]*\binfinite\b/gi, c.css).length + (c.html.match(/\banimate-(?:spin|ping|pulse|bounce)\b/g) ?? []).length
  const transitions = all(/transition\s*:[^;}]+/gi, c.css)
  const long = [...all(/(?:animation|transition)(?:-duration)?\s*:[^;}]*?(\d+(?:\.\d+)?)(m?s)\b/gi, c.css)].filter((d) => {
    const m = /(\d+(?:\.\d+)?)(m?s)\b/.exec(d)
    if (!m) return false
    const ms = m[2] === "s" ? +m[1] * 1000 : +m[1]
    return ms > 1200 && !/infinite/.test(d)
  })
  const moving = keyframes.length > 0 || transitions.length > 0 || infinite > 0 || /\banimate-/.test(c.html)
  const reduced = /prefers-reduced-motion/i.test(c.css + c.html) || /motion-safe:|motion-reduce:/.test(c.html)
  const out: Raw[] = []
  if (moving && !reduced && (keyframes.length > 0 || infinite > 0 || transitions.length > 2)) {
    out.push({ rule: "animation", severity: "error", message: "Motion with no prefers-reduced-motion handling.", fix: "Put motion inside @media (prefers-reduced-motion: no-preference), or switch it off under reduce; content must be visible without animation.", evidence: sample([...keyframes, ...transitions], 3), knowledge: "motion-principles" })
  }
  const stance = c.concept?.motion.stance
  const loopLimit = c.allow.has("rich-motion") ? 2 : 0
  const evidence: string[] = []
  if (infinite > loopLimit) evidence.push(`${infinite} infinite animation${infinite === 1 ? "" : "s"}`)
  if (long.length) evidence.push(`${long.length} transition${long.length === 1 ? "" : "s"} over 1.2s`)
  if (keyframes.length > 5) evidence.push(`${keyframes.length} keyframe animations`)
  if (stance === "none" && keyframes.length) evidence.push("the concept's motion stance is none")
  if (evidence.length) {
    out.push({
      rule: "animation",
      severity: infinite > loopLimit + 2 || stance === "none" ? "warn" : "info",
      message: `More motion than it needs: ${evidence.join(", ")}.`,
      fix: "Keep motion that explains or confirms; at most one ambient loop and only in an expressive or cinematic concept; UI transitions under 300ms.",
      evidence,
      knowledge: "anti-slop-unnecessary-animation",
      allowance: "rich-motion",
    })
  }
  return out
}

/* ── round N: type ─────────────────────────────────────────────────────── */

/** CSS rules as selector and body, comments and at-rule wrappers ignored. */
function cssRules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = []
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim(), body: m[2] })
  return out
}

/** A rule that sets display type: headings, titles, heroes, a section's own __h / __title. */
const DISPLAY_SELECTOR = /(?:^|[\s,>+~(])h[1-3]\b|display|title|heading|headline|hero|__h\b|-h\b|masthead|wordmark/i

/** Px for a CSS length, rem and em at 16. */
function sizePx(v: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(v.trim())
  if (!m) return null
  return m[2] === "px" ? +m[1] : +m[1] * 16
}

function defaultFonts(c: Ctx): Raw[] {
  const evidence: string[] = []
  const display = c.concept?.typeSystem?.display
  if (display && isSlopDisplayFont(display)) evidence.push(`the concept's display face is ${display}`)
  const heading = c.input.tokens?.fonts?.heading
  if (heading && isSlopDisplayFont(heading)) evidence.push(`the heading token is ${heading}`)
  const declared: string[] = []
  for (const r of cssRules(c.css)) {
    const m = /font-family\s*:\s*([^;]+)/i.exec(r.body)
    if (!m) continue
    const v = m[1].trim()
    if (/^var\(/i.test(v) || /\{\{/.test(v)) continue
    declared.push(v)
    if (DISPLAY_SELECTOR.test(r.selector) && isSlopDisplayFont(v)) evidence.push(`${r.selector.slice(0, 40)} is set in ${v.split(",")[0].trim()}`)
  }
  /* System-ui alone: every family named anywhere is a default and nothing reads the theme's fonts. */
  const readsTheme = /var\(--(?:theme-font|t-font|font-heading|font-display)/i.test(c.css)
  if (!evidence.length && declared.length && !readsTheme && declared.every((v) => isSlopDisplayFont(v))) evidence.push(`every face named is a default (${uniq(declared.map((v) => firstFamily(v))).join(", ")})`)
  const tw = (c.html.match(/<h[1-3][^>]*class="[^"]*\bfont-sans\b/gi) ?? []).length
  if (tw >= 2 && !readsTheme) evidence.push(`${tw} headings in font-sans`)
  if (!evidence.length) return []
  return [{
    rule: "default-fonts",
    severity: "error",
    message: `The display type is a default face: ${evidence.join("; ")}.`,
    fix: "Set headings in a face with character from the type library (search_knowledge \"type library\": editorial serif, characterful grotesk, condensed display, mono). Inter, Roboto and the like may stay as body text. Fonts come from set_tokens fonts; read them with var(--theme-font-heading).",
    evidence,
    knowledge: "typography-type-library",
    allowance: "default-fonts",
  }]
}

function typeScale(c: Ctx): Raw[] {
  const fluid: string[] = []
  const fixedLarge: string[] = []
  let maxDisplay = 0
  for (const r of cssRules(c.css)) {
    for (const m of r.body.matchAll(/font-size\s*:\s*([^;]+)/gi)) {
      const v = m[1].trim()
      if (/clamp\(|min\(|max\(|\d(?:vw|vi|cqi|cqw)\b|var\(--(?:step|t-step|fs|size|text|font-size|type)/i.test(v)) {
        fluid.push(v)
        const upper = [...v.matchAll(/(\d*\.?\d+)(px|rem)/g)].map((x) => (x[2] === "px" ? +x[1] : +x[1] * 16))
        maxDisplay = Math.max(maxDisplay, ...upper, 0)
        continue
      }
      const px = sizePx(v)
      if (px !== null) {
        maxDisplay = Math.max(maxDisplay, px)
        if (px >= 48) fixedLarge.push(`${r.selector.slice(0, 32)}: ${v}`)
      }
    }
  }
  const tw = (c.html.match(/\btext-(?:5xl|6xl|7xl|8xl|9xl)\b/g) ?? []).length
  const twResponsive = /\b(?:sm|md|lg|xl):text-/.test(c.html)
  const out: Raw[] = []
  const large = fixedLarge.length + (twResponsive ? 0 : tw)
  if (large && !fluid.length) {
    out.push({ rule: "type-scale", severity: "error", message: `Display sizes are fixed (${large}) and nothing in the type is fluid.`, fix: "Use a fluid type scale: font-size: clamp(min, preferred, max) per step (typography-type-library has one), so a 96px headline is 44px on a phone without a breakpoint.", evidence: sample(fixedLarge.length ? fixedLarge : [`${tw} text-5xl or larger with no breakpoint`]), knowledge: "typography-scale" })
  } else if (fixedLarge.length >= 2) {
    out.push({ rule: "type-scale", severity: "warn", message: `${fixedLarge.length} display sizes are fixed px beside a fluid scale.`, fix: "Move them onto the clamp() steps so every heading scales the same way.", evidence: sample(fixedLarge), knowledge: "typography-scale" })
  }
  if (maxDisplay >= 56 && !/letter-spacing\s*:/i.test(c.css) && !/\btracking-/.test(c.html)) {
    out.push({ rule: "type-scale", severity: "warn", message: `Display type up to ${Math.round(maxDisplay)}px with default tracking everywhere.`, fix: "Large display type needs its own tracking (usually -0.01em to -0.04em; caps and small labels +0.06em to +0.2em) and its own line height (0.9 to 1.05).", evidence: [`largest size ${Math.round(maxDisplay)}px`, "no letter-spacing declared"], knowledge: "typography-tracking-measure" })
  }
  if (maxDisplay >= 40 && c.css.length > 400 && !/font-weight\s*:/i.test(c.css) && !/\bfont-(?:light|normal|medium|semibold|bold|extrabold|black)\b/.test(c.html)) {
    out.push({ rule: "type-scale", severity: "info", message: "No font weights are chosen; headings take the browser's bold.", fix: "Choose weights on purpose: a display weight from the type system and 400 for text.", evidence: ["no font-weight declared"], knowledge: "typography-hierarchy-labels" })
  }
  return out
}

/* ── round N: layout ───────────────────────────────────────────────────── */

const CARD_CLASS = /class="[^"]*\b[\w-]*(?:card|tile|feature|benefit|service|perk|item|box)\b[^"]*"/i

/** A unit that is a uniform grid of cards: a loop (or three or more siblings) of the same card in a repeat() grid. */
function isCardGrid(u: { html: string; css: string }): boolean {
  const grid = /grid-template-columns\s*:\s*repeat\(/i.test(u.css) || /\bgrid-cols-[2-6]\b/.test(u.html)
  if (!grid) return false
  for (const m of u.html.matchAll(/\{%-?\s*for\s+\w+\s+in\s+([^%]+)%\}([\s\S]*?)\{%-?\s*endfor/gi)) {
    if (/product|collection|post|article|image|photo|gallery/i.test(m[1])) continue
    if (CARD_CLASS.test(m[2])) return true
  }
  const classes = [...u.html.matchAll(/<(?:div|li|article)\b[^>]*class="([^"]*\b[\w-]*(?:card|tile|feature|benefit|service|perk)\b[^"]*)"/gi)].map((m) => m[1])
  const counts = new Map<string, number>()
  for (const k of classes) counts.set(k, (counts.get(k) ?? 0) + 1)
  return [...counts.values()].some((n) => n >= 3)
}

/** The page's sections as units: each .storelib file, or each <section> of plain html. */
function sectionUnits(c: Ctx): { label: string; html: string; css: string; schema: string }[] {
  const out: { label: string; html: string; css: string; schema: string }[] = []
  for (const u of c.units) {
    if (u.path) {
      if (!u.path.startsWith("sections/")) continue
      if (/<(?:header|footer)\b/i.test(u.html.slice(0, 400)) || /"kind"\s*:\s*"(?:header|footer)"/.test(u.schema)) continue
      out.push({ label: u.path.replace(/^sections\//, ""), html: u.html, css: u.css, schema: u.schema })
    } else {
      const sections = u.html.match(/<section\b[\s\S]*?<\/section>/gi) ?? []
      sections.forEach((h, i) => out.push({ label: `section ${i + 1}`, html: h, css: u.css, schema: "" }))
    }
  }
  return out
}

function cardGrid(c: Ctx): Raw[] {
  const units = sectionUnits(c)
  const grids = units.filter((u) => (u.css === c.css && !u.schema ? isCardGrid({ html: u.html, css: c.css }) : isCardGrid(u)))
  if (grids.length < 2) return []
  return [{
    rule: "card-grid",
    severity: grids.length >= 3 ? "error" : "warn",
    message: `${grids.length} sections are the same grid of equal cards.`,
    fix: "Give each set its own form from its content: a numbered list, one large item beside small ones, a table, a horizontal scroller, an accordion, a sticky stack. At most one equal card grid per page.",
    evidence: grids.map((g) => g.label).slice(0, 6),
    knowledge: "anti-slop-identical-saas",
  }]
}

function centred(html: string, css: string): boolean {
  return /text-center|data-align="center"/i.test(html) || /text-align\s*:\s*center/i.test(css)
}

function heroThreeCards(c: Ctx): Raw[] {
  const units = sectionUnits(c)
  const evidence: string[] = []
  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    if (!/<h1[\s>]/i.test(u.html)) continue
    const own = u.schema ? u.css : (/class="([^"]+)"/.exec(u.html)?.[1] ?? "").split(/\s+/).map((k) => cssRules(c.css).filter((r) => r.selector.includes(`.${k}`)).map((r) => `${r.selector}{${r.body}}`).join("")).join("")
    if (!centred(u.html, own)) continue
    const inSame = isCardGrid({ html: u.html, css: u.schema ? u.css : c.css })
    const next = units[i + 1]
    const nextCards = next ? (next.schema ? isCardGrid(next) : isCardGrid({ html: next.html, css: c.css })) : false
    if (inSame || nextCards) evidence.push(`${u.label}: a centred heading${inSame ? " over its own cards" : `, then ${next!.label}: a row of cards`}`)
  }
  if (!evidence.length) return []
  return [{
    rule: "hero-three-cards",
    severity: "error",
    message: `The page opens with the template: a centred hero over a row of cards (${evidence.join("; ")}).`,
    fix: "Open with what only this business has: the product large, the work full bleed, a menu, a timetable, an editorial statement set off-centre. Put the supporting points later and in a different form than cards.",
    evidence,
    knowledge: "anti-slop-generic-hero",
    allowance: "centered-hero",
  }]
}

function layoutRhythm(c: Ctx): Raw[] {
  const units = c.units.filter((u) => u.path?.startsWith("sections/") && !/"kind"\s*:\s*"(?:header|footer)"/.test(u.schema))
  if (units.length < 5) return []
  const evidence: string[] = []
  const sig = (u: Unit): string => {
    const maxW = /max-width\s*:\s*([^;}]+)/i.exec(u.css)?.[1]?.trim() ?? "none"
    const grid = /grid-template-columns/i.test(u.css) ? "grid" : "flow"
    const special = /position\s*:\s*sticky/i.test(u.css) ? "sticky" : /overflow-x\s*:\s*(?:auto|scroll)/i.test(u.css) ? "scroll" : /min-height\s*:\s*(?:\d{2,3}(?:svh|vh|dvh))/i.test(u.css) ? "tall" : ""
    return `${maxW}|${grid}|${special}`
  }
  const sigs = units.map(sig)
  const distinct = new Set(sigs).size
  if (distinct <= 2) evidence.push(`${units.length} sections share ${distinct === 1 ? "one width and layout" : "two widths and layouts"} (${[...new Set(sigs)].join(" / ")})`)
  const pads = units.map((u) => {
    try {
      const schema = JSON.parse(u.schema || "{}") as { settings?: { id?: string; default?: unknown }[] }
      const v = (id: string) => schema.settings?.find((s) => s.id === id)?.default
      const t = v("padding_top")
      const b = v("padding_bottom")
      return t === undefined && b === undefined ? (/padding(?:-block)?\s*:\s*([^;}]+)/i.exec(u.css)?.[1]?.trim() ?? "") : `${t}/${b}`
    } catch {
      return ""
    }
  })
  if (pads.every((p) => p && p === pads[0])) evidence.push(`every section has the same spacing (${pads[0]})`)
  if (units.every((u) => centred(u.html, u.css))) evidence.push("every section is centred")
  if (!evidence.length) return []
  return [{
    rule: "layout-rhythm",
    severity: evidence.length >= 2 ? "warn" : "info",
    message: `The page has one rhythm: ${evidence.join("; ")}.`,
    fix: "Vary width and density on purpose: a full bleed image after a narrow text column, a tight list after an airy statement, more space before a new chapter than inside one, one sticky or horizontal moment. Spacing defaults should differ by what the section holds.",
    evidence,
    knowledge: "layout-spacing-rhythm",
  }]
}

function emojiIcons(c: Ctx): Raw[] {
  const hits: string[] = []
  for (const m of c.html.matchAll(/<(span|i|div|p|li|h[1-6]|figure)\b[^>]*>\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][\u{FE0F}\u{200D}\u{1F300}-\u{1FAFF}]*)/gu)) hits.push(`${m[1]} starting with ${m[2]}`)
  for (const t of c.units.flatMap((u) => u.copy)) if (/^\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)) hits.push(`a setting starting with ${t.trim().slice(0, 2)}`)
  if (hits.length < 2) return []
  return [{
    rule: "emoji-icons",
    severity: "error",
    message: `Emoji used as icons or bullets (${hits.length}).`,
    fix: "Remove them. Use typography (numbers, rules, labels) for structure; if an icon helps recognition, draw a simple inline SVG from one set at one stroke width with an accessible name.",
    evidence: sample(hits),
    knowledge: "anti-slop-random-icons",
  }]
}

/** Copy that could be on any website: the template's own words. */
export const STOCK_COPY: RegExp[] = [
  /\bwelcome to (?:our|my|the) (?:website|site|store|shop|page)\b/gi,
  /\blorem ipsum\b/gi,
  /\bone[- ]stop[- ]shop\b/gi,
  /\bquality you can trust\b/gi,
  /\b(?:we are|we're|i am|i'm) passionate about\b/gi,
  /\bhigh[- ]quality (?:products|services|solutions|content)\b/gi,
  /\bbest[- ]in[- ]class\b/gi,
  /\bto the next level\b/gi,
  /\bget started today\b/gi,
  /\bwhat are you waiting for\b/gi,
  /\byour (?:success|satisfaction) is our (?:priority|mission|goal)\b/gi,
  /\bcrafted with (?:love|care|passion)\b/gi,
  /\bdesigned with you in mind\b/gi,
  /\bdiscover the difference\b/gi,
  /\bexperience the difference\b/gi,
  /\bwe(?:'ve| have) got you covered\b/gi,
  /\bsay goodbye to\b/gi,
  /\bjoin (?:our|the) community today\b/gi,
  /\bexceptional (?:quality|service|results)\b/gi,
  /\bfrom concept to (?:completion|reality)\b/gi,
  /\btailored (?:solutions|to your (?:needs|goals))\b/gi,
  /\bwe pride ourselves\b/gi,
  /\bsecond to none\b/gi,
  /\bin a world where\b/gi,
  /\bat the heart of (?:everything|what) we do\b/gi,
  /\bdive (?:in|into)\b/gi,
  /\bstep into\b/gi,
  /\bready to (?:get started|take the (?:next|first) step)\b/gi,
]

const GENERIC_HEADINGS = /^(?:features|our services|services|why choose us|why us|what we offer|about us|our story|our mission|get in touch|testimonials|how it works|our team|our products|our values|faq|frequently asked questions|contact us|learn more)$/i

function stockCopy(c: Ctx): Raw[] {
  const hits: string[] = []
  for (const re of STOCK_COPY) for (const m of c.text.matchAll(new RegExp(re.source, "gi"))) hits.push(m[0].toLowerCase())
  const headings = [...c.html.matchAll(/<h[1-3][^>]*>([^<{]+)<\/h[1-3]>/gi)].map((m) => m[1].trim()).filter((h) => GENERIC_HEADINGS.test(h))
  const headingDefaults: string[] = []
  for (const u of c.units) {
    try {
      const schema = JSON.parse(u.schema || "{}") as { settings?: { id?: string; default?: unknown }[] }
      for (const s of schema.settings ?? []) if (/heading|title/i.test(s.id ?? "") && typeof s.default === "string" && GENERIC_HEADINGS.test(s.default.trim())) headingDefaults.push(s.default.trim())
    } catch {
      /* the compiler reports bad JSON */
    }
  }
  const generic = [...headings, ...headingDefaults]
  if (generic.length >= 3) hits.push(`${generic.length} generic headings (${uniq(generic).slice(0, 4).join(", ")})`)
  if (!hits.length) return []
  return [{
    rule: "stock-copy",
    severity: hits.length >= 3 ? "error" : "warn",
    message: `Copy that could be on any website: ${uniq(hits).slice(0, 6).join("; ")}.`,
    fix: "Write what only this business would say: what it makes, for whom, where, how long, what it costs. Headings name the thing (\"Tuesday and Thursday classes\", \"The Riverside menu\"), not the slot (\"Our services\").",
    evidence: uniq(hits).slice(0, 8),
    knowledge: "core-copywriting",
  }]
}

const CHECKS: ((c: Ctx) => Raw[])[] = [gradients, purple, glow, glass, genericHero, identicalLayout, randomIcons, floatingCards, typography, pills, radius, emptyWords, fakeProof, repetitiveStructure, spacing, stockImagery, weakMobile, animation, defaultFonts, typeScale, cardGrid, heroThreeCards, layoutRhythm, emojiIcons, stockCopy]

/* ── the report ────────────────────────────────────────────────────────── */

const COST: Record<SlopSeverity, number> = { error: 15, warn: 6, info: 1 }

export function evaluateSlop(input: SlopInput, concept?: VisualConcept | null): SlopReport {
  const findings: SlopFinding[] = []
  const allow = conceptAllowances(concept ?? null)
  const units: Unit[] = []
  for (const s of input.sources ?? []) {
    const p = splitStorelib(s.content)
    units.push({ path: s.path, html: p.template, css: p.style, copy: p.copy, schema: p.schema })
  }
  if (input.html || input.css) {
    const html = input.html ?? ""
    const inlineCss = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? []).map((b) => b.replace(/<\/?style[^>]*>/gi, "")).join("\n")
    units.push({ html, css: `${input.css ?? ""}\n${inlineCss}`, copy: [], schema: "" })
  }
  if (!units.length && input.tokens) units.push({ html: "", css: "", copy: [], schema: "" })

  /* Page level checks see everything together; a habit repeated in five files is one habit. */
  const html = units.map((u) => u.html).join("\n")
  const css = units.map((u) => u.css).join("\n")
  const text = `${visibleText(html)} ${units.flatMap((u) => u.copy).join(" ")}`
  const ctx: Ctx = { units, html, css, text, allow, concept: concept ?? null, input }
  const onlyPath = units.length === 1 ? units[0].path : undefined
  for (const check of CHECKS) {
    for (const raw of check(ctx)) {
      const { allowance, ...f } = raw
      const excused = !!allowance && allow.has(allowance)
      findings.push({ ...f, severity: excused ? "info" : f.severity, excused, path: onlyPath })
    }
  }
  const order: Record<SlopSeverity, number> = { error: 0, warn: 1, info: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity] || SLOP_RULES.indexOf(a.rule) - SLOP_RULES.indexOf(b.rule))
  const counts = { error: 0, warn: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  const score = Math.max(0, 100 - findings.reduce((n, f) => n + COST[f.severity], 0))
  return { score, findings, counts }
}

/** The contract form for the agent's validate step: slop.* issues, info dropped. */
export function slopIssues(input: SlopInput, concept?: VisualConcept | null): ValidationIssue[] {
  return evaluateSlop(input, concept)
    .findings.filter((f) => f.severity !== "info")
    .map((f) => ({ severity: f.severity === "error" ? "error" : "warning", code: `slop.${f.rule}`, message: `${f.message} Fix: ${f.fix}`, path: f.path }))
}

/** The report as text for a repair turn or the LLM review pass. */
export function describeSlop(report: SlopReport): string {
  if (!report.findings.length) return `Anti-slop check: clean (score ${report.score}).`
  return [
    `Anti-slop check: score ${report.score} (${report.counts.error} errors, ${report.counts.warn} warnings).`,
    ...report.findings
      .filter((f) => f.severity !== "info")
      .map((f) => `- [${f.severity}] ${f.rule}: ${f.message} Fix: ${f.fix} (see ${f.knowledge})`),
  ].join("\n")
}
