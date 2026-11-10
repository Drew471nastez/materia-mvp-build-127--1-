/**
 * ===========================================================================
 *  THE VISUAL CRITIC'S VOCABULARY (round O, O4)
 * ===========================================================================
 * The agent looks at the draft it made, in a real browser, and fixes what a
 * person would see first. These are the shapes that travel between the
 * pieces (lib/ai-builder/visual-critic/*) and into the agent loop:
 *
 *   CriticAxis     the seven axes of spec 8.2, each scored 1 to 5
 *   Defect         one specific problem: where (page, section, selector),
 *                  what, why it hurts, the fix in editable terms, and whether
 *                  it is a HARD GATE (blocks finish like a compile error)
 *   CriticReport   one review: the status said honestly ("reviewed" by the
 *                  vision model, "measured" with the browser only, or
 *                  "unverified" when no browser could draw the page), the
 *                  defects, the scores, the spend
 *
 * Pure types and constants; nothing here touches a browser or a model.
 */

/** Spec 8.2, in order, with the suggested weights (they add to 1). */
export const CRITIC_AXES = [
  { key: "identity", label: "Identity and originality", weight: 0.2 },
  { key: "composition", label: "Composition and visual hierarchy", weight: 0.2 },
  { key: "typography", label: "Typography and art direction", weight: 0.15 },
  { key: "offer", label: "Offer clarity and usability", weight: 0.15 },
  { key: "mobile", label: "Mobile quality", weight: 0.1 },
  { key: "motion", label: "Motion craft", weight: 0.1 },
  { key: "technical", label: "Technical and accessibility", weight: 0.1 },
] as const

export type CriticAxis = (typeof CRITIC_AXES)[number]["key"]
export type CriticScores = Record<CriticAxis, number>

/**
 * THE TARGET (spec 8.2: "at least a 4/5 ... for hierarchy and identity"). A
 * review under it earns ONE targeted repair pass; it never blocks finish by
 * itself, because a score is a judgement and not a fact.
 */
export const SCORE_TARGET = { weighted: 3.6, identity: 4, composition: 4 } as const

export type DefectSeverity = "critical" | "high" | "medium" | "low"
export const DEFECT_SEVERITIES: readonly DefectSeverity[] = ["critical", "high", "medium", "low"]

/** The deterministic measurements (./measure.ts), and "review" for the vision model's own findings. */
export type DefectKind =
  | "overflow"
  | "heading-wrap"
  | "tap-target"
  | "contrast"
  | "image-broken"
  | "image-missing"
  | "no-cta"
  | "dead-cta"
  | "placeholder-copy"
  /* Round P (P5): a drawn section with nothing in it; a placed section whose item lists are empty or placeholders; a picture slot with no picture. Hard gates. */
  | "empty-section"
  | "empty-blocks"
  | "image-slot-empty"
  | "review"

export interface Defect {
  severity: DefectSeverity
  kind: DefectKind
  /** The page key ("home", "about", "product"). */
  page: string
  /** The section instance id the problem is in, when it is in one. */
  sectionId?: string
  /** That section's type (its file is sections/<type>.storelib). */
  sectionType?: string
  /** A short CSS-ish pointer inside the section ("h1.hero__title", "a.btn"). */
  selector?: string
  viewport: "desktop" | "mobile" | "both"
  /** What is wrong, grounded in the screenshot or the measurement. */
  what: string
  /** Why it harms this site. */
  why: string
  /** The change, in editable terms (a prop, a token, a layout rule). */
  fix: string
  /**
   * A HARD GATE (spec 8.2: "safety/functionality checks are hard gates even
   * if their numeric weight is lower"): sideways scrolling on a phone, a dead
   * primary call to action, text that cannot be read. Blocks finish.
   */
  gate: boolean
  /** "measure" (the browser's numbers, a fact) or "review" (the vision model's judgement). */
  source: "measure" | "review"
}

/** One page drawn and measured: what the browser saw. */
export interface PageShots {
  page: string
  /** JPEG, base64. The first screen at 1440. */
  desktopFold?: string
  /** JPEG, base64: the whole page at 1440 (capped), laid out as a contact sheet. */
  desktopFull?: string
  /** JPEG, base64. The first screen at 390. */
  mobileFold?: string
  /** JPEG, base64: the whole page at 390 (capped), as a contact sheet. */
  mobileFull?: string
  /** CSS pixel heights as drawn (before the cap). */
  heights: { desktop: number; mobile: number }
  /** True when the page was taller than the cap and the bottom is not in the full shot. */
  cut: boolean
}

export type CriticStatus =
  /** Drawn in a browser, measured, and looked at by the vision model. */
  | "reviewed"
  /** Drawn and measured; the vision review could not be done (no model, budget, a bad answer twice). */
  | "measured"
  /** Not drawn at all: no browser here, or it failed. Never reported as a pass. */
  | "unverified"

export interface CriticReport {
  status: CriticStatus
  /** Why it is not "reviewed", in plain words, for the creator. */
  reason?: string
  pages: string[]
  defects: Defect[]
  scores?: CriticScores
  /** The weighted score (1 to 5) when the review ran. */
  weighted?: number
  /** The review's own one-line verdict, when it gave one. */
  verdict?: string
  shots: PageShots[]
  /** Model spend of this review, USD, and its tokens. */
  usage: { usd: number; inputTokens: number; outputTokens: number; calls: number }
  ms: number
  /** The first screen of the first page was kept for the progress panel (./storage.ts). */
  shotKept?: boolean
}

export function weightedScore(scores: CriticScores): number {
  let total = 0
  for (const a of CRITIC_AXES) total += (scores[a.key] ?? 0) * a.weight
  return Math.round(total * 100) / 100
}

/** Below the target: earns one targeted repair pass. */
export function belowTarget(scores: CriticScores | undefined): boolean {
  if (!scores) return false
  return weightedScore(scores) < SCORE_TARGET.weighted || scores.identity < SCORE_TARGET.identity || scores.composition < SCORE_TARGET.composition
}

/** One defect as one line the agent (or the summary) reads. */
export function defectLine(d: Defect): string {
  const where = [d.page, d.sectionType ? `section ${d.sectionType}${d.sectionId ? ` (${d.sectionId})` : ""}` : d.sectionId ? `section ${d.sectionId}` : "", d.selector ?? ""].filter(Boolean).join(" / ")
  const view = d.viewport === "both" ? "" : ` at ${d.viewport === "mobile" ? "390" : "1440"}px`
  return `[${d.severity}${d.gate ? ", must fix" : ""}] ${where}${view}: ${d.what} Why: ${d.why} Fix: ${d.fix}`
}
