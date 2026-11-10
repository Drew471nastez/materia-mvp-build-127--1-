/**
 * ===========================================================================
 *  THE NATIVE DRAFT, LOOKED AT AND REFINED (round R, R3)
 * ===========================================================================
 * Round O's critic (lib/ai-builder/visual-critic) looks at a page the agent
 * coded. This looks at a page built from Storelib's NATIVE sections (the
 * classic engine, R2's JSON engine) and fixes what it finds with small typed
 * patches to the draft's data (./patch.ts), not by building it again:
 *
 *   1. DRAW each page the way the live site draws it (a NativeRenderer:
 *      ./render-remote.ts on the server, ./render-local.tsx in Node), as one
 *      static document with no script (./document.ts)
 *   2. PHOTOGRAPH AND MEASURE it at 1440 and 390 with JavaScript off
 *      (visual-critic/shoot.ts), with the extended checks Loupe's pre-gate
 *      and reviewer make (visual-critic/measure.ts extendedDefects) and the
 *      ones the data alone answers (./checks.ts)
 *   3. FIX: each defect becomes the smallest patch on its section's own
 *      settings (./fixes.ts); patches are validated against the schema and
 *      applied as the editor's operations, saved, and the page is drawn
 *      again to see that they worked
 *   4. JUDGE, ONCE, after the hard gates: a vision model looks at the
 *      photographs (the same review as round O, visual-critic/review.ts) and
 *      may answer with patches too, validated the same way
 *
 * BOUNDED. At most MAX_REVIEW_ROUNDS rounds of patches; at most one vision
 * call (and its one repair); a time limit over everything; the call is made
 * only when its worst case fits what the job may still spend, and its real
 * cost is returned for the job's spend.
 *
 * LOUPE'S RULES, ADOPTED: deterministic checks before the judge (no model is
 * paid to say the page scrolls sideways); the judge sees the browser's
 * numbers as ground truth; a round that made the page WORSE is reverted, not
 * kept; no progress, stop.
 *
 * HONEST. "reviewed" only when the vision model looked; "measured" when the
 * browser did and the model did not (no model, no budget, no usable answer);
 * "unverified" when no browser could draw the page. Never a pass by default.
 */
import { ZERO_USAGE, type AgentTurn } from "@/lib/sites/agent/types"
import { costOf, rateFor } from "@/lib/sites/agent/models"
import { measuredDefects, mergeDefects, type KnownLinks } from "@/lib/ai-builder/visual-critic/measure"
import { REVIEW_SYSTEM, readReview, reviewMessage, extractJson, type ReviewPageInput } from "@/lib/ai-builder/visual-critic/review"
import { reviewWorstCaseUsd, REVIEW_MAX_OUTPUT } from "@/lib/ai-builder/visual-critic/critic"
import { defectLine, weightedScore, type CriticScores, type CriticStatus, type Defect } from "@/lib/ai-builder/visual-critic/types"
import type { ShootOptions, ShotPage, ShotResult } from "@/lib/ai-builder/visual-critic/shoot"
import type { SchemaMap } from "../../agent/schemas"
import type { SchemaField } from "../../types"
import type { ModelRef } from "../models"
import type { PageOp, SiteState } from "../apply"
import { applyPatches, schemaLookup, type FieldLookup, type NativePatch } from "./patch"
import { planFixes } from "./fixes"
import { structuralDefects } from "./checks"
import { REVIEW_STATUS_WORDS, type ReviewPhase } from "./words"

/** Draws the named pages of a draft as the live site does, each as a critic's document. Null: it could not. */
export type NativeRenderer = (site: SiteState, pages: string[]) => Promise<ShotPage[] | null>

export { REVIEW_PHASE_WORDS, REVIEW_STATUS_WORDS, type ReviewPhase } from "./words"

/** Rounds of patches at most: a review refines, it does not redo. */
export const MAX_REVIEW_ROUNDS = 2
/** Pages drawn at most (home first). */
export const MAX_REVIEW_PAGES = 3

export interface NativeReviewRequest {
  site: SiteState
  /** Page keys, most important first. */
  pages: string[]
  /** The creator's words, for the vision review. */
  brief: string
  /** The site's design rules, when the job has them. */
  rules?: string
  /** Where the site's main action goes and what it says. */
  primaryAction?: { label: string; href: string }
  /** What links are judged against (./checks.ts knownLinks). */
  known?: KnownLinks | null
  /** What the job may still spend on the vision review, USD. */
  maxUsd: number
  /** Everything inside this. */
  timeoutMs: number
}

export interface NativeReviewDeps {
  render: NativeRenderer
  /** visual-critic/shoot.ts shootPages, or a test's. */
  shoot: (pages: ShotPage[], opts: ShootOptions) => Promise<ShotResult | null>
  launch?: ShootOptions["launch"]
  /** Whether a browser can start here. */
  available?: () => { ok: true } | { ok: false; reason: string }
  /** Saves the draft after a round of patches (the job's SiteIO.write). The remote renderer draws what was saved. */
  write?: (site: SiteState, pages: string[], settings: boolean) => Promise<void>
  /** The vision model. Absent: measured only. */
  vision?: ModelRef | null
  schemas?: SchemaMap
  /** R2's registry, when it is there; the schema map otherwise. */
  lookup?: FieldLookup
  progress?: (phase: ReviewPhase) => Promise<void> | void
  now?: () => number
}

export interface NativeReviewResult {
  status: CriticStatus
  /** The status in the creator's words. */
  label: string
  reason?: string
  pages: string[]
  /** Rounds of patches applied and kept. */
  rounds: number
  /** The draft after the review (unchanged when nothing was kept). */
  site: SiteState
  /** The editor's operations the kept patches became, for the job's log. */
  ops: PageOp[]
  applied: NativePatch[]
  refused: { patch: NativePatch; reason: string }[]
  /** Patches applied, then taken back because the page measured worse. */
  reverted: NativePatch[]
  /** What the first look found. */
  found: Defect[]
  /** What is still wrong after the last look (measured facts, then the review's judgement). */
  remaining: Defect[]
  scores?: CriticScores
  weighted?: number
  verdict?: string
  usage: { usd: number; inputTokens: number; outputTokens: number; calls: number }
  /** True when every page was drawn with the page's own scripts off (proved by the browser). */
  jsDisabled: boolean
  /** The first screen of the first page at 1440, JPEG base64, for the progress panel. */
  firstShot?: string
  /** The vision model, when one was called (its spend is in `usage`). */
  model?: string
  ms: number
}

const OPUS = "claude-opus-5-5"
const SEVERITY_WEIGHT = { critical: 8, high: 4, medium: 2, low: 1 }

/** How bad a set of defects is: gates dominate, then severity. */
export function defectScore(list: Defect[]): number {
  return list.reduce((n, d) => n + (d.gate ? 100 : 0) + SEVERITY_WEIGHT[d.severity], 0)
}

/* ── the vision review, with patches ─────────────────────────────────── */

const PATCHABLE = new Set(["text", "textarea", "select", "radio", "range", "number", "toggle", "checkbox", "color", "color_scheme", "link", "url", "image", "image_picker", "alignment"])

function fieldLine(f: SchemaField, v: unknown): string {
  const opts = f.options?.length ? `{${f.options.map((o) => String((o as { value: unknown }).value)).slice(0, 8).join("|")}}` : typeof f.min === "number" ? `(${f.min}..${f.max})` : ""
  const now = v === undefined ? "" : `=${JSON.stringify(v).slice(0, 40)}`
  return `${f.id}:${f.type}${opts}${now}`
}

/** The sections on the reviewed pages and the settings a patch may change, compact, for the model. */
export function editableSummary(site: SiteState, pages: string[], schemas: SchemaMap | undefined, max = 7_000): string {
  const lines: string[] = []
  for (const page of pages) {
    for (const s of site.pages[page] ?? []) {
      if (s.hidden) continue
      const fields = (schemas?.[s.type]?.fields ?? []).filter((f) => PATCHABLE.has(f.type)).slice(0, 24)
      lines.push(`${page} / ${s.id} (${s.type}): ${fields.map((f) => fieldLine(f, s.settings?.[f.id])).join(" ")}`)
      for (const b of (s.blocks ?? []).slice(0, 8)) {
        const bf = (schemas?.[s.type]?.blocks?.find((x) => x.type === b.type)?.fields ?? []).filter((f) => PATCHABLE.has(f.type)).slice(0, 10)
        lines.push(`  block ${b.id} (${b.type}): ${bf.map((f) => fieldLine(f, b.settings?.[f.id])).join(" ")}`)
      }
    }
  }
  const text = lines.join("\n")
  return text.length > max ? `${text.slice(0, max)}\n(cut)` : text
}

export const NATIVE_PATCH_RULES = `THIS SITE IS BUILT FROM STORELIB'S NATIVE SECTIONS: every change is a value in a section's settings, a block, a section's place or whether it is shown. You do not write code. With your JSON object, add "patches": a list of at most 10 changes that fix the defects you OBSERVED, each one of:
{"op":"set","path":"/pages/<page>/sections/<section id>/settings/<key>","value":<a value the setting allows>}
{"op":"set","path":"/pages/<page>/sections/<section id>/blocks/<block id>/settings/<key>","value":...}
{"op":"set","path":"/pages/<page>/sections/<section id>/hidden","value":true}
{"op":"remove","path":"/pages/<page>/sections/<section id>/settings/<key>"}   (back to its default)
{"op":"remove","path":"/pages/<page>/sections/<section id>/blocks/<block id>"}
{"op":"reorder","path":"/pages/<page>/sections/<section id>","to":<index on the page>}
Use only the sections, keys, options and ranges listed under THE EDITABLE SETTINGS. Never invent words, prices, reviews or numbers; never remove the header or the footer. A patch that does not fit is refused. No patch is better than a wrong one.`

function nativeReviewText(input: Parameters<typeof reviewMessage>[0], summary: string): { text: string; images: ReturnType<typeof reviewMessage>["images"] } {
  const m = reviewMessage(input)
  return { text: `${m.text.replace(/\n\nReview it now\. Answer with the JSON object only\.$/, "")}\n\nTHE EDITABLE SETTINGS (page / section id (type): key:type{options}(range)=current):\n${summary}\n\nReview it now. Answer with the JSON object only, with "patches".`, images: m.images }
}

async function visionReview(
  req: NativeReviewRequest,
  deps: NativeReviewDeps,
  site: SiteState,
  pages: ReviewPageInput[],
  measured: Defect[],
  maxUsd: number,
  timeoutMs: number,
): Promise<{ ok: true; defects: Defect[]; patches: NativePatch[]; scores: CriticScores; verdict: string; usages: (typeof ZERO_USAGE)[] } | { ok: false; reason: string; usages: (typeof ZERO_USAGE)[] }> {
  const role = deps.vision!
  const summary = editableSummary(site, pages.map((p) => p.page), deps.schemas)
  const message = nativeReviewText({ brief: req.brief, ...(req.rules ? { rules: req.rules } : {}), pages, measured: measured.map(defectLine) }, summary)
  const system = `${REVIEW_SYSTEM}\n\n${NATIVE_PATCH_RULES}`
  const worst = reviewWorstCaseUsd(role.model, message.text.length + system.length, message.images.length)
  if (worst > maxUsd) return { ok: false, reason: "the job's AI spending cap left no room for the design review", usages: [] }
  const attempts = worst * 2 <= maxUsd ? 2 : 1
  const turns: AgentTurn[] = [{ role: "user", content: message.text, images: message.images }]
  const usages: (typeof ZERO_USAGE)[] = []
  let error = ""
  for (let i = 0; i < attempts; i++) {
    let turn
    try {
      turn = await role.provider.complete({ model: role.model, system, turns, tools: [], maxOutputTokens: REVIEW_MAX_OUTPUT, ...(role.effort ? { effort: role.effort } : {}), signal: AbortSignal.timeout(Math.max(10_000, timeoutMs)) })
    } catch (thrown) {
      return { ok: false, reason: `the design review failed (${thrown instanceof Error ? thrown.message.slice(0, 120) : "no answer"})`, usages }
    }
    usages.push(turn.usage)
    if (turn.stop === "refusal") return { ok: false, reason: "the reviewer declined", usages }
    let raw: unknown = null
    try {
      raw = extractJson(turn.text)
    } catch (e) {
      error = e instanceof Error ? e.message : "not JSON"
    }
    if (raw !== null) {
      const read = readReview(raw, pages)
      if (read.ok) {
        const list = (raw as { patches?: unknown }).patches
        const patches = (Array.isArray(list) ? list : []).filter((p): p is NativePatch => !!p && typeof p === "object" && typeof (p as { path?: unknown }).path === "string").slice(0, 10)
        return { ok: true, defects: read.review.defects, patches: patches.map((p) => ({ ...p, why: `review: ${String((p as { why?: unknown }).why ?? "").slice(0, 160)}` })), scores: read.review.scores, verdict: read.review.verdict, usages }
      }
      error = (read as { error: string }).error
    }
    turns.push({ role: "assistant", content: turn.text.slice(0, 6_000), toolCalls: [] })
    turns.push({ role: "user", content: `That answer could not be used: ${error}. Answer again with ONLY the JSON object in the shape given, every score a number from 1 to 5, with "patches".` })
  }
  return { ok: false, reason: `the review answer could not be used (${error})`, usages }
}

/* ── the loop ─────────────────────────────────────────────────────────── */

function touched(ops: PageOp[]): { pages: string[]; settings: boolean } {
  const pages = new Set<string>()
  let settings = false
  for (const o of ops) {
    if (o.op.kind === "update_theme") settings = true
    else pages.add(o.page)
  }
  return { pages: [...pages], settings }
}

export async function reviewNativeDraft(req: NativeReviewRequest, deps: NativeReviewDeps): Promise<NativeReviewResult> {
  const now = deps.now ?? Date.now
  const t0 = now()
  const pages = [...new Set(req.pages)].filter((p) => req.site.pages[p]).slice(0, MAX_REVIEW_PAGES)
  const lookup = deps.lookup ?? schemaLookup(deps.schemas)
  const usage = { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0 }
  let site = req.site
  const ops: PageOp[] = []
  const applied: NativePatch[] = []
  const refused: NativeReviewResult["refused"] = []
  const reverted: NativePatch[] = []
  let jsDisabled = true
  let firstShot: string | undefined
  const result = (status: CriticStatus, extra: Partial<NativeReviewResult>): NativeReviewResult => ({
    status,
    label: REVIEW_STATUS_WORDS[status],
    pages,
    rounds: 0,
    site,
    ops,
    applied,
    refused,
    reverted,
    found: [],
    remaining: [],
    usage,
    jsDisabled,
    ...(firstShot ? { firstShot } : {}),
    ...(usage.calls && deps.vision ? { model: deps.vision.model } : {}),
    ...extra,
    ms: now() - t0,
  })
  if (!pages.length) return result("unverified", { reason: "there was no page to look at" })
  const can = (deps.available ?? (() => ({ ok: true as const })))()
  if (!can.ok) return result("unverified", { reason: (can as { reason: string }).reason })

  const left = () => req.timeoutMs - (now() - t0)
  const look = async (draft: SiteState) => {
    if (left() < 8_000) return null
    const docs = await deps.render(draft, pages).catch((e: unknown) => {
      console.warn("[ai-site] native review: the pages could not be drawn:", e instanceof Error ? e.message.slice(0, 200) : e)
      return null
    })
    if (!docs?.length) return null
    const shot = await deps.shoot(docs, { timeoutMs: Math.max(8_000, Math.min(60_000, Math.round(left() * 0.5))), ...(deps.launch ? { launch: deps.launch } : {}) })
    if (!shot) return null
    if (!shot.jsDisabled) jsDisabled = false
    const measured = shot.measurements.flatMap((m) => [...measuredDefects(m.page, m.desktop, { extended: true, known: req.known ?? null }), ...measuredDefects(m.page, m.mobile, { extended: true, known: req.known ?? null })])
    const defects = mergeDefects([...structuralDefects(draft, docs.map((d) => d.page), (t) => deps.schemas?.[t]?.name ?? t.replace(/_/g, " ")), ...measured])
    return { shot, defects, drawn: docs.map((d) => d.page) }
  }

  await deps.progress?.("checking")
  let current = await look(site)
  if (!current) return result("unverified", { reason: "the browser could not draw the pages" })
  firstShot = current.shot.shots[0]?.desktopFold
  const found = current.defects
  let rounds = 0
  let reviewed: { scores: CriticScores; verdict: string; defects: Defect[] } | null = null
  let reviewReason = deps.vision ? "" : "no vision model was available for the review"

  for (let round = 0; round < MAX_REVIEW_ROUNDS; round++) {
    const plan = planFixes(current.defects, { site, schemas: deps.schemas, ...(req.primaryAction ? { primaryAction: req.primaryAction } : {}) })
    let patches = plan.patches
    /* Loupe's pre-gate: the judge is asked only once no hard gate is left that a patch here can fix. */
    const gatesToFix = plan.fixes.some((f) => f.defect.gate)
    if (!reviewed && deps.vision && !gatesToFix && !reviewReason) {
      if (left() < 25_000) reviewReason = "there was no time left for the design review"
      else {
        await deps.progress?.("reviewing")
        const pagesIn: ReviewPageInput[] = current.shot.shots.map((s) => ({ page: s.page, sections: (site.pages[s.page] ?? []).filter((x) => !x.hidden).map((x) => ({ id: x.id, type: x.type })), shots: s }))
        const r = await visionReview(req, deps, site, pagesIn, current.defects, req.maxUsd - usage.usd, left() - 15_000)
        for (const u of r.usages) {
          usage.usd = Math.round((usage.usd + costOf(rateFor(deps.vision.model) ? deps.vision.model : OPUS, u).usd) * 1e6) / 1e6
          usage.inputTokens += u.inputTokens
          usage.outputTokens += u.outputTokens
          usage.calls += 1
        }
        if (r.ok) {
          reviewed = { scores: r.scores, verdict: r.verdict, defects: r.defects.filter((d) => !current!.defects.some((m) => m.sectionId && m.sectionId === d.sectionId && m.kind !== "review" && m.what === d.what)) }
          const taken = new Set(patches.map((p) => p.path))
          patches = [...patches, ...r.patches.filter((p) => !taken.has(p.path))]
        } else reviewReason = (r as { reason: string }).reason
      }
    }
    if (!patches.length) break
    await deps.progress?.("fixing")
    const out = applyPatches(site, patches, lookup, deps.schemas)
    refused.push(...out.refused)
    if (!out.applied.length) break
    const where = touched(out.ops)
    try {
      await deps.write?.(out.site, where.pages, where.settings)
    } catch {
      refused.push(...out.applied.map((patch) => ({ patch, reason: "the draft could not be saved" })))
      break
    }
    await deps.progress?.("rechecking")
    const next = await look(out.site)
    rounds++
    /* Not verified, or worse: taken back (Loupe's no-regression rule), the draft as it was saved again. */
    if (!next || defectScore(next.defects) > defectScore(current.defects)) {
      reverted.push(...out.applied)
      await deps.write?.(site, where.pages, where.settings).catch(() => undefined)
      break
    }
    site = out.site
    ops.push(...out.ops)
    applied.push(...out.applied)
    const before = defectScore(current.defects)
    current = next
    /* No progress, stop. */
    if (defectScore(next.defects) >= before && !reviewed) break
  }

  const remaining = [...current.defects, ...(reviewed?.defects ?? [])]
  if (reviewed) {
    return result("reviewed", { rounds, found, remaining, scores: reviewed.scores, weighted: weightedScore(reviewed.scores), verdict: reviewed.verdict, pages: current.drawn })
  }
  return result("measured", { rounds, found, remaining, reason: reviewReason || "no vision review was made", pages: current.drawn })
}
