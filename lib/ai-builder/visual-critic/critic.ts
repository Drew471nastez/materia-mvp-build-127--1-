import "server-only"

/**
 * ===========================================================================
 *  THE VISUAL CRITIC: DRAW, MEASURE, LOOK, LIST WHAT TO FIX
 * ===========================================================================
 * Spec 8.3, one round of it:
 *
 *   1. draw each page the agent made from the job's own draft (./document.ts)
 *   2. photograph it at 1440 and 390 with JavaScript off and measure it
 *      (./shoot.ts, ./measure.ts): the measurements are facts and the worst
 *      are hard gates
 *   3. a vision model reviews the photographs against the brief and concept
 *      (./review.ts): seven scores and a specific defect list
 *   4. one report: status said honestly, defects (gates first), scores, spend
 *
 * The loop (lib/ai-builder/agent/loop.ts) turns the report into repair work
 * and bounds the rounds. This module never writes anything to the site.
 *
 * HONEST BY CONSTRUCTION. No browser here, or it failed: "unverified", with
 * the reason, and no defects or scores (nothing was seen, so nothing passed).
 * A browser but no vision review (no model, the job's spending cap, a bad
 * answer twice): "measured", with the browser's facts only.
 *
 * MONEY. The review call's worst case (its text, its pictures and every
 * output token) must fit `maxUsd`, what the job has left, before it is made;
 * its real usage is returned for the job's spend.
 */
import { ZERO_USAGE } from "@/lib/sites/agent/types"
import { costOf, rateFor } from "@/lib/sites/agent/models"
import type { ModelRole, StoredPage } from "../agent/ports"
import type { RuntimeCapabilities } from "../runtime-contract"
import { composeDraftDocument } from "./document"
import { measuredDefects, mergeDefects } from "./measure"
import { browserAvailable, shootPages, type ShootOptions, type ShotPage, type ShotResult } from "./shoot"
import { MAX_REVIEW_ATTEMPTS, runReview, type ReviewPageInput } from "./review"
import { defectLine, weightedScore, type CriticReport, type Defect } from "./types"
import { blockIssues, emptyImageSlots } from "../agent/content-check"

/** At most this many pages are reviewed in one round (home first): the cost and the time stay bounded. */
export const MAX_CRITIC_PAGES = 3
/** Output tokens a review may write. */
export const REVIEW_MAX_OUTPUT = 4_000
/** What one picture costs as input, roughly (Anthropic: width x height / 750 at the 1568px long edge). */
const TOKENS_PER_IMAGE = 1_700
const OPUS = "claude-opus-5-5"

export interface CriticRequest {
  /** The creator's words. */
  brief: string
  /** The accepted concept, in words (describeConcept). */
  concept?: string
  /** The site's design rules / DESIGN.md, when the job has them. */
  rules?: string
  /** Page keys to review, most important first. */
  pages: string[]
  /** The job's own draft: nothing else is drawn. */
  project: { pages: StoredPage[]; settings: Record<string, unknown>; sources: Record<string, string>; capabilities: RuntimeCapabilities | null }
  /**
   * Round P (P5): whether the job can make or find pictures. True: a placed section's empty picture slot is a
   * hard gate (image-slot-empty). Empty item lists are a hard gate either way (empty-blocks).
   */
  picturesAvailable?: boolean
  /** What the job may still spend, USD. */
  maxUsd: number
  /** Everything (drawing and the review) inside this. */
  timeoutMs: number
}

export type VisualCriticRunner = ((request: CriticRequest) => Promise<CriticReport>) & {
  /** Whether a browser can draw here at all, asked before the review is announced. Absent: assume yes. */
  available?: () => { ok: true } | { ok: false; reason: string }
}

export interface CriticOptions {
  /** The vision model (the strong one, claude-opus-5-5 by default). Absent: measured only. */
  review?: ModelRole | null
  /** Whether a browser can start here (./shoot.ts browserAvailable). */
  available?: () => { ok: true } | { ok: false; reason: string }
  /** The drawing (./shoot.ts shootPages), swappable for tests. */
  shoot?: (pages: ShotPage[], opts: ShootOptions) => Promise<ShotResult | null>
  launch?: ShootOptions["launch"]
  /** Keep the newest first-screen photograph for the progress panel (private storage). Never throws into the review. */
  keepShot?: (jpegBase64: string, page: string) => Promise<boolean | void>
  now?: () => number
}

/** The most a review call can cost: its text and pictures as input, every output token, at the model's price (Opus's when unpriced). */
export function reviewWorstCaseUsd(model: string, textChars: number, images: number, maxOutput = REVIEW_MAX_OUTPUT): number {
  const priced = rateFor(model) ? model : OPUS
  return costOf(priced, { ...ZERO_USAGE, inputTokens: Math.ceil(textChars / 3) + images * TOKENS_PER_IMAGE, outputTokens: maxOutput }).usd
}

export function createVisualCritic(opts: CriticOptions = {}): VisualCriticRunner {
  const now = opts.now ?? Date.now
  const available = opts.available ?? browserAvailable
  const run: VisualCriticRunner = async (req) => {
    const t0 = now()
    const usage = { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0 }
    const pages = [...new Set(req.pages)].slice(0, MAX_CRITIC_PAGES)
    const unverified = (reason: string): CriticReport => ({ status: "unverified", reason, pages, defects: [], shots: [], usage, ms: now() - t0 })
    if (!pages.length) return unverified("there was no page to look at")

    const can = available()
    if (!can.ok) return unverified((can as { reason: string }).reason)

    /* 1. Drawn from the draft. */
    const docs: ShotPage[] = []
    const sectionsOf = new Map<string, { id: string; type: string }[]>()
    for (const page of pages) {
      const doc = composeDraftDocument({ page, pages: req.project.pages, settings: req.project.settings, sources: req.project.sources, capabilities: req.project.capabilities })
      if (!doc.drawn.length) continue
      docs.push({ page, html: doc.html })
      sectionsOf.set(page, doc.drawn)
    }
    if (!docs.length) return unverified("none of the pages could be drawn")

    /* 2. Photographed and measured, scripts off. Most of the time is the browser's; the review keeps what is left. */
    const shot = await (opts.shoot ?? shootPages)(docs, { timeoutMs: Math.max(15_000, Math.round(req.timeoutMs * 0.55)), ...(opts.launch ? { launch: opts.launch } : {}) })
    if (!shot) return unverified("the browser could not draw the pages")
    const measured = mergeDefects([...structuralDefects(req, docs.map((d) => d.page)), ...shot.measurements.flatMap((m) => [...measuredDefects(m.page, m.desktop), ...measuredDefects(m.page, m.mobile)])])
    const first = shot.shots[0]
    const kept = first?.desktopFold && opts.keepShot ? (await opts.keepShot(first.desktopFold, first.page).catch(() => false)) !== false : false

    const base: CriticReport = { status: "measured", pages: docs.map((d) => d.page), defects: measured.slice(0, 24), shots: shot.shots, usage, ms: 0, ...(kept ? { shotKept: true } : {}) }
    const done = (r: CriticReport): CriticReport => ({ ...r, ms: now() - t0 })

    /* 3. The vision review. */
    const role = opts.review
    if (!role) return done({ ...base, reason: "no vision model was available for the review" })
    const reviewPages: ReviewPageInput[] = shot.shots.map((s) => ({ page: s.page, sections: sectionsOf.get(s.page) ?? [], shots: s }))
    const images = reviewPages.reduce((n, p) => n + [p.shots.desktopFold, p.shots.desktopFull, p.shots.mobileFold, p.shots.mobileFull].filter(Boolean).length, 0)
    const textChars = 8_000 + (req.concept?.length ?? 0) + (req.rules?.length ?? 0) + req.brief.length
    const worst = reviewWorstCaseUsd(role.model, textChars, images)
    if (worst > req.maxUsd) return done({ ...base, reason: "the job's AI spending cap left no room for the design review" })
    const left = req.timeoutMs - (now() - t0)
    if (left < 20_000) return done({ ...base, reason: "there was no time left for the design review" })

    let review: Awaited<ReturnType<typeof runReview>>
    try {
      /* The repair retry is only made when its worst case still fits too. */
      const affordable = { provider: role.provider, model: role.model, maxOutputTokens: REVIEW_MAX_OUTPUT, ...(role.effort ? { effort: role.effort } : {}), signal: AbortSignal.timeout(Math.max(10_000, left)) }
      review = await runReview({ brief: req.brief, ...(req.concept ? { concept: req.concept } : {}), ...(req.rules ? { rules: req.rules } : {}), pages: reviewPages, measured: measured.map(defectLine) }, {
        ...affordable,
        ...(worst * MAX_REVIEW_ATTEMPTS > req.maxUsd ? { attempts: 1 } : {}),
      })
    } catch (thrown) {
      return done({ ...base, reason: `the design review failed (${thrown instanceof Error ? thrown.message.slice(0, 120) : "no answer"})` })
    }
    for (const u of review.usages) {
      usage.usd = Math.round((usage.usd + costOf(rateFor(role.model) ? role.model : OPUS, u).usd) * 1e6) / 1e6
      usage.inputTokens += u.inputTokens
      usage.outputTokens += u.outputTokens
      usage.calls += 1
    }
    if (!review.result) return done({ ...base, reason: review.error ?? "the design review gave no usable answer" })

    /* 4. Facts first, then the review's judgement, without saying the same thing twice. */
    const defects: Defect[] = [...measured]
    for (const d of review.result.defects) {
      if (defects.some((m) => m.page === d.page && m.sectionId && m.sectionId === d.sectionId && m.kind !== "review" && similar(m.what, d.what))) continue
      defects.push(d)
    }
    return done({ ...base, status: "reviewed", reason: undefined, defects: defects.slice(0, 24), scores: review.result.scores, weighted: weightedScore(review.result.scores), verdict: review.result.verdict })
  }
  run.available = available
  return run
}

/**
 * Round P (P5): what the draft's own data says for certain, before any picture is looked at. A placed section
 * whose item lists are too short or placeholders, and (when pictures can be made) a picture slot left empty, are
 * HARD GATES: they block finish like a sideways scroll does. Pure; the same rules as the agent's verify
 * (lib/ai-builder/agent/content-check.ts).
 */
export function structuralDefects(req: Pick<CriticRequest, "project" | "picturesAvailable">, pages: string[]): Defect[] {
  const only = new Set(pages)
  const placed = req.project.pages.filter((p) => only.has(p.key))
  const out: Defect[] = []
  for (const i of blockIssues({ pages: placed, sources: req.project.sources, caps: req.project.capabilities })) {
    const page = /^([^ ]+) ›/.exec(i.message)?.[1] ?? pages[0] ?? "home"
    out.push({ page, ...(i.sectionId ? { sectionId: i.sectionId } : {}), ...(i.path ? { sectionType: i.path.replace(/^sections\//, "").replace(/\.storelib$/, "") } : {}), severity: "high", kind: "empty-blocks", viewport: "both", what: i.message.replace(/^[^ ]+ › /, "").slice(0, 300), why: "A list with one item, or items that say nothing, reads as an unfinished site.", fix: "Fill the section's items with this site's real words (set_page_sections with its blocks).", gate: true, source: "measure" })
  }
  if (req.picturesAvailable) {
    for (const slot of emptyImageSlots({ pages: placed, sources: req.project.sources })) {
      out.push({ page: slot.page, sectionId: slot.sectionId, sectionType: slot.type, severity: "high", kind: "image-slot-empty", viewport: "both", what: `The picture "${slot.setting}"${slot.at === "section" ? "" : ` of item ${slot.at}`} is empty.`, why: "The design has a picture here; without it the section is a frame with nothing in it.", fix: "Make or find this business's picture (generate_image, find_photo, the creator's media) and set it.", gate: true, source: "measure" })
    }
  }
  return out
}

/** Two descriptions of the same fault share most of their longer words. */
function similar(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4))
  const wa = words(a)
  const wb = words(b)
  if (!wa.size || !wb.size) return false
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / Math.min(wa.size, wb.size) >= 0.6
}
