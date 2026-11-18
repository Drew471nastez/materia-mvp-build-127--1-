/**
 * ===========================================================================
 *  THE NATIVE ENGINE: A WHOLE SITE AS STORELIB SECTIONS, IN ONE CALL
 * ===========================================================================
 * Round R (R2), after OpenPage's api/generate.ts (docs/ai-builder/
 * openpage-study.md): one planning and composition call returns the whole
 * website as JSON (theme tokens and every page's sections with their
 * settings and blocks), which is then validated (./validate.ts) and placed
 * through the classic job's own build (../job.ts). What we took from
 * OpenPage, and what we did differently:
 *
 *   one call, JSON out        a strict tool built from the registry
 *                             (./schema.ts), not "return only JSON" text;
 *   a block catalogue         Storelib's real sections, generated from their
 *                             schemas (./registry.ts), not a second set;
 *   validate, fall back       validate, then REPAIR: the exact issues are
 *                             sent back (1-2 times), the best answer kept,
 *                             and what is still invalid is taken out, never
 *                             silently replaced by a template;
 *   a timeout                 per call, and inside the job's own deadline.
 *
 * The design inputs are R1's design brain (designBrainFor(brief): a short
 * versioned block and structured hints), O2's direction and the site's
 * DESIGN.md when there is one, and the creator's real store data. Prompts
 * are versioned (NATIVE_PROMPT_VERSION) and recorded on the job.
 */
import { surfaceRules } from "@/lib/storelib-ai/surfaces"
import { DESIGN_STANDARD } from "@/lib/storelib-ai/design-rules"
import type { SiteFingerprint } from "@/lib/ai-builder/novelty"
import { describeCapabilities } from "../capabilities"
import type { DesignTokens } from "@/lib/ai-builder/types"
import { extractJson } from "../../agent/creative-plan"
import { unavailableBecause } from "../../agent/site-plan"
import { addSpend, callOnce, NO_SPEND, type ModelRef, type Spend } from "../models"
import { describeRegistry, NATIVE_REGISTRY_VERSION } from "./registry"
import { nativeTool, NATIVE_TOOL } from "./schema"
import { placeable, siteLinks, validateNativeSite } from "./validate"
import { NATIVE_LIMITS, type NativeContext, type NativeIssue, type NativeMapping, type NativeSite } from "./types"

export const NATIVE_PROMPT_VERSION = "native-r56"
/** Repair turns after the first answer, at most. */
export const NATIVE_MAX_REPAIRS = 2
export const NATIVE_CALL_TIMEOUT_MS = 170_000
export const NATIVE_MAX_OUTPUT_TOKENS = 32_000
/** A repair is not started with less time than this left before the job hands over. */
export const NATIVE_MIN_REPAIR_MS = 60_000
/** Issues quoted back in one repair turn, at most. */
const MAX_ISSUES_SENT = 40

/** One step of the brain's home strategy: a pattern and the native section types that realise it, best first. */
export interface BrainStep {
  title: string
  role: string
  nativeSections: string[]
}

export interface BrainHints {
  recipeId: string
  /** R1's DesignTokens (lib/ai-builder/types.ts), when the hints carry them whole. */
  tokens: DesignTokens | null
  typePairing: { display: string; body: string } | null
  spacing: string
  sectionStrategy: BrainStep[]
  rhythm: string
  motionTier: string
  imageDirection: string
}

const isTokens = (t: unknown): t is DesignTokens => {
  const o = t as DesignTokens | null
  return !!o && typeof o === "object" && !!o.colors && typeof o.colors.background === "string" && !!o.fonts && typeof o.fonts.heading === "string" && !!o.radius && !!o.spacing && !!o.motion
}

/**
 * R1's hints (lib/storelib-ai/library/brain designBrainFor), read defensively: anything of another shape is left out,
 * never thrown on. Pure.
 */
export function readBrainHints(raw: unknown): BrainHints | null {
  if (!raw || typeof raw !== "object") return null
  const h = raw as Record<string, unknown>
  const s = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : "")
  const tp = h.typePairing && typeof h.typePairing === "object" ? (h.typePairing as Record<string, unknown>) : null
  const ss = h.sectionStrategy && typeof h.sectionStrategy === "object" ? (h.sectionStrategy as Record<string, unknown>) : null
  const steps: BrainStep[] = (Array.isArray(ss?.home) ? (ss!.home as unknown[]) : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .slice(0, 16)
    .map((x) => ({ title: s(x.title, 80), role: s(x.role, 40), nativeSections: Array.isArray(x.nativeSections) ? x.nativeSections.filter((t): t is string => typeof t === "string").slice(0, 8) : [] }))
  const sp = h.spacing && typeof h.spacing === "object" ? (h.spacing as Record<string, unknown>) : null
  const img = h.imageDirection && typeof h.imageDirection === "object" ? (h.imageDirection as Record<string, unknown>) : null
  return {
    recipeId: s(h.recipeId),
    tokens: isTokens(h.tokens) ? (JSON.parse(JSON.stringify(h.tokens)) as DesignTokens) : null,
    typePairing: tp ? { display: s(tp.display ?? tp.heading), body: s(tp.body) } : null,
    spacing: sp ? [typeof sp.sectionY === "number" ? `section padding about ${sp.sectionY}px` : "", typeof sp.pageWidth === "number" ? `page width ${sp.pageWidth}px` : ""].filter(Boolean).join(", ") : s(h.spacing),
    sectionStrategy: steps,
    rhythm: s(ss?.rhythm, 200),
    motionTier: s(h.motionTier),
    imageDirection: img ? s(img.direction, 300) : s(h.imageDirection, 300),
  }
}

/** The brain's home strategy as a starting plan: each step with the offered native types that realise it. Pure. */
export function strategyPlan(hints: BrainHints | null, offered: string[]): { title: string; role: string; types: string[] }[] {
  if (!hints) return []
  const ok = new Set(offered)
  return hints.sectionStrategy.map((st) => ({ title: st.title, role: st.role, types: st.nativeSections.filter((t) => ok.has(t)) })).filter((st) => st.types.length > 0)
}

export interface NativeGenerateInput {
  /** The creator's words with their choices (job.ts jobBrief). */
  request: string
  ctx: NativeContext
  /** R1's designBrainFor(brief), or null. */
  brain?: { version?: unknown; block?: unknown; hints?: unknown } | null
  /** O2's direction for this brief, as prompt text (directionForPrompt). */
  direction?: string | null
  /** The site's DESIGN.md, when it has one. */
  designMd?: string | null
  /** Types offered; default: every registry type possible for this creator. */
  types?: string[]
  /** Round 56: the platform's most recent sites' fingerprints, named in the prompt so this one steers clear of them. */
  recent?: SiteFingerprint[]
}

export interface NativeGenerateDeps {
  model: ModelRef
  signal?: AbortSignal
  /** The job's hand-over time (ms since the epoch): no repair starts too close to it. */
  deadline?: number
  now?: () => number
  timeoutMs?: number
  maxRepairs?: number
}

export interface NativeResult {
  site: NativeSite
  /** What was still wrong in the kept answer (its values were taken out). */
  issues: NativeIssue[]
  mapped: NativeMapping[]
  notes: string[]
  attempts: number
  spend: Spend
  promptVersion: string
  brainVersion: string | null
}

export class NativeGenerationError extends Error {
  constructor(message: string, readonly spend: Spend = NO_SPEND) {
    super(message)
    this.name = "NativeGenerationError"
  }
}

/** The registry types this creator's site may use. */
export function offeredTypes(ctx: NativeContext): string[] {
  return Object.keys(ctx.registry.sections).filter((t) => !unavailableBecause(t, ctx.caps))
}

export const NATIVE_RULES = `You are the creative director and the writer of a small, excellent web studio, composing a whole website from Storelib's own sections in one answer. Every section you place is a real section of the site builder: the creator edits every word, setting and item afterwards in the same editor, so use the sections exactly as the library describes them.

HOW TO ANSWER
- Call ${NATIVE_TOOL} once with the whole site. Settings and block settings are [{id, value}] pairs using ONLY the ids in the library line for that type, values as text.
- A choice setting takes one of its listed values exactly. A range takes a number inside its range. A link takes one of the SITE LINKS exactly. A [product] takes a product's address from STORE FACTS, a [product_list] its ids joined by commas, a [collection] a collection id, a [form] one of the FORMS. An [image] takes one of the CREATOR'S PICTURES, or leave it out and brief the picture in "images" (it is found or made after).
- Pages: "home" first with 6 to 12 sections (as many as this business's story needs; cut a filler before adding one), then two to five more pages with 3 to 6 sections each. Never a product, shop, cart, search, account or blog page: the store draws those. The header and footer are the site's frame, never in a page's list.
- Sections with blocks get their blocks filled with real content: as many as the content really has, at least two, about as many as the library line says to aim for.
- Theme: a design preset as the tested base, then its palette (all seven colours, or every one "" to keep the preset's), two fonts the theme loads, and a few Theme settings. Follow the DESIGN BRAIN and ART DIRECTION below; the colours asked for in the request win.
- Compose it: no two neighbouring sections of the same kind; colour bands (scheme) where the story turns, not in a fixed light, alt, dark rotation; one clear main action repeated where it helps. The SECTION IDEAS and the art direction are starting material: where they disagree with what would make this site better, decide.

THE WORDS
- Specific to this business: its craft, its place, its people, what it actually sells. A line that would fit any business is wrong.
- Headings 2 to 8 words, said the way a person would say them; supporting lines one or two sentences.
- No hype words, no em dashes. Buttons say what happens ("Book a free session"), never "Learn more".
- No placeholders and no instructions to the creator ("Add your photo"): write the real words or leave a field out.

NEVER INVENT
- No product, price, discount, review, testimonial, quote, customer, person's name, award, press mention or statistic that is not in STORE FACTS or the request. Testimonial and team sections are filled from real data by the builder: give them a heading only.
- Links only from SITE LINKS; bindings only to the ids given.`

function storeBlock(ctx: NativeContext, pagesHint: string): string {
  const links = [...siteLinks([], ctx)]
  return [
    `STORE FACTS\n${describeCapabilities(ctx.caps)}`,
    `SITE LINKS (a link takes one of these exactly, or a page you make: ${pagesHint})\n${links.length ? links.map((l) => `  ${l}`).join("\n") : "  (no store pages yet)"}`,
    ctx.forms.length ? `FORMS (a [form] takes the address)\n${ctx.forms.slice(0, 12).map((f) => `  ${f.url}  ${f.name.slice(0, 80)}`).join("\n")}` : "FORMS: none, so no native_form section.",
    ctx.images.length ? `CREATOR'S PICTURES (an [image] may take one of these addresses)\n${ctx.images.slice(0, 24).map((i) => `  ${i.url}  ${i.alt.slice(0, 80)}`).join("\n")}` : "CREATOR'S PICTURES: none yet; brief every picture in \"images\".",
  ].join("\n\n")
}

/** The system text: the rules, the design rules every Storelib AI carries, the library and the theme tokens. */
export function nativeSystem(ctx: NativeContext, types: string[]): string {
  const t = ctx.registry.theme
  return [
    `${NATIVE_RULES}`,
    DESIGN_STANDARD,
    surfaceRules("classic"),
    `THE LIBRARY (${NATIVE_REGISTRY_VERSION}): type: name. what it is | settings | blocks\n${describeRegistry(ctx.registry, types)}`,
    `THEME TOKENS\n- presets: ${t.presets.map((p) => `${p.id} (${p.mood.slice(0, 3).join(", ")})`).join("; ")}\n- palette keys: ${t.palette.join(", ")}\n- theme settings: ${t.settings.map((s) => (s.values ? `${s.id}(${s.values.join("|")})` : `${s.id}(${s.min ?? ""}-${s.max ?? ""})`)).join(" ")}\n- fonts: any listed in the tool's font enums`,
  ].join("\n\n")
}

/** The user turn: the request and everything that shapes this site. */
export function nativeTurn(input: NativeGenerateInput, offered: string[] = Object.keys(input.ctx.registry.sections)): string {
  const hints = readBrainHints(input.brain?.hints)
  const brainBlock = typeof input.brain?.block === "string" ? input.brain.block.slice(0, 4000) : ""
  const plan = strategyPlan(hints, offered)
  const strategy = plan.length
    ? `SECTION IDEAS for the home page (ingredients, not an order or a quota: choose the ones this site needs, order them for this visitor, pick whichever listed type suits the content, and add what only this business would have):\n${plan.map((st) => `  - ${st.title} (${st.role}): ${st.types.join(" or ")}`).join("\n")}${hints?.rhythm ? `\nRhythm: ${hints.rhythm}` : ""}`
    : ""
  const recent = recentBlock(input.recent ?? [])
  const t = hints?.tokens
  const tokens = t ? `TOKENS (applied to Theme settings after you answer; your palette and fonts, when you give them, win): background ${t.colors.background}, surface ${t.colors.surface}, text ${t.colors.text}, accent ${t.colors.accent} with ${t.colors.accentText} on it, border ${t.colors.border}${t.colors.inverse ? `, contrast band ${t.colors.inverse.background}` : ""}; corners ${t.radius.small}/${t.radius.medium}px; motion ${t.motion.tier ?? t.motion.level}.` : ""
  const type = hints?.typePairing?.display ? `Type pairing: ${hints.typePairing.display} / ${hints.typePairing.body}.` : ""
  return [
    `THE REQUEST\n${input.request.trim().slice(0, 4000)}`,
    brainBlock || hints ? `DESIGN BRAIN${typeof input.brain?.version === "string" ? ` (${input.brain.version})` : ""}\n${[brainBlock, strategy, tokens, type, hints?.spacing ? `Spacing: ${hints.spacing}.` : "", hints?.motionTier ? `Motion: ${hints.motionTier}.` : "", hints?.imageDirection ? `Imagery: ${hints.imageDirection}.` : ""].filter(Boolean).join("\n")}` : "",
    input.direction ? `ART DIRECTION\n${input.direction.slice(0, 6000)}` : "",
    input.designMd ? `THE SITE'S DESIGN.md (its design contract; follow its tokens and rules)\n${input.designMd.slice(0, 5000)}` : "",
    recent,
    storeBlock(input.ctx, "/<its key>"),
  ]
    .filter(Boolean)
    .join("\n\n")
}

/**
 * Round 56: the structure of the platform's last few sites, so this one does not repeat it (the agent engine's novelty
 * pressure, for the native engine). Section roles, hero shape, palette and type buckets only: nothing of another
 * creator's content. Pure.
 */
export function recentBlock(recent: SiteFingerprint[]): string {
  const list = recent.slice(0, 5)
  if (!list.length) return ""
  return `RECENT SITES ON THIS PLATFORM (other businesses; do not make a near copy of their structure)\n${list.map((f) => `  - opens ${f.hero.replace(/^builtin:/, "with ")}; home ${f.order.slice(0, 9).join(", ")}; palette ${f.palette}; type ${f.type}`).join("\n")}\nKeep what this business needs, and make the opening, the order and the palette surface its own.`
}

function repairTurn(base: string, previous: string, issues: NativeIssue[]): string {
  return `${base}\n\nYOUR PREVIOUS ANSWER\n${previous.slice(0, 60_000)}\n\nIT CANNOT BE USED AS IT IS. Fix exactly these (path: problem):\n${issues
    .slice(0, MAX_ISSUES_SENT)
    .map((i) => `- ${i.path || "(the answer)"}: ${i.message}`)
    .join("\n")}${issues.length > MAX_ISSUES_SENT ? `\n- ...and ${issues.length - MAX_ISSUES_SENT} more of the same kinds` : ""}\nCall ${NATIVE_TOOL} again with the WHOLE site, fixed, keeping everything that was right.`
}

/**
 * The site: one composition call, then up to NATIVE_MAX_REPAIRS repair turns
 * while the validator finds issues and there is time. Keeps the answer with
 * the fewest issues among the placeable ones. Throws NativeGenerationError
 * when no answer can be placed at all (the job then plans the classic way).
 */
export async function generateNativeSite(input: NativeGenerateInput, deps: NativeGenerateDeps): Promise<NativeResult> {
  const now = deps.now ?? Date.now
  const types = (input.types ?? offeredTypes(input.ctx)).filter((t) => input.ctx.registry.sections[t])
  if (!types.length) throw new NativeGenerationError("no section type is possible for this site")
  const tool = nativeTool(input.ctx.registry, types)
  const system = nativeSystem(input.ctx, types)
  const base = nativeTurn(input, types)
  const maxRepairs = Math.max(0, Math.min(NATIVE_MAX_REPAIRS, deps.maxRepairs ?? NATIVE_MAX_REPAIRS))
  const timeoutMs = deps.timeoutMs ?? NATIVE_CALL_TIMEOUT_MS
  let spend: Spend = NO_SPEND
  let best: (ReturnType<typeof validateNativeSite> & { attempt: number }) | null = null
  let user = base
  let attempts = 0
  let lastError = ""
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    /* A call is only started with time for a real answer before the job hands over, and is cut at the hand-over. */
    const left = deps.deadline ? deps.deadline - now() - 5_000 : Infinity
    if (attempt > 0 && left < NATIVE_MIN_REPAIR_MS) break
    const callTimeout = Math.max(1, Math.min(timeoutMs, left))
    attempts++
    let text = ""
    let issuesBefore: { path: string; message: string }[] = []
    try {
      const r = await callOnce(deps.model, { system, user, tools: [tool], maxOutputTokens: NATIVE_MAX_OUTPUT_TOKENS, timeoutMs: callTimeout, signal: deps.signal })
      spend = addSpend(spend, deps.model.model, r.usage)
      const call = r.toolCalls.find((c) => c.name === NATIVE_TOOL)
      text = call ? call.argumentsJson : r.text
      if (r.stop === "length") issuesBefore = [{ path: "", message: "the answer was cut off at the length limit; write shorter copy and fewer blocks so the whole site fits" }]
      if (r.stop === "refusal") throw new NativeGenerationError("the model declined", spend)
    } catch (e) {
      if (e instanceof NativeGenerationError) throw e
      if (deps.signal?.aborted) throw new NativeGenerationError("cancelled", spend)
      lastError = e instanceof Error ? e.message.slice(0, 160) : "the call failed"
      continue
    }
    if (text.length > NATIVE_LIMITS.maxOutputChars) {
      issuesBefore.push({ path: "", message: `the answer is ${text.length} characters, the most is ${NATIVE_LIMITS.maxOutputChars}; write less` })
      text = text.slice(0, NATIVE_LIMITS.maxOutputChars)
    }
    let raw: unknown = null
    try {
      raw = JSON.parse(text)
    } catch {
      raw = extractJson(text)
    }
    const checked = validateNativeSite(raw, input.ctx)
    const issues = [...issuesBefore, ...checked.issues]
    const current = { ...checked, issues, attempt }
    if (placeable(checked.site) && (!best || issues.length <= best.issues.length)) best = current
    if (!issues.length) break
    user = repairTurn(base, text, issues)
  }
  if (!best) throw new NativeGenerationError(lastError ? `no usable answer (${lastError})` : "no usable answer", spend)
  return {
    site: { ...best.site, version: `${NATIVE_PROMPT_VERSION}/${input.ctx.registry.version}` },
    issues: best.issues,
    mapped: best.mapped,
    notes: best.notes,
    attempts,
    spend,
    promptVersion: NATIVE_PROMPT_VERSION,
    brainVersion: typeof input.brain?.version === "string" ? input.brain.version : null,
  }
}
