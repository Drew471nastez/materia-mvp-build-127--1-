/**
 * ===========================================================================
 *  THE TEMPLATE LIBRARY: TYPED STUB (round P, P5 side)
 * ===========================================================================
 * P2a owns lib/storelib-ai/templates/ (the framework and the templates). P5
 * builds the agent's template-first flow against the names the round fixed:
 *
 *   SiteTemplate                 { id, name, industries, styles, directionIds,
 *                                  files, pages, tokens, imageSlots }
 *   chooseTemplate(brief)        the closest template, or null
 *   applyTemplate(store, t, b)   its files, pages and tokens into the install
 *   untouchedTemplateParts(p, t) copy and imagery still exactly as shipped
 *
 * THIS FILE IS A STUB: it has no templates, so chooseTemplate answers null and
 * the agent builds from zero as before. The integrator replaces it with P2a's
 * module; the agent (lib/ai-builder/agent/loop.ts) reaches it only through
 * AgentDeps.templates (ports.ts TemplateLibrary), so the adapter is one place.
 * applyTemplate and untouchedTemplateParts are written for real here (they are
 * small and pure over the store) so the flow is tested end to end with a stub
 * template (tests/ai-agent-quality-p5.test.ts).
 */
import type { SectionInstance } from "@/lib/website-builder/types"
import type { DesignTokens } from "@/lib/ai-builder/types"
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"

export interface TemplateImageSlot {
  /** "<page>/<section id>/<setting id>" or "<page>/<section id>/<block id>/<setting id>". */
  key: string
  /** What the picture shows, for generate_image / find_photo. */
  prompt: string
  /** "16:9", "4:5", "1:1"... */
  aspect: string
}

export interface TemplatePage {
  key: string
  sections: SectionInstance[]
}

export interface SiteTemplate {
  id: string
  name: string
  industries: string[]
  styles: string[]
  directionIds: string[]
  /** sections/ai_*.storelib (and blocks/, snippets/) with full schemas and FILLED preset blocks. */
  files: Record<string, string>
  pages: TemplatePage[]
  tokens: Partial<DesignTokens>
  imageSlots: TemplateImageSlot[]
}

/** What chooseTemplate reads: the job's creative brief (O2), and the direction chosen for it when there is one. */
export type TemplateBrief = Pick<CreativeBrief, "prompt"> & Partial<CreativeBrief> & { directionId?: string | null }

/** The store the template is written into: the agent's ProjectStore (lib/ai-builder/agent/ports.ts) satisfies it. */
export interface TemplateStore {
  listFiles(): Promise<{ path: string; text: string }[]>
  writeFile(path: string, text: string, meta: { expectedVersion: string | null; author: "ai"; jobId: string }): Promise<{ ok: boolean }>
  listPages(): Promise<TemplatePage[]>
  writePages(pages: TemplatePage[]): Promise<void>
  readSettings(): Promise<Record<string, unknown>>
  writeSettings(patch: Record<string, unknown>): Promise<void>
}

export interface AppliedTemplate {
  ok: boolean
  templateId: string
  files: string[]
  pages: string[]
  error?: string
}

/** Parts of the site still exactly as the template shipped them. */
export interface UntouchedParts {
  /** Where the words are the template's own: "sections/ai_x.storelib" (a file never adapted) or "home › ai_x [id]". */
  copy: string[]
  /** Image slot keys whose picture is still the template's (or still empty). */
  images: string[]
}

/** The library. Empty in this stub. */
export const SITE_TEMPLATES: SiteTemplate[] = []

/** The closest template for this brief, or null (the stub has none). */
export function chooseTemplate(brief: TemplateBrief, templates: readonly SiteTemplate[] = SITE_TEMPLATES): SiteTemplate | null {
  if (!templates.length) return null
  const kind = String(brief.business?.kind ?? brief.category ?? "").toLowerCase()
  const words = `${brief.prompt} ${kind}`.toLowerCase()
  let best: SiteTemplate | null = null
  let bestScore = -1
  for (const t of templates) {
    let score = 0
    for (const i of t.industries) if (words.includes(i.toLowerCase())) score += 3
    if (brief.directionId && t.directionIds.includes(brief.directionId)) score += 2
    for (const s of t.styles) if (words.includes(s.toLowerCase())) score += 1
    if (score > bestScore) {
      best = t
      bestScore = score
    }
  }
  return best
}

export function templateById(id: string, templates: readonly SiteTemplate[] = SITE_TEMPLATES): SiteTemplate | null {
  return templates.find((t) => t.id === id) ?? null
}

/** The template's files, pages and tokens into the install (drafts, authored "ai"). Pages of the install not in the template are left alone. */
export async function applyTemplate(store: TemplateStore, template: SiteTemplate, _brief: TemplateBrief, meta: { jobId: string } = { jobId: "template" }): Promise<AppliedTemplate> {
  const have = new Set((await store.listFiles()).map((f) => f.path))
  const files: string[] = []
  for (const [path, text] of Object.entries(template.files)) {
    if (have.has(path)) continue
    const r = await store.writeFile(path, text, { expectedVersion: null, author: "ai", jobId: meta.jobId })
    if (!r.ok) return { ok: false, templateId: template.id, files, pages: [], error: `${path} could not be written` }
    files.push(path)
  }
  await store.writePages(template.pages.map((p) => ({ key: p.key, sections: JSON.parse(JSON.stringify(p.sections)) as SectionInstance[] })))
  return { ok: true, templateId: template.id, files, pages: template.pages.map((p) => p.key) }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Words of a section instance: its settings and blocks without picture values, as compared with the template's. */
function wordsOf(s: { settings?: Record<string, unknown>; blocks?: { settings?: Record<string, unknown> }[] }): string {
  const strip = (o: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === "string" && !/^(https?:|\/|shopify:|storelib:)/.test(v)))
  return JSON.stringify([strip(s.settings), (s.blocks ?? []).map((b) => strip(b.settings))])
}

function slotValue(pages: TemplatePage[], key: string): unknown {
  const [page, sectionId, a, b] = key.split("/")
  const s = pages.find((p) => p.key === page)?.sections.find((x) => x.id === sectionId)
  if (!s) return undefined
  if (b === undefined) return s.settings?.[a]
  return s.blocks?.find((x) => x.id === a)?.settings?.[b]
}

/**
 * What of the template the site still ships verbatim: a component file never changed, a placed section whose
 * words are the template's, an image slot whose picture is the template's own (or still empty).
 */
export function untouchedTemplateParts(project: { files: Record<string, string>; pages: TemplatePage[] }, template: SiteTemplate): UntouchedParts {
  const copy: string[] = []
  for (const [path, text] of Object.entries(template.files)) {
    if (!path.startsWith("sections/")) continue
    const type = path.replace(/^sections\//, "").replace(/\.storelib$/, "")
    const placed = project.pages.some((p) => p.sections.some((s) => s.type === type && !s.hidden))
    if (placed && project.files[path] === text) copy.push(path)
  }
  for (const tp of template.pages) {
    const page = project.pages.find((p) => p.key === tp.key)
    if (!page) continue
    for (const ts of tp.sections) {
      const s = page.sections.find((x) => x.id === ts.id && x.type === ts.type && !x.hidden)
      if (s && wordsOf(s) === wordsOf(ts) && wordsOf(ts) !== JSON.stringify([{}, []])) copy.push(`${tp.key} › ${ts.type} [${ts.id}]`)
    }
  }
  const images: string[] = []
  for (const slot of template.imageSlots) {
    const now = slotValue(project.pages, slot.key)
    const shipped = slotValue(template.pages, slot.key)
    if (now === undefined && !project.pages.some((p) => p.key === slot.key.split("/")[0] && p.sections.some((s) => s.id === slot.key.split("/")[1]))) continue
    if (!now || sameJson(now, shipped)) images.push(slot.key)
  }
  return { copy, images }
}
