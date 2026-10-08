/**
 * ===========================================================================
 *  WHAT THE ASSISTANT KNOWS ABOUT THIS WEBSITE BETWEEN MESSAGES
 * ===========================================================================
 * "Build me a bachata party site", then "make the events part more
 * aggressive and give it a countdown". The second message only means
 * something if the run knows which section the events part is, what the
 * site is going for and what was decided last time. The page alone says
 * which sections exist; it does not say that the dark band third from the
 * top is the events part, that the brand is Bandidos, or that the creator
 * said no gradients.
 *
 * Two halves, and only one of them is stored:
 *
 *   THE FACTS are read off the page on every request: sections, their ids,
 *   order, colour schemes, fonts, pictures in use. The page is the source of
 *   truth and is never second-guessed from memory.
 *
 *   THE MEMORY is what the page cannot say: the business and its audience,
 *   the direction and the palette that was chosen, what each section is FOR
 *   (its role), decisions and preferences, the last few changes, and a plan
 *   that ran out of time half built. It lives in the theme settings under
 *   `ai_brief`, so it is saved with the page by the Save button the creator
 *   already uses, follows the theme when it is duplicated or synced, and
 *   needs no new table. Unknown keys in theme settings are kept and read by
 *   nothing on a visitor's page (lib/website-builder/theme-settings-schema).
 *
 * Small on purpose: a few kilobytes, trimmed oldest first. It is a summary
 * the model reads in a few hundred tokens, never a transcript.
 *
 * Pure, browser safe: the loop writes it as an ordinary update_theme
 * operation, which the editor applies like any other.
 */

import type { ThemeState } from "./operations"
import { nameOf, type SchemaMap } from "./schemas"
import type { CreativePlan } from "./creative-plan"
import { plannedLabel } from "./creative-plan"
import type { Intent } from "./intent"

export const BRIEF_KEY = "ai_brief"
const MAX_BYTES = 8_000
const MAX_DECISIONS = 12
const MAX_RECENT = 6

export interface ProjectBrief {
  v: 1
  business?: string
  archetype?: string
  audience?: string
  personality?: string
  purpose?: string
  conversion?: string
  brand?: { name?: string; tagline?: string; logo?: string }
  palette?: { direction?: string; colors?: Record<string, string> }
  typography?: { heading?: string; body?: string }
  imagery?: string
  motion?: string
  /** What each section is for, by id: "events", "hero", "tickets". */
  roles?: Record<string, string>
  /** The last plan, with which of its sections are built. */
  plan?: { page: string; sections: { label: string; use: string; sectionId?: string }[] }
  /** Decisions and preferences worth keeping: "no gradients", "prices in euros". */
  decisions?: string[]
  /** The last few changes, newest last. */
  recent?: { request: string; kind: string; changed: string[] }[]
}

const clip = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : undefined)

/** The memory as it is stored, cleaned: anything malformed is dropped, never trusted. */
export function readBrief(settings: Record<string, unknown> | undefined | null): ProjectBrief {
  const raw = settings?.[BRIEF_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { v: 1 }
  const r = raw as Record<string, unknown>
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const strings = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => clip(x, max)).filter((x): x is string => !!x).slice(-n) : undefined)
  const roles: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj(r.roles))) {
    const role = clip(v, 60)
    if (role && /^[A-Za-z0-9_-]{1,128}$/.test(k)) roles[k] = role
  }
  const colors: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj(obj(r.palette).colors))) if (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v)) colors[k.slice(0, 32)] = v
  const plan = obj(r.plan)
  const planSections = Array.isArray(plan.sections)
    ? plan.sections
        .map((s) => obj(s))
        .map((s) => ({ label: clip(s.label, 60) ?? "", use: clip(s.use, 80) ?? "", ...(clip(s.sectionId, 128) ? { sectionId: clip(s.sectionId, 128) } : {}) }))
        .filter((s) => s.label && s.use)
        .slice(0, 14)
    : []
  const recent = Array.isArray(r.recent)
    ? r.recent
        .map((x) => obj(x))
        .map((x) => ({ request: clip(x.request, 160) ?? "", kind: clip(x.kind, 32) ?? "", changed: strings(x.changed, 8, 60) ?? [] }))
        .filter((x) => x.request)
        .slice(-MAX_RECENT)
    : undefined
  return {
    v: 1,
    business: clip(r.business, 200),
    archetype: clip(r.archetype, 40),
    audience: clip(r.audience, 240),
    personality: clip(r.personality, 120),
    purpose: clip(r.purpose, 240),
    conversion: clip(r.conversion, 160),
    brand: { name: clip(obj(r.brand).name, 80), tagline: clip(obj(r.brand).tagline, 160), logo: clip(obj(r.brand).logo, 200) },
    palette: { direction: clip(obj(r.palette).direction, 240), colors },
    typography: { heading: clip(obj(r.typography).heading, 60), body: clip(obj(r.typography).body, 60) },
    imagery: clip(r.imagery, 240),
    motion: clip(r.motion, 240),
    roles,
    ...(planSections.length ? { plan: { page: clip(plan.page, 64) ?? "home", sections: planSections } } : {}),
    decisions: strings(r.decisions, MAX_DECISIONS, 200),
    recent,
  }
}

/** Whether there is anything in it worth showing. */
export function briefIsEmpty(brief: ProjectBrief): boolean {
  return !brief.business && !brief.purpose && !brief.brand?.name && !Object.keys(brief.roles ?? {}).length && !(brief.decisions ?? []).length && !(brief.recent ?? []).length && !brief.plan
}

/** Drops undefined and empty values, so what is stored is only what is known. */
function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compact).filter((v) => v !== undefined) as unknown as T
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const c = compact(v)
      if (c === undefined || c === "" || (typeof c === "object" && c !== null && !Array.isArray(c) && Object.keys(c).length === 0)) continue
      out[k] = c
    }
    return out as T
  }
  return value
}

/** Trimmed to its size, oldest history first, so it can never grow without bound. */
export function sizedBrief(brief: ProjectBrief): ProjectBrief {
  let b = compact(brief)
  const size = () => JSON.stringify(b).length
  while (size() > MAX_BYTES && (b.recent?.length ?? 0) > 1) b = { ...b, recent: b.recent!.slice(1) }
  while (size() > MAX_BYTES && (b.decisions?.length ?? 0) > 2) b = { ...b, decisions: b.decisions!.slice(1) }
  if (size() > MAX_BYTES) b = { ...b, plan: undefined }
  return compact(b)
}

/** The plan, folded into memory: the direction it chose and what each section it built is for. */
export function withPlan(brief: ProjectBrief, plan: CreativePlan, page: string): ProjectBrief {
  return {
    ...brief,
    business: brief.business ?? (plan.brand.name || undefined),
    archetype: plan.archetype,
    audience: plan.audience || brief.audience,
    personality: plan.personality || brief.personality,
    purpose: plan.purpose || brief.purpose,
    conversion: plan.conversion || brief.conversion,
    brand: { ...brief.brand, ...compact(plan.brand) },
    palette: { direction: plan.palette.direction, colors: plan.palette.colors },
    typography: plan.typography,
    imagery: plan.imagery || brief.imagery,
    motion: plan.motion || brief.motion,
    plan: { page, sections: plan.sections.map((s) => ({ label: plannedLabel(s), use: s.use, ...(s.use.startsWith("keep:") ? { sectionId: s.use.slice(5) } : {}) })) },
  }
}

/**
 * The plan's sections matched to what is on the page now, in order: a kept
 * section by its id, a built-in one by the first unclaimed section of that
 * type the run added, one of the model's own by its type. What does not
 * match is still to build.
 */
export function matchPlan(
  sections: { use: string; sectionId?: string }[],
  state: ThemeState,
  added: Iterable<string>,
): (string | null)[] {
  const claimed = new Set<string>()
  const addedList = [...added]
  return sections.map((s) => {
    const visible = (id: string) => state.sections.some((x) => x.id === id && !x.hidden)
    if (s.use.startsWith("keep:")) {
      const id = s.use.slice(5)
      return visible(id) ? (claimed.add(id), id) : null
    }
    if (s.sectionId && visible(s.sectionId) && !claimed.has(s.sectionId)) {
      claimed.add(s.sectionId)
      return s.sectionId
    }
    const type = s.use.startsWith("new:") ? s.use.slice(4) : s.use
    const candidates = state.sections.filter((x) => x.type === type && !x.hidden && !claimed.has(x.id))
    const pick = candidates.find((x) => addedList.includes(x.id)) ?? (s.use.startsWith("new:") ? candidates[0] : undefined)
    if (!pick) return null
    claimed.add(pick.id)
    return pick.id
  })
}

export interface RunRecord {
  request: string
  intent: Intent
  /** Section names the run changed, as the chat shows them. */
  changed: string[]
  state: ThemeState
  added: Iterable<string>
  plan?: CreativePlan | null
  page: string
  schemas?: SchemaMap
  /** Notes the model asked to keep (the remember tool). */
  notes?: string[]
}

/**
 * The memory after a run: the plan folded in, roles for every section the
 * plan built or the run added, roles of sections no longer anywhere dropped,
 * the change appended. Returns null when nothing about it changed, so a run
 * that only answered a question does not write theme settings.
 */
export function updateBrief(before: ProjectBrief, run: RunRecord): ProjectBrief | null {
  if (run.changed.length === 0 && !(run.notes ?? []).length && !run.plan) return null
  let next: ProjectBrief = run.plan ? withPlan(before, run.plan, run.page) : { ...before }
  const roles: Record<string, string> = { ...(next.roles ?? {}) }

  if (next.plan) {
    const matched = matchPlan(next.plan.sections, run.state, run.added)
    next = { ...next, plan: { ...next.plan, sections: next.plan.sections.map((s, i) => (matched[i] ? { ...s, sectionId: matched[i]! } : { label: s.label, use: s.use })) } }
    next.plan!.sections.forEach((s) => {
      if (s.sectionId) roles[s.sectionId] = s.label
    })
  }
  for (const id of run.added) {
    const section = run.state.sections.find((s) => s.id === id)
    if (section && !roles[id]) roles[id] = nameOf(run.schemas, section.type)
  }
  /* Roles are kept only for sections on THIS page that still exist, plus other pages' (which this run cannot see). */
  const here = new Set(run.state.sections.map((s) => s.id))
  for (const id of Object.keys(roles)) {
    const knownElsewhere = !here.has(id) && !(before.roles ?? {})[id]
    if (knownElsewhere) delete roles[id]
  }
  for (const id of Object.keys(before.roles ?? {})) if (!here.has(id) && run.state.sections.length && wasOnThisPage(id, before)) delete roles[id]
  next.roles = roles
  next.decisions = [...(next.decisions ?? []), ...(run.notes ?? [])].slice(-MAX_DECISIONS)
  if (run.changed.length) {
    next.recent = [...(next.recent ?? []), { request: run.request.replace(/\s+/g, " ").slice(0, 160), kind: run.intent.kind, changed: run.changed.slice(0, 8) }].slice(-MAX_RECENT)
  }
  return sizedBrief(next)
}

/** A role recorded by a plan for this page is this page's: when the section is gone, so is the role. */
function wasOnThisPage(id: string, before: ProjectBrief): boolean {
  return !!before.plan?.sections.some((s) => s.sectionId === id)
}

/**
 * THE PROJECT STATE as the model reads it, beside the page listing: what the
 * page cannot say. Empty when nothing is known and the theme is untouched.
 */
export function describeProject(state: ThemeState, brief: ProjectBrief, schemas?: SchemaMap): string {
  const lines: string[] = []
  const brand = [brief.brand?.name, brief.brand?.tagline && `"${brief.brand.tagline}"`].filter(Boolean).join(", ")
  if (brand || brief.business) lines.push(`Business: ${[brief.business, brand].filter(Boolean).join(" / ")}`)
  if (brief.archetype || brief.purpose) lines.push(`What the site is: ${[brief.archetype, brief.purpose].filter(Boolean).join(". ")}`)
  if (brief.audience) lines.push(`For: ${brief.audience}`)
  if (brief.conversion) lines.push(`Built around: ${brief.conversion}`)
  if (brief.personality || brief.palette?.direction) lines.push(`Direction: ${[brief.personality, brief.palette?.direction].filter(Boolean).join(". ")}`)
  const s = state.settings
  const fonts = [s.font_heading && `headings ${s.font_heading}`, s.font_body && `body ${s.font_body}`].filter(Boolean).join(", ")
  if (fonts) lines.push(`Fonts now: ${fonts}`)
  if (brief.imagery) lines.push(`Imagery: ${brief.imagery}`)
  if (brief.motion) lines.push(`Motion: ${brief.motion}`)

  const schemes = new Map<string, number>()
  for (const sec of state.sections) {
    const key = typeof sec.settings?.color_scheme === "string" ? sec.settings.color_scheme : ""
    if (key) schemes.set(key, (schemes.get(key) ?? 0) + 1)
  }
  if (schemes.size) lines.push(`Colour schemes in use: ${[...schemes].map(([k, n]) => `${k} x${n}`).join(", ")}`)

  const roles = brief.roles ?? {}
  const roleLines = state.sections
    .filter((sec) => roles[sec.id])
    .map((sec) => `  [${sec.id}] is the ${roles[sec.id]} (${nameOf(schemas, sec.type)})`)
  if (roleLines.length) lines.push(`What each section is for:\n${roleLines.join("\n")}`)

  const pending = brief.plan?.sections.filter((p) => !p.sectionId || !state.sections.some((x) => x.id === p.sectionId)) ?? []
  if (brief.plan && pending.length && pending.length < brief.plan.sections.length) {
    lines.push(`The last plan is not finished. Still to build, in order: ${pending.map((p) => `${p.label} (${p.use})`).join(", ")}. "Continue" means build these.`)
  }
  if (brief.decisions?.length) lines.push(`Decisions and preferences to keep:\n${brief.decisions.map((d) => `  - ${d}`).join("\n")}`)
  if (brief.recent?.length) lines.push(`Recent changes, oldest first:\n${brief.recent.map((r) => `  - "${r.request}" changed ${r.changed.join(", ") || "nothing"}`).join("\n")}`)
  if (lines.length === 0) return ""
  return ["PROJECT STATE (what was decided before; the page above is the truth about what exists now):", ...lines].join("\n")
}

/** The settings write that stores the memory, or null when there is nothing new to store. */
export function briefOp(before: ProjectBrief, next: ProjectBrief | null): { kind: "update_theme"; settings: Record<string, unknown> } | null {
  if (!next) return null
  if (JSON.stringify(sizedBrief(before)) === JSON.stringify(next)) return null
  return { kind: "update_theme", settings: { [BRIEF_KEY]: next } }
}
