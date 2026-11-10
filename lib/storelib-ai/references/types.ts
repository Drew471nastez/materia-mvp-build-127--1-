/**
 * ===========================================================================
 *  A DESIGN REFERENCE: ONE THING WORTH LOOKING AT, AND HOW TO USE IT
 * ===========================================================================
 * Round O (O1), docs: the design intelligence spec, Part 2.4. The knowledge
 * library (../library) says HOW to design; a reference shows a design worth
 * learning from: a page, a design system's tokens, a style, a principle.
 * The agent gets the two to four that fit its brief, never the whole set.
 *
 * Every record says where it came from and what Storelib may do with it:
 *
 *   rights.usage "analysis_only"  learn principles from it, never reproduce
 *                                 it (a screenshot of somebody's website, a
 *                                 token analysis of a real brand, Storelib's
 *                                 own descriptions of a pattern).
 *   rights.usage "reusable"       the text itself may be used (an MIT or
 *                                 Apache guidance record, notice kept).
 *
 * A brand named in `source.subject` is provenance only: referencesForPrompt
 * never tells the agent "make it like <brand>", and every record carries what
 * NOT to copy.
 *
 * `id` is immutable; a change to a record is a new `version`.
 *
 * Pure types and validation. Browser safe.
 */

export const REFERENCE_KINDS = ["site", "section", "system", "style", "principle"] as const
/**
 * site       a whole page or site composition (Storelib's seed records, admin screenshots)
 * section    one band of a page (a hero, a pricing table, a footer)
 * system     a design system's tokens and rules (DESIGN.md analyses)
 * style      a named visual direction (vocabulary)
 * principle  a rule of craft from an open-source guide
 */
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

/** What a reference is picked FOR (spec 2.6): mood and type, composition, a working part, motion. */
export const REFERENCE_ROLES = ["identity", "composition", "functional", "motion"] as const
export type ReferenceRole = (typeof REFERENCE_ROLES)[number]

export const REFERENCE_USAGES = ["analysis_only", "reusable"] as const
export type ReferenceUsage = (typeof REFERENCE_USAGES)[number]

export const REFERENCE_ORIGINS = ["storelib", "vendored", "admin-upload"] as const
export type ReferenceOrigin = (typeof REFERENCE_ORIGINS)[number]

export const DENSITIES = ["airy", "balanced", "compact", "unknown"] as const
export type ReferenceDensity = (typeof DENSITIES)[number]

/** Spec 2.4: what a still picture can prove. Motion from a screenshot is never "observed". */
export type Evidence = "observed" | "inferred" | "suggested" | "unknown"

export interface PaletteColor {
  /** What the colour does: "background", "text", "accent", "surface"... */
  role: string
  /** #rrggbb */
  hex: string
}

export interface DesignReference {
  /** Immutable. "ref_" + kebab words, e.g. ref_sport-performance-split. */
  id: string
  /** Starts at 1; any change to the record bumps it. */
  version: number
  kind: ReferenceKind
  /** A name for the pattern, never a brand ("Condensed sport type over a hard-cropped action photo"). */
  title: string
  /** Two or three sentences: what it is and why it works. */
  summary: string
  styleTags: string[]
  /** Business types it fits (lowercase words, "fitness", "music producer"). Empty = general. */
  industries: string[]
  /** Brand mood words ("disciplined", "warm", "playful"). */
  tone: string[]
  density: ReferenceDensity
  palette: {
    mode: "light" | "dark" | "mixed" | "unknown"
    colors: PaletteColor[]
    /** How colour is used, in a sentence. */
    strategy: string
  }
  type: {
    /** Category or a licensed face, never "the brand's custom font". */
    display: string
    body: string
    strategy: string
  }
  layout: {
    /** The page's shape ("asymmetric split hero, then a numbered offer ladder, then a booking band"). */
    topology: string
    hero: string
    grid: string
    rhythm: string
  }
  imagery: string
  motion: {
    character: string
    evidence: Evidence
    ideas: string[]
  }
  /** Small, specific details that make it feel made ("tabular figures in the price column"). */
  details: string[]
  /** Principles worth taking. */
  borrow: string[]
  /** What must not be copied, and what not to do with it. */
  avoid: string[]
  /** Business types or situations it fits badly. */
  fitsPoorly: string[]
  roles: ReferenceRole[]
  source: {
    origin: ReferenceOrigin
    /** Where it came from. For an admin upload this is a NOTE the admin typed; nothing ever fetches it. */
    url: string | null
    /** The brand or site analysed, provenance only; never sent to the agent as something to imitate. */
    subject: string | null
    creator: string | null
    capturedAt: string | null
  }
  rights: {
    usage: ReferenceUsage
    /** SPDX id for vendored text ("MIT", "Apache-2.0"), null for Storelib's own records and screenshots. */
    licence: string | null
    mayRedistribute: boolean
    /** The attribution or condition that travels with it. */
    notice: string | null
    permissionEvidence: string | null
  }
  provenance: {
    addedBy: "storelib" | "admin" | "build-script"
    /** ISO date. */
    addedAt: string
    /** Vendored: the repository, the commit and the file it was extracted from. */
    repo: string | null
    commit: string | null
    path: string | null
    /** The vision model that analysed an upload, null otherwise. */
    analysisModel: string | null
    verifiedByHuman: boolean
  }
  /** 1 to 5: how good an example it is. Retrieval prefers better ones. */
  quality: number
  /** Only admin uploads have one. The path is in the private bucket; it never leaves the server as a URL. */
  image: { path: string; mediaType: string; width: number | null; height: number | null; sha256: string } | null
  /** Disabled records are never retrieved. */
  enabled: boolean
}

/* ── validation ─────────────────────────────────────────────────────────── */

const ID_RE = /^ref_[a-z0-9]+(?:[-_][a-z0-9]+)*$/
const HEX_RE = /^#[0-9a-f]{6}$/i

export function isReferenceId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && ID_RE.test(value)
}

/** Every problem with a record, empty when it is valid. */
export function referenceProblems(r: DesignReference): string[] {
  const p: string[] = []
  const str = (v: unknown, name: string, max: number, required = true) => {
    if (typeof v !== "string") return p.push(`${name} is not text`)
    if (required && !v.trim()) p.push(`${name} is empty`)
    if (v.length > max) p.push(`${name} is longer than ${max}`)
  }
  const list = (v: unknown, name: string, max: number, itemMax = 240) => {
    if (!Array.isArray(v)) return p.push(`${name} is not a list`)
    if (v.length > max) p.push(`${name} has more than ${max}`)
    for (const x of v) if (typeof x !== "string" || !x.trim() || x.length > itemMax) p.push(`${name} has a bad item`)
  }
  if (!isReferenceId(r.id)) p.push(`id "${r.id}" is not ref_ kebab case`)
  if (!Number.isInteger(r.version) || r.version < 1) p.push("version must be a whole number from 1")
  if (!REFERENCE_KINDS.includes(r.kind)) p.push(`kind "${r.kind}" is unknown`)
  str(r.title, "title", 140)
  str(r.summary, "summary", 900)
  list(r.styleTags, "styleTags", 16, 60)
  list(r.industries, "industries", 16, 60)
  list(r.tone, "tone", 10, 40)
  if (!DENSITIES.includes(r.density)) p.push("density is unknown")
  if (!["light", "dark", "mixed", "unknown"].includes(r.palette?.mode)) p.push("palette.mode is unknown")
  if (!Array.isArray(r.palette?.colors) || r.palette.colors.length > 10) p.push("palette.colors must be a list of up to 10")
  else for (const c of r.palette.colors) if (!c || typeof c.role !== "string" || !HEX_RE.test(c.hex)) p.push(`palette colour ${JSON.stringify(c)} is not {role, #rrggbb}`)
  str(r.palette?.strategy, "palette.strategy", 400, false)
  str(r.type?.display, "type.display", 160, false)
  str(r.type?.body, "type.body", 160, false)
  str(r.type?.strategy, "type.strategy", 400, false)
  str(r.layout?.topology, "layout.topology", 500, false)
  str(r.layout?.hero, "layout.hero", 400, false)
  str(r.layout?.grid, "layout.grid", 300, false)
  str(r.layout?.rhythm, "layout.rhythm", 300, false)
  str(r.imagery, "imagery", 400, false)
  str(r.motion?.character, "motion.character", 400, false)
  if (!["observed", "inferred", "suggested", "unknown"].includes(r.motion?.evidence)) p.push("motion.evidence is unknown")
  list(r.motion?.ideas, "motion.ideas", 6)
  list(r.details, "details", 10)
  list(r.borrow, "borrow", 8, 320)
  list(r.avoid, "avoid", 8, 320)
  if (Array.isArray(r.avoid) && r.avoid.length === 0) p.push("avoid is empty: every reference says what not to copy")
  list(r.fitsPoorly, "fitsPoorly", 10)
  if (!Array.isArray(r.roles) || !r.roles.length || r.roles.some((x) => !REFERENCE_ROLES.includes(x))) p.push("roles must name at least one known role")
  if (!REFERENCE_ORIGINS.includes(r.source?.origin)) p.push("source.origin is unknown")
  if (!REFERENCE_USAGES.includes(r.rights?.usage)) p.push("rights.usage is unknown")
  if (typeof r.rights?.mayRedistribute !== "boolean") p.push("rights.mayRedistribute is missing")
  if (r.source?.origin === "vendored" && (!r.rights?.licence || !r.rights?.notice || !r.provenance?.repo || !r.provenance?.commit)) p.push("a vendored record needs its licence, notice, repo and commit")
  if (r.source?.origin === "admin-upload" && r.rights?.usage !== "analysis_only") p.push("an uploaded screenshot is analysis only")
  if (!r.provenance?.addedAt || !/^\d{4}-\d{2}-\d{2}/.test(r.provenance.addedAt)) p.push("provenance.addedAt is not a date")
  if (!Number.isInteger(r.quality) || r.quality < 1 || r.quality > 5) p.push("quality must be 1 to 5")
  if (typeof r.enabled !== "boolean") p.push("enabled is missing")
  if (r.motion?.evidence === "observed" && r.image && !r.source?.url) p.push("motion cannot be observed in a still screenshot")
  const text = JSON.stringify(r)
  if (/—/.test(text)) p.push("an em dash: use a colon, comma or full stop")
  return p
}

/**
 * The key two records share when they are the same reference under two ids:
 * the same uploaded picture, the same vendored file, or the same title.
 */
export function dedupKey(r: Pick<DesignReference, "title" | "image" | "provenance" | "source">): string {
  if (r.image?.sha256) return `img:${r.image.sha256}`
  if (r.provenance?.repo && r.provenance?.path) return `src:${r.provenance.repo}/${r.provenance.path}`
  return `title:${r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`
}
