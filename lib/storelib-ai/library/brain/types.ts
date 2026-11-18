/**
 * ===========================================================================
 *  THE DESIGN BRAIN (round R, R1): THE FOUR LAYERS STORELIB LACKED
 * ===========================================================================
 * The knowledge library (../entries) says how to design in prose; the
 * reference library (../../references) shows designs worth learning from.
 * What was missing, and what a study of Loupe (docs/ai-builder/loupe-study.md)
 * showed is load bearing, is four structured layers between them:
 *
 *   technique  one concrete craft move with numbers (tracking by size, the
 *              measure, a crop rule, a rhythm rule)
 *   pattern    a section or layout composition, with when and when not, tied
 *              to O5's compositions (lib/storelib-ai/layout/grammar.ts) and to
 *              Storelib's REAL native sections (section-schemas ADDABLE_SECTIONS)
 *   recipe     a complete design system for one aesthetic: tokens in the
 *              DesignTokens shape, type pairing from the type library, spacing
 *              scale, surfaces, motion tier, image direction, section strategy
 *   standard   a usability, accessibility, conversion or content rule written
 *              as a checkable statement, with how it is checked
 *
 * Every record is versioned (`version` bumps on any change, `id` never
 * changes) and says where the idea came from (`provenance`). Records whose
 * idea was learned from Loupe say so (MIT, the commit read); the wording is
 * always Storelib's own and no third party site content, brand or asset is in
 * any record. tests/design-brain-r1.test.ts holds every record to this.
 *
 * Pure types and validation. No imports of big data.
 */

/** The brain's version: bumps when any record, the ranking or the block format changes. */
export const BRAIN_VERSION = "r1.2"

export const BRAIN_KINDS = ["technique", "pattern", "recipe", "standard"] as const
export type BrainKind = (typeof BRAIN_KINDS)[number]

/** Where an idea came from. The wording is always Storelib's. */
export interface BrainProvenance {
  /** "storelib": Storelib's own. "adapted": an idea learned from an open source project, restated. */
  origin: "storelib" | "adapted"
  inspiredBy: {
    project: string
    url: string
    /** SPDX id, read from the project's LICENSE at `commit`. */
    licence: string
    commit: string
    /** The file the idea was learned from. */
    path: string
  } | null
  /** ISO date. */
  addedAt: string
}

interface BrainBase {
  /** Immutable, "<kind prefix>_" + kebab words. */
  id: string
  version: number
  title: string
  /** One or two sentences, what it is and why. */
  summary: string
  tags: string[]
  /** Business kinds it is about (lib/storelib-ai/direction/brief.ts BUSINESS_KINDS). Empty = any business. */
  businesses: string[]
  /** Business kinds it fits badly. */
  fitsPoorly: string[]
  /** 1 to 5, a small prior in ranking. */
  quality: number
  provenance: BrainProvenance
}

export const TECHNIQUE_AREAS = ["type", "color", "image", "rhythm", "layout", "motion", "copy", "detail"] as const
export type TechniqueArea = (typeof TECHNIQUE_AREAS)[number]

export interface Technique extends BrainBase {
  kind: "technique"
  area: TechniqueArea
  /** The move, as an instruction with numbers. */
  rule: string
  /** Named values a component or token can take directly ("display-tracking": "-0.03em"). */
  values: Record<string, string>
  /** How to tell it was done. */
  check: string
}

export const PATTERN_ROLES = ["hero", "interior", "accent", "closer"] as const
export type PatternRole = (typeof PATTERN_ROLES)[number]

export interface Pattern extends BrainBase {
  kind: "pattern"
  role: PatternRole
  /** O5 compositions it realises (LAYOUT_COMPOSITIONS ids). */
  compositions: string[]
  /** Storelib native section types that build it (ADDABLE_SECTIONS), best first. */
  nativeSections: string[]
  when: string
  whenNot: string
  /** The two to four moves that make it this pattern and not a generic band. */
  moves: string[]
  mobile: string
  /** Real content it needs; without it the pattern is the wrong choice. */
  needs: string[]
}

export interface RecipePalette {
  mode: "light" | "dark"
  background: string
  surface: string
  text: string
  muted: string
  accent: string
  accentText: string
  border: string
  inverse: { background: string; text: string; accent: string }
}

export interface Recipe extends BrainBase {
  kind: "recipe"
  /** O2 art directions it realises (ART_DIRECTIONS ids), best first. */
  directions: string[]
  /** The type library system (TYPE_SYSTEMS id). Its families are the pairing. */
  typeSystem: string
  type: {
    /** Body size in px and the ratio each heading step grows by (DesignTokens.typeScale). */
    base: number
    ratio: number
    /** Display tracking, label tracking. */
    displayTracking: string
    labelTracking: string
    displayLineHeight: number
    bodyLineHeight: number
    /** How the two faces are used, in a sentence. */
    usage: string
  }
  palette: RecipePalette
  radius: { small: number; medium: number; large: number }
  /** DesignTokens.spacing: scale multiplier, section padding (px), page width (px), gutter (px). */
  spacing: { scale: number; sectionY: number; pageWidth: number; gutter: number }
  /** The spacing steps components use (px), from the 4 px grid. */
  steps: number[]
  shadow: "none" | "sm" | "md" | "lg"
  surfaces: string
  motionTier: "quiet" | "balanced" | "expressive"
  motion: string
  image: { direction: string; ratios: string[]; crop: string; treatment: string }
  /** Home page spine: pattern ids in order. */
  sections: string[]
  rhythm: string
  avoid: string[]
}

export const STANDARD_AREAS = ["usability", "accessibility", "conversion", "content", "performance", "composition"] as const
export type StandardArea = (typeof STANDARD_AREAS)[number]

export interface Standard extends BrainBase {
  kind: "standard"
  area: StandardArea
  /** A statement that is true or false of a page. */
  statement: string
  check: { by: "deterministic" | "review"; how: string }
  severity: "blocker" | "major" | "minor"
  /** Objectives it matters most for (book, buy, enquire, join, view-work, read, visit, listen); empty = all. */
  objectives: string[]
}

export type BrainRecord = Technique | Pattern | Recipe | Standard

const PREFIX: Record<BrainKind, string> = { technique: "tech_", pattern: "pat_", recipe: "rcp_", standard: "std_" }
const HEX = /^#[0-9a-f]{6}$/i

/** Every problem with a record, empty when it is valid. Cross references (directions, sections) are checked in the test. */
export function brainProblems(r: BrainRecord): string[] {
  const p: string[] = []
  const text = (v: unknown, name: string, max: number) => {
    if (typeof v !== "string" || !v.trim()) p.push(`${name} is empty`)
    else if (v.length > max) p.push(`${name} is longer than ${max}`)
  }
  const list = (v: unknown, name: string, min = 0) => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !x.trim())) p.push(`${name} is not a list of words`)
    else if (v.length < min) p.push(`${name} needs at least ${min}`)
  }
  if (!BRAIN_KINDS.includes(r.kind)) p.push(`kind ${r.kind} is unknown`)
  if (!new RegExp(`^${PREFIX[r.kind]}[a-z0-9]+(?:-[a-z0-9]+)*$`).test(r.id)) p.push(`id ${r.id} is not ${PREFIX[r.kind]}kebab`)
  if (!Number.isInteger(r.version) || r.version < 1) p.push("version must be a whole number from 1")
  text(r.title, "title", 90)
  text(r.summary, "summary", 360)
  list(r.tags, "tags", 2)
  list(r.businesses, "businesses")
  list(r.fitsPoorly, "fitsPoorly")
  if (!Number.isInteger(r.quality) || r.quality < 1 || r.quality > 5) p.push("quality must be 1 to 5")
  const pv = r.provenance
  if (!pv || !["storelib", "adapted"].includes(pv.origin)) p.push("provenance.origin is unknown")
  else if (pv.origin === "adapted" && (!pv.inspiredBy || !pv.inspiredBy.licence || !pv.inspiredBy.commit || !pv.inspiredBy.url || !pv.inspiredBy.path)) p.push("an adapted record names its source, licence, commit and file")
  else if (pv.origin === "storelib" && pv.inspiredBy) p.push("Storelib's own record has no inspiredBy")
  if (!pv?.addedAt || !/^\d{4}-\d{2}-\d{2}$/.test(pv.addedAt)) p.push("provenance.addedAt is not a date")
  if (r.kind === "technique") {
    if (!TECHNIQUE_AREAS.includes(r.area)) p.push("area is unknown")
    text(r.rule, "rule", 600)
    text(r.check, "check", 300)
    if (!r.values || typeof r.values !== "object") p.push("values missing")
  }
  if (r.kind === "pattern") {
    if (!PATTERN_ROLES.includes(r.role)) p.push("role is unknown")
    list(r.compositions, "compositions")
    list(r.nativeSections, "nativeSections", 1)
    text(r.when, "when", 300)
    text(r.whenNot, "whenNot", 300)
    list(r.moves, "moves", 2)
    text(r.mobile, "mobile", 300)
    list(r.needs, "needs")
  }
  if (r.kind === "recipe") {
    list(r.directions, "directions", 1)
    text(r.typeSystem, "typeSystem", 60)
    if (!(r.type.base >= 14 && r.type.base <= 22)) p.push("type.base must be 14 to 22 px")
    if (!(r.type.ratio >= 1.125 && r.type.ratio <= 1.75)) p.push("type.ratio must be 1.125 to 1.75")
    for (const k of ["background", "surface", "text", "muted", "accent", "accentText", "border"] as const) if (!HEX.test(r.palette[k])) p.push(`palette.${k} is not #rrggbb`)
    for (const k of ["background", "text", "accent"] as const) if (!HEX.test(r.palette.inverse[k])) p.push(`palette.inverse.${k} is not #rrggbb`)
    if (!(r.spacing.sectionY >= 48 && r.spacing.sectionY <= 240)) p.push("spacing.sectionY must be 48 to 240")
    if (!(r.spacing.pageWidth >= 960 && r.spacing.pageWidth <= 1920)) p.push("spacing.pageWidth must be 960 to 1920")
    if (!r.steps.length || r.steps.some((s) => s % 4 !== 0)) p.push("steps must sit on the 4 px grid")
    if (!["quiet", "balanced", "expressive"].includes(r.motionTier)) p.push("motionTier is unknown")
    list(r.sections, "sections", 6)
    list(r.avoid, "avoid", 2)
    text(r.image.direction, "image.direction", 400)
    list(r.image.ratios, "image.ratios", 1)
  }
  if (r.kind === "standard") {
    if (!STANDARD_AREAS.includes(r.area)) p.push("area is unknown")
    text(r.statement, "statement", 300)
    text(r.check?.how, "check.how", 300)
    if (!["deterministic", "review"].includes(r.check?.by)) p.push("check.by is unknown")
    if (!["blocker", "major", "minor"].includes(r.severity)) p.push("severity is unknown")
    list(r.objectives, "objectives")
  }
  if (/—|–/.test(JSON.stringify(r))) p.push("an em or en dash: use a colon, comma or full stop")
  return p
}
