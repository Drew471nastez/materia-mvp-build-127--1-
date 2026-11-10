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
