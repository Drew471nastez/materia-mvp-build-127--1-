/**
 * ===========================================================================
 *  DIVERSITY: IS THIS SITE A NEAR COPY OF THE LAST ONES THE AGENT MADE?
 * ===========================================================================
 * Spec 8.4: detect near-duplicate output across sites by comparing section
 * order, hero topology, surface palette and typography strategy, and apply a
 * SOFT novelty penalty: a warning handed back to the agent, never an error,
 * and never at the cost of fitting the business (two bakeries may share a
 * menu section; they should not share everything).
 *
 * A fingerprint is a handful of short words (no copy, no file bodies, no
 * names): small enough to keep on the job's checkpoint (ai_site_jobs.
 * checkpoint.fingerprint) and to read back for the platform's recent agent
 * jobs in one light query (lib/ai-builder/agent/server.ts).
 *
 * Pure. Browser safe.
 */
import { firstFamily } from "@/lib/storelib-ai/library/type-systems"
import { EDITORIAL_SERIFS, isCream, sectionRole, splitStorelib } from "./slop"
import type { DesignTokens, ValidationIssue } from "./types"

export interface SiteFingerprint {
  v: 1
  /** Home's body sections by role, in order (hero, features, pricing, faq, cta, testimonials, other). */
  order: string[]
  /** The first section's composition: e.g. "split+media", "centred+type", "fullbleed+media". */
  hero: string
  /** Mode, background family and accent hue bucket: e.g. "light/cream/rust". */
  palette: string
  /** Display face category and treatment: e.g. "serif/italic", "condensed/caps", "grotesk/plain". */
  type: string
}

const MONO = /mono|code|courier/i
const CONDENSED = /condensed|compressed|narrow|oswald|anton|bebas|league gothic|antonio|barlow condensed|big shoulders|six caps/i
const SLAB = /slab|rockwell|roboto slab|zilla|arvo|bitter/i
const SERIF = /serif|garamond|caslon|baskerville|bodoni|didot|georgia|times|playfair|fraunces|gloock|cormorant|literata|lora|spectral|newsreader|young serif|gilda|italiana/i

/** The display face's category. */
export function typeCategory(family: string | null | undefined): string {
  const f = firstFamily(family ?? "")
  if (!f) return "unknown"
  if (EDITORIAL_SERIFS.includes(f)) return "serif"
  if (MONO.test(f)) return "mono"
  if (CONDENSED.test(f)) return "condensed"
  if (SLAB.test(f)) return "slab"
  if (SERIF.test(f) && !/sans/.test(f)) return "serif"
  return "grotesk"
}

function hsl(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? "").trim())
  if (!m) return null
  const h6 = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h6.slice(i, i + 2), 16) / 255)
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

const HUE_NAMES: [number, string][] = [[15, "red"], [35, "rust"], [55, "amber"], [75, "yellow"], [160, "green"], [195, "teal"], [250, "blue"], [290, "violet"], [335, "magenta"], [361, "red"]]

function hueName(hex: string | null | undefined): string {
  const c = hsl(hex)
  if (!c) return "none"
  const [h, s, l] = c
  if (s < 0.15) return l < 0.25 ? "black" : l > 0.85 ? "white" : "grey"
  return HUE_NAMES.find(([max]) => h < max)?.[1] ?? "red"
}

function surface(hex: string | null | undefined): string {
  const c = hsl(hex)
  if (!c) return "unknown"
  const [, s, l] = c
  if (isCream(hex)) return "cream"
  if (l < 0.2) return "dark"
  if (l > 0.94 && s < 0.2) return "white"
  if (l > 0.8) return s < 0.15 ? "light-grey" : `tint-${hueName(hex)}`
  return `colour-${hueName(hex)}`
}

/** The first section's composition from its markup and CSS. */
export function heroTopology(html: string, css: string): string {
  const media = /<(?:img|video|picture)\b|image_picker|\|\s*asset|background(?:-image)?\s*:[^;]*url\(/i.test(html + css)
  const centred = /text-align\s*:\s*center|text-center|data-align="center"/i.test(html + css)
  const split = /grid-template-columns\s*:\s*(?:repeat\(\s*2|[\d.]+fr\s+[\d.]+fr|minmax\([^)]*\)\s+minmax)|\bgrid-cols-2\b|flex-direction\s*:\s*row/i.test(css + html)
  const full = /min-height\s*:\s*(?:\d{2,3}(?:svh|vh|dvh))|height\s*:\s*100(?:svh|vh|dvh)|object-fit\s*:\s*cover/i.test(css)
  const shape = split ? "split" : full && media ? "fullbleed" : centred ? "centred" : "left"
  return `${shape}+${media ? "media" : "type"}`
}

/**
 * The fingerprint of a finished site: home's body sections, its first section,
 * the tokens (else the concept) for palette and type.
 */
export function siteFingerprint(input: {
  home: { type: string }[]
  sources: Record<string, string>
  tokens?: Partial<DesignTokens> | null
  concept?: { typeSystem?: { display?: string; rule?: string }; palette?: { background?: string; accent?: string; mode?: string } } | null
}): SiteFingerprint {
  const body = input.home.filter((s) => {
    const r = sectionRole(s.type)
    return r !== "header" && r !== "footer"
  })
  const order = body.map((s) => sectionRole(s.type)).slice(0, 16)
  const first = body[0]
  const firstSrc = first ? input.sources[`sections/${first.type}.storelib`] : undefined
  const parts = firstSrc ? splitStorelib(firstSrc) : null
  const hero = parts ? heroTopology(parts.template, parts.style) : first ? `builtin:${first.type}` : "none"
  const bg = input.tokens?.colors?.background ?? input.concept?.palette?.background
  const accent = input.tokens?.colors?.accent ?? input.concept?.palette?.accent
  const light = (hsl(bg)?.[2] ?? 1) >= 0.5
  const palette = `${light ? "light" : "dark"}/${surface(bg)}/${hueName(accent)}`
  const display = input.tokens?.fonts?.heading ?? input.concept?.typeSystem?.display
  const allCss = Object.entries(input.sources).filter(([p]) => p.startsWith("sections/")).map(([, t]) => splitStorelib(t).style).join("\n")
  const italic = /(?:^|[\s,}])h[12][^{]*\{[^}]*font-style\s*:\s*italic/i.test(allCss) || /\bitalic\b/i.test(input.concept?.typeSystem?.rule ?? "")
  const caps = /(?:^|[\s,}])h[12][^{]*\{[^}]*text-transform\s*:\s*uppercase/i.test(allCss) || /\b(?:caps|capitals|uppercase)\b/i.test(input.concept?.typeSystem?.rule ?? "") && !/\blabels?\b/i.test(input.concept?.typeSystem?.rule ?? "")
  const type = `${typeCategory(display)}/${italic ? "italic" : caps ? "caps" : "plain"}`
  return { v: 1, order, hero, palette, type }
}

/** Order similarity: the longest common subsequence over the longer length. */
function orderSimilarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[a.length][b.length] / Math.max(a.length, b.length)
}

/** 0 (nothing alike) to 1 (the same composition, palette and type). */
export function fingerprintSimilarity(a: SiteFingerprint, b: SiteFingerprint): number {
  const palette = (() => {
    const [am, as, aa] = a.palette.split("/")
    const [bm, bs, ba] = b.palette.split("/")
    return (am === bm ? 0.3 : 0) + (as === bs ? 0.35 : 0) + (aa === ba ? 0.35 : 0)
  })()
  const type = a.type === b.type ? 1 : a.type.split("/")[0] === b.type.split("/")[0] ? 0.6 : 0
  const hero = a.hero === b.hero ? 1 : a.hero.split("+")[0] === b.hero.split("+")[0] ? 0.5 : 0
  return 0.3 * orderSimilarity(a.order, b.order) + 0.25 * hero + 0.25 * palette + 0.2 * type
}

export const NOVELTY_THRESHOLD = 0.82

/** Fingerprints worth comparing against: well formed, at most `limit`. */
export function readFingerprints(raw: unknown[], limit = 40): SiteFingerprint[] {
  const out: SiteFingerprint[] = []
  for (const r of raw) {
    const f = r as Partial<SiteFingerprint> | null
    if (f && f.v === 1 && Array.isArray(f.order) && typeof f.hero === "string" && typeof f.palette === "string" && typeof f.type === "string") out.push(f as SiteFingerprint)
    if (out.length >= limit) break
  }
  return out
}

/**
 * The soft novelty penalty: a warning when this site is a near copy of one of
 * the platform's recent agent-built sites. Never an error, and phrased so the
 * fix keeps the business fit (change the composition and art direction, not
 * the sections the business needs).
 */
export function noveltyIssues(fp: SiteFingerprint, recent: SiteFingerprint[], threshold = NOVELTY_THRESHOLD): ValidationIssue[] {
  let best = 0
  let match: SiteFingerprint | null = null
  for (const r of recent) {
    const s = fingerprintSimilarity(fp, r)
    if (s > best) {
      best = s
      match = r
    }
  }
  if (!match || best < threshold) return []
  const same = [
    orderSimilarity(fp.order, match.order) >= 0.8 && "the same section order",
    fp.hero === match.hero && `the same hero (${fp.hero})`,
    fp.palette === match.palette && `the same palette (${fp.palette})`,
    fp.type === match.type && `the same type strategy (${fp.type})`,
  ].filter(Boolean) as string[]
  return [{
    severity: "warning",
    code: "slop.novelty",
    message: `This site is ${Math.round(best * 100)}% alike a site this platform's agent made recently: ${same.join(", ")}. Keep what the business needs, and change the art direction: a different hero composition, palette surface or display treatment, and at least one section only this business would have.`,
  }]
}

/* ═══════════════════════════════════════════════════════════════════════
   ROUND 69: A SITE ON MATERIA AGAINST ITS SOURCE TEMPLATE AND ITS SIBLINGS
   ═══════════════════════════════════════════════════════════════════════
   The owner: a site started "from a proven template" came out as that
   template with new words. A Materia site's sections are the theme's, so
   the fingerprint above (written for the agent's own components) reads them
   all alike. This one reads what a Materia site is made of: home's section
   types and their order, the layout settings each was given, the look
   (display and body face, the scheme backgrounds, the scroll reveal) and the
   words. `materiaLikeness` is 0 (nothing alike) to 1 (the same site); a new
   site from a template must stay under TEMPLATE_LIKENESS_MAX against that
   template, and two sites for two businesses under SIBLING_LIKENESS_MAX.
   Pure. Browser safe. */

/** What a Materia site is made of, in short strings (no file bodies, no pictures). */
export interface MateriaSignature {
  /** Home's body sections, in order. */
  types: string[]
  /** Each body section as "type|key=value,..." over its layout settings (never words or pictures). */
  styles: string[]
  /** Display and body faces, lowercase. */
  fonts: { heading: string; body: string }
  /** The first four scheme backgrounds, lowercase hex. */
  schemes: string[]
  /** The scroll reveal and hover effect. */
  motion: string
  /** Hashes of the words on the site (normalised; three words or more), for the copy overlap. */
  copy: string[]
}

/** Setting ids that are layout, never words or pictures: what "the same style" compares. */
const LAYOUT_SETTING = /^(section_width|content_align|text_align|vertical_align|image_position|image_ratio|image_aspect|layout|columns|columns_desktop|items_per_row|card_style|direction|heading_size|open_first|reverse|style|variant|desktop_layout|mobile_layout)$/

/** FNV-1a of a normalised phrase, 8 hex. */
export function phraseHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

/** A setting's words as compared: tags out, lowercase, letters and digits only, single spaces. Empty under four words (a button label is not copy). */
export function normalisePhrase(value: unknown): string {
  if (typeof value !== "string") return ""
  if (/^(https?:|\/|#|shopify:|data:|asset:)/i.test(value.trim())) return ""
  /* Words a person reads: four or more, written with spaces (an id, a date, "Days,Hours" or a font stack is not copy). */
  const plain = value.replace(/<[^>]*>/g, " ").trim()
  if (plain.split(/\s+/).filter((w) => /[a-z]{2}/i.test(w)).length < 4) return ""
  const t = plain.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  return t.split(" ").length >= 4 ? t : ""
}

/** Setting ids that never hold copy. */
const NOT_COPY = /(color|colour|scheme|font|animation|_url$|^url$|link$|icon|image|video|datetime|class|_id$|^id$|embed|code|css|html_tag|alignment|style)/i

type PlacedLike = { id?: string; type: string; group?: string; hidden?: boolean; settings?: Record<string, unknown>; blocks?: { id?: string; type?: string; settings?: Record<string, unknown> }[] }

/** Every phrase of three words or more a page set holds (sections and blocks), hashed, with where each is. */
export function copyPhrases(pages: readonly { key: string; sections: readonly PlacedLike[] }[]): { hash: string; page: string; section: string; setting: string }[] {
  const out: { hash: string; page: string; section: string; setting: string }[] = []
  for (const p of pages)
    for (const s of p.sections) {
      const at = s.id ?? s.type
      for (const [k, v] of Object.entries(s.settings ?? {})) {
        if (NOT_COPY.test(k)) continue
        const n = normalisePhrase(v)
        if (n) out.push({ hash: phraseHash(n), page: p.key, section: at, setting: k })
      }
      for (const b of s.blocks ?? [])
        for (const [k, v] of Object.entries(b.settings ?? {})) {
          if (NOT_COPY.test(k)) continue
          const n = normalisePhrase(v)
          if (n) out.push({ hash: phraseHash(n), page: p.key, section: at, setting: `${b.type ?? "block"}.${k}` })
        }
    }
  return out
}

const styleKey = (type: string, settings: Record<string, unknown> | undefined) =>
  `${type}|${Object.entries(settings ?? {})
    .filter(([k, v]) => LAYOUT_SETTING.test(k) && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort()
    .join(",")}`

/** The signature of a placed Materia site: home's body, its theme values (settings.shopify) and every page's words. */
export function materiaSignature(input: { home: PlacedLike[]; shopify?: Record<string, unknown> | null; pages?: { key: string; sections: PlacedLike[] }[] }): MateriaSignature {
  const body = input.home.filter((s) => !s.group && !s.hidden)
  const sh = input.shopify ?? {}
  const str = (k: string) => (typeof sh[k] === "string" ? String(sh[k]).toLowerCase() : "")
  const schemes = sh.color_schemes && typeof sh.color_schemes === "object" ? Object.values(sh.color_schemes as Record<string, { settings?: { background?: unknown } }>).slice(0, 4).map((c) => String(c?.settings?.background ?? "").toLowerCase()) : []
  return {
    types: body.map((s) => s.type),
    styles: body.map((s) => styleKey(s.type, s.settings)),
    fonts: { heading: str("font_heading_google_family") || str("font_heading_google"), body: str("font_body_google_family") || str("font_body_google") },
    schemes,
    motion: `${str("scroll_animation") || "none"}/${str("hover_effect") || "none"}`,
    copy: [...new Set(copyPhrases(input.pages ?? [{ key: "home", sections: body }]).map((c) => c.hash))],
  }
}

/** A template's signature from the catalogue's summary of it (no words there: its copy is read off the imported pages). */
export function templateSignature(t: { pages: { key: string; sections: { type: string; style?: Record<string, unknown> }[] }[]; fonts: { heading?: string; body?: string }; schemes: { background?: string }[] }, copy: string[] = []): MateriaSignature {
  const home = t.pages.find((p) => p.key === "home")?.sections ?? []
  return {
    types: home.map((s) => s.type),
    styles: home.map((s) => styleKey(s.type, s.style)),
    fonts: { heading: (t.fonts.heading ?? "").toLowerCase(), body: (t.fonts.body ?? "").toLowerCase() },
    schemes: t.schemes.slice(0, 4).map((s) => (s.background ?? "").toLowerCase()),
    motion: "",
    copy,
  }
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  if (!A.size && !B.size) return 1
  let both = 0
  for (const x of A) if (B.has(x)) both++
  return both / (A.size + B.size - both)
}

export interface Likeness {
  score: number
  sections: number
  order: number
  style: number
  look: number
  /** Null when either side has no words to compare. */
  copy: number | null
}

/** How alike two Materia sites are, 0 to 1, with each part. Copy is the share of `a`'s phrases that `b` also has. */
export function materiaLikeness(a: MateriaSignature, b: MateriaSignature): Likeness {
  const sections = jaccard(a.types, b.types)
  const order = orderSimilarity(a.types, b.types)
  const style = jaccard(a.styles, b.styles)
  const fonts = (a.fonts.heading && a.fonts.heading === b.fonts.heading ? 0.5 : 0) + (a.fonts.body && a.fonts.body === b.fonts.body ? 0.2 : 0)
  const look = fonts + 0.3 * jaccard(a.schemes.filter(Boolean), b.schemes.filter(Boolean))
  const copy = a.copy.length && b.copy.length ? a.copy.filter((h) => b.copy.includes(h)).length / a.copy.length : null
  const parts: [number, number][] = [[sections, 0.25], [order, 0.25], [style, 0.15], [look, 0.2], ...(copy === null ? [] : ([[copy, 0.15]] as [number, number][]))]
  const total = parts.reduce((s, [, w]) => s + w, 0)
  const score = parts.reduce((s, [v, w]) => s + v * w, 0) / total
  const r = (n: number) => Math.round(n * 1000) / 1000
  return { score: r(score), sections: r(sections), order: r(order), style: r(style), look: r(look), copy: copy === null ? null : r(copy) }
}

/** A new site from a template is its own above this: the template is its frame and vocabulary, never its output. */
export const TEMPLATE_LIKENESS_MAX = 0.5
/** Two sites for two businesses are alike above this. */
export const SIBLING_LIKENESS_MAX = 0.55
/** At most this share of the template's own words may be left on a site made from it (a menu label, a policy line). */
export const SAMPLE_COPY_MAX = 0.1

/**
 * FINISH on a site made from a Materia template: errors while it is too like that template, or still carries its
 * sample words (`samples`: the phrases the imported template held, recorded before the first turn).
 */
export function templateNoveltyIssues(input: { site: MateriaSignature; source: MateriaSignature; pages: { key: string; sections: PlacedLike[] }[]; samples: readonly string[]; templateName: string }): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const like = materiaLikeness(input.site, input.source)
  if (like.score > TEMPLATE_LIKENESS_MAX) {
    const same = [like.order >= 0.6 && "its section order", like.sections >= 0.6 && "its sections", like.look >= 0.6 && "its fonts and colours", like.style >= 0.5 && "its section layouts"].filter(Boolean)
    out.push({ severity: "error", code: "template.likeness", message: `The site is ${Math.round(like.score * 100)}% like the ${input.templateName} template it started from (${same.join(", ") || "overall"}). Compose home for this business with the site plan's sections and order, and give it its own type and schemes; the template is the frame, not the site.` })
  }
  const samples = new Set(input.samples)
  if (samples.size) {
    const left = copyPhrases(input.pages).filter((c) => samples.has(c.hash))
    const share = left.length / Math.max(1, samples.size)
    if (left.length && (share > SAMPLE_COPY_MAX || left.some((c) => c.page === "home"))) {
      const where = [...new Set(left.map((c) => `${c.page} › ${c.section} › ${c.setting}`))]
      out.push({ severity: "error", code: "template.sample_copy", message: `These still say the template's sample words: ${where.slice(0, 12).join("; ")}${where.length > 12 ? ` and ${where.length - 12} more` : ""}. Write each for this business, or clear it.` })
    }
  }
  return out
}
