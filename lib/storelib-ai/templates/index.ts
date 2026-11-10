/**
 * ===========================================================================
 *  THE TEMPLATE LIBRARY: TYPED STUB (round P, P5 side)
 * ===========================================================================
 * P2a owns lib/storelib-ai/templates/ (types, registry, choose, apply, the
 * templates). P5 builds the agent's template-first flow against it. THIS FILE
 * IS A STUB with P2a's signatures (as on branch p2a-templates, WIP):
 *
 *   chooseTemplate(brief, { choice, avoid, templates }) → TemplateChoice
 *   applyTemplate(store, template, brief, { jobId, choice }) → ApplyResult
 *   untouchedTemplateParts(template, project) → UntouchedParts
 *   templateById(id), SITE_TEMPLATES
 *
 * It has no templates, so chooseTemplate answers { template: null } and the
 * agent builds from zero as before. The integrator replaces this file with
 * P2a's index (export * from ./types, ./registry, ./choose, ./apply); the
 * agent reaches the library only through lib/ai-builder/agent/templates.ts
 * (defaultTemplates), the one adapter to adjust if a signature moved. The
 * functions here are small real implementations of the same rules so the
 * flow is tested end to end with a stub template.
 */
import type { SectionInstance } from "@/lib/website-builder/types"
import type { DesignTokens } from "@/lib/ai-builder/types"
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import type { DirectionChoice } from "@/lib/storelib-ai/direction/choose"
import type { ProjectStore, StoredPage } from "@/lib/ai-builder/agent/ports"

export interface ImageSlotTarget {
  page: string
  section: string
  block?: string
  setting: string
}

export interface TemplateImageSlot {
  key: string
  prompt: string
  aspect: string
  alt?: string
  style?: string
  targets: ImageSlotTarget[]
}

export interface TemplatePage {
  key: string
  title?: string
  sections: SectionInstance[]
  seo?: { title: string; description?: string }
}

/** P2a's SiteTemplate, the fields the agent reads (P2a's has more: summary, stories, keywords, menus, bindings, design...). */
export interface SiteTemplate {
  id: string
  name: string
  industries: string[]
  styles: string[]
  directionIds: string[]
  files: Record<string, string>
  pages: TemplatePage[]
  tokens: Partial<DesignTokens>
  imageSlots: TemplateImageSlot[]
}

export interface TemplateChoice {
  template: SiteTemplate | null
  score: number
  reasons: string[]
  alternates: { id: string; score: number }[]
}

type BriefLike = Pick<CreativeBrief, "prompt"> & Partial<CreativeBrief>

export interface ApplyOptions {
  jobId: string
  choice?: Pick<DirectionChoice, "palette" | "fonts" | "primary"> | null
  images?: Record<string, { url: string; alt?: string }>
  overwrite?: boolean
}

export interface ApplyResult {
  ok: boolean
  template: string
  files: string[]
  pages: string[]
  settings: string[]
  designMd: boolean
  images: { key: string; prompt: string; aspect: string }[]
  problems: string[]
  /** The adaptation work, for the agent's next turn. */
  next: string
}

export interface UntouchedParts {
  template: string
  /** Files still byte for byte the template's. */
  files: string[]
  /** Placed sections whose settings and blocks are still the template's. */
  sections: { page: string; id: string; type: string }[]
  homeIdentical: boolean
  home: { untouched: number; total: number }
  /** Image slots none of whose targets has a picture yet. */
  emptyImageSlots: string[]
}

/** The library. Empty in this stub. */
export const SITE_TEMPLATES: SiteTemplate[] = []

export function templateById(id: string, templates: readonly SiteTemplate[] = SITE_TEMPLATES): SiteTemplate | undefined {
  return templates.find((t) => t.id === id)
}

/** The closest template, by industry, direction and words; null below a minimum (the stub's list is empty). */
export function chooseTemplate(brief: BriefLike, opts: { choice?: Pick<DirectionChoice, "primary" | "secondary"> | null; avoid?: string[]; templates?: readonly SiteTemplate[] } = {}): TemplateChoice {
  const list = opts.templates ?? SITE_TEMPLATES
  const text = ` ${[brief.prompt, brief.business?.kind ?? "", brief.category ?? ""].join(" ").toLowerCase()} `
  const scored = list
    .map((t, i) => {
      let n = 0
      if (brief.business && t.industries.includes(brief.business.kind)) n += 5
      for (const w of t.industries) if (text.includes(w.toLowerCase())) n += 3
      if (opts.choice && t.directionIds.includes(opts.choice.primary.id)) n += 3
      if (opts.avoid?.includes(t.id)) n -= 2
      return { t, i, n }
    })
    .sort((a, b) => b.n - a.n || a.i - b.i)
  const best = scored[0]
  if (!best || best.n < 3) return { template: null, score: best?.n ?? 0, reasons: ["No template is close to this business: build from the brief."], alternates: [] }
  return { template: best.t, score: best.n, reasons: [`${best.t.name} fits.`], alternates: scored.slice(1, 3).map((x) => ({ id: x.t.id, score: x.n })) }
}

/** The template's files and pages into the install as drafts. Never throws: what failed is in `problems`. */
export async function applyTemplate(store: ProjectStore, template: SiteTemplate, _brief: CreativeBrief | null, opts: ApplyOptions): Promise<ApplyResult> {
  const problems: string[] = []
  const files: string[] = []
  for (const [path, text] of Object.entries(template.files)) {
    const existing = await store.readFile(path).catch(() => null)
    if (existing && existing.text === text) {
      files.push(path)
      continue
    }
    if (existing && !opts.overwrite) {
      problems.push(`${path} already exists with other text, so it was left as it is.`)
      continue
    }
    const w = await store.writeFile(path, text, { expectedVersion: null, author: "ai", jobId: opts.jobId }).catch((e: unknown) => ({ ok: false as const, error: String(e) }))
    if (w.ok === true) files.push(path)
    else problems.push(`${path} was not written: ${"error" in w ? w.error : "the store refused"}`)
  }
  await store.writePages(template.pages.map((p) => ({ key: p.key, sections: JSON.parse(JSON.stringify(p.sections)) as SectionInstance[] })))
  const images = template.imageSlots.map((s) => ({ key: s.key, prompt: s.prompt, aspect: s.aspect }))
  return { ok: problems.length === 0, template: template.id, files, pages: template.pages.map((p) => p.key), settings: [], designMd: false, images, problems, next: `The ${template.name} template is written as drafts. It is a starting point: nothing of it ships as it is.` }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const body = (sections: SectionInstance[]) => sections.filter((s) => s.group !== "header" && s.group !== "footer" && !s.hidden)
const copyOf = (s: SectionInstance) => ({ type: s.type, settings: s.settings ?? {}, blocks: (s.blocks ?? []).map((b) => ({ type: b.type, settings: b.settings ?? {} })) })

/** What of a site is still the template's own copy, and which picture slots are still empty. */
export function untouchedTemplateParts(template: SiteTemplate, project: { files: Record<string, string>; pages: StoredPage[] }): UntouchedParts {
  const files = Object.entries(template.files)
    .filter(([path, text]) => project.files[path] === text)
    .map(([path]) => path)
  const sections: UntouchedParts["sections"] = []
  for (const tp of template.pages) {
    const page = project.pages.find((p) => p.key === tp.key)
    if (!page) continue
    for (const ts of body(tp.sections)) {
      const now = page.sections.find((s) => s.id === ts.id)
      if (now && same(copyOf(now), copyOf(ts)) && project.files[`sections/${ts.type}.storelib`] === template.files[`sections/${ts.type}.storelib`]) sections.push({ page: tp.key, id: ts.id, type: ts.type })
    }
  }
  const tHome = body(template.pages.find((p) => p.key === "home")?.sections ?? [])
  const nowHome = body(project.pages.find((p) => p.key === "home")?.sections ?? [])
  const homeUntouched = tHome.filter((ts) => sections.some((x) => x.page === "home" && x.id === ts.id)).length
  const homeIdentical = tHome.length > 0 && nowHome.length === tHome.length && nowHome.every((s, i) => s.id === tHome[i].id) && homeUntouched === tHome.length
  const valueAt = (target: ImageSlotTarget): unknown => {
    const section = project.pages.find((p) => p.key === target.page)?.sections.find((s) => s.id === target.section)
    const holder = target.block ? section?.blocks?.find((b) => b.id === target.block) : section
    return holder?.settings?.[target.setting]
  }
  const emptyImageSlots = template.imageSlots.filter((slot) => slot.targets.every((t) => !valueAt(t))).map((s) => s.key)
  return { template: template.id, files, sections, homeIdentical, home: { untouched: homeUntouched, total: tHome.length }, emptyImageSlots }
}
