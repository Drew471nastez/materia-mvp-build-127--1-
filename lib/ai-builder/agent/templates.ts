/**
 * ===========================================================================
 *  TEMPLATE FIRST (round P, P5)
 * ===========================================================================
 * Lovable and Webild level output starts from an excellent starting point and
 * adapts it; the agent used to write every component from zero. For a NEW
 * website the loop's brief phase (./loop.ts) now:
 *
 *   1. chooseTemplate(brief)            the closest template (P2's library)
 *   2. applyTemplate(store, t, brief)   its components, pages and blocks in
 *   3. the brief tells the agent it starts from it and must ADAPT it: the
 *      copy, palette, type, imagery and composition rebranded for this
 *      business (TEMPLATE_FIRST in ./prompts.ts), with one or two of its
 *      components shown whole as examples (few-shot, in the cached first turn)
 *   4. finish refuses while untouchedTemplateParts finds the template's own
 *      words (always) or pictures (when the job can make or find pictures)
 *
 * The template library is reached only through AgentDeps.templates
 * (ports.ts), defaulting to lib/storelib-ai/templates.
 */
import { applyTemplate, chooseTemplate, templateById, untouchedTemplateParts, type SiteTemplate } from "@/lib/storelib-ai/templates"
import type { ValidationIssue } from "../types"
import type { ImageSlot } from "./content-check"
import type { AgentDeps, StoredPage, TemplateLibrary } from "./ports"

/** P2's module behind the agent's TemplateLibrary: the one adapter to adjust if its signatures move. */
export const defaultTemplates: TemplateLibrary = {
  choose: (brief, choice) => chooseTemplate(brief, { choice }).template ?? null,
  byId: (id) => templateById(id) ?? null,
  async apply(store, template, brief, meta) {
    const r = await applyTemplate(store, template, brief, { jobId: meta.jobId, choice: meta.choice })
    /* Applied when something was written; a file left as it was (it existed) is a problem said, not a failure. */
    return { ok: r.files.length > 0 || r.pages.length > 0, files: r.files, pages: r.pages, next: r.next, problems: r.problems }
  },
  untouched(project, template) {
    const u = untouchedTemplateParts(template, project)
    return { copy: [...u.files, ...u.sections.map((s) => `${s.page} › ${s.type} [${s.id}]`)], images: u.emptyImageSlots }
  },
}

/** No starting template: the job builds from zero (scripted suites that compose a whole site of their own). */
export const NO_TEMPLATES: TemplateLibrary = { ...defaultTemplates, choose: () => null }

export const templatesOf = (deps: Pick<AgentDeps, "templates">): TemplateLibrary => deps.templates ?? defaultTemplates

/* ── few-shot: one or two of the template's components, compact ───────── */

/** At most this many characters per example (template + schema whole, the style shortened). */
export const EXAMPLE_CHARS = 5_000
const STYLE_CHARS = 1_400

function compact(text: string): string {
  const style = /(<style[^>]*>)([\s\S]*?)(<\/style>)/i.exec(text)
  let out = text
  if (style && style[2].length > STYLE_CHARS) out = text.replace(style[0], `${style[1]}${style[2].slice(0, STYLE_CHARS)}\n/* ... the rest of the style ... */\n${style[3]}`)
  return out.length > EXAMPLE_CHARS ? `${out.slice(0, EXAMPLE_CHARS)}\n<!-- ... cut for length ... -->` : out
}

/**
 * The components to show whole: the first body section of home (the opening, where the craft shows most) and
 * the first section with filled preset items (how a complete list is shipped). Different files, at most `max`.
 */
export function fewShotExamples(template: SiteTemplate, max = 2): { path: string; text: string }[] {
  const home = template.pages.find((p) => p.key === "home") ?? template.pages[0]
  const order = (home?.sections ?? []).filter((s) => !s.group).map((s) => `sections/${s.type}.storelib`)
  const pick: string[] = []
  const hero = order.find((p) => template.files[p])
  if (hero) pick.push(hero)
  const withItems = [...order, ...Object.keys(template.files)].find((p) => p !== hero && template.files[p] && /"presets"\s*:\s*\[[\s\S]*?"blocks"\s*:\s*\[\s*\{/.test(template.files[p]))
  if (withItems) pick.push(withItems)
  for (const p of Object.keys(template.files)) if (pick.length < max && !pick.includes(p) && p.startsWith("sections/")) pick.push(p)
  return pick.slice(0, max).map((path) => ({ path, text: compact(template.files[path]) }))
}

/** The first turn's block about the template: what was put in, what to adapt, and the examples. */
export function templateBlock(template: SiteTemplate, applied: { files: string[]; pages: string[]; next?: string }, examples: { path: string; text: string }[]): string {
  const lines = [
    `STARTING TEMPLATE: "${template.name}" (${template.id}) is already in this website: ${applied.files.length} component files (${applied.files.slice(0, 16).join(", ")}${applied.files.length > 16 ? ", ..." : ""}) placed on ${applied.pages.join(", ") || "home"}, every section with its items filled.`,
    applied.next ? applied.next.slice(0, 2_500) : "",
    template.imageSlots.length ? `ITS PICTURE SLOTS (each needs this business's own picture, written into ${template.imageSlots[0].targets?.length ? "its targets" : "its slot"}): ${template.imageSlots.slice(0, 16).map((s) => `${s.key} [${s.aspect}]${s.targets?.length ? ` → ${s.targets.map((t) => `${t.page}/${t.section}${t.block ? `/${t.block}` : ""}.${t.setting}`).join(", ")}` : ""}: ${s.prompt}`).join("; ")}` : "",
    examples.length ? `HOW ITS COMPONENTS ARE WRITTEN (the bar for every component you write or adapt):\n${examples.map((e) => `--- ${e.path} ---\n${e.text}`).join("\n\n")}` : "",
  ]
  return lines.filter(Boolean).join("\n\n")
}

/**
 * FINISH: the template is a starting point, never the site. Errors while the template's copy is still as shipped;
 * its empty picture slots too when the job can make or find pictures (else a warning: text-forward instead).
 */
export function templateIssues(template: SiteTemplate, project: { files: Record<string, string>; pages: StoredPage[] }, lib: TemplateLibrary, picturesAvailable: boolean): ValidationIssue[] {
  const left = lib.untouched(project, template)
  const out: ValidationIssue[] = []
  if (left.copy.length) {
    out.push({ severity: "error", code: "template.untouched_copy", message: `These still carry the starting template's own words, unchanged: ${left.copy.slice(0, 12).join("; ")}${left.copy.length > 12 ? ` and ${left.copy.length - 12} more` : ""}. Rewrite each for this business (its name, offer, audience, real facts) and adapt the component to the concept (type, palette, layout); never ship the template as it came.` })
  }
  if (left.images.length) {
    out.push({
      severity: picturesAvailable ? "error" : "warning",
      code: "template.untouched_image",
      message: picturesAvailable
        ? `These picture slots of the template are still empty: ${left.images.slice(0, 12).join(", ")}. Give each this business's own picture (generate_image or find_photo, or the creator's media and product pictures) in its section setting.`
        : `These picture slots of the template are still empty, and this job cannot make pictures: ${left.images.slice(0, 12).join(", ")}. Make those sections text-forward so no empty frame shows (or the creator's own media where it fits).`,
    })
  }
  return out
}

/**
 * A starting template says which pictures its design needs (its imageSlots, each with targets). On its own
 * placed sections only those are slots; its other image settings (a per-step picture, an optional crop) are the
 * creator's to fill or not. Sections the agent adds are held to every picture they draw.
 */
export function templateSlotSkip(template: SiteTemplate): (slot: ImageSlot) => boolean {
  const own = new Set(template.pages.flatMap((p) => p.sections.map((s) => `${p.key}/${s.id}`)))
  const declared = new Set(template.imageSlots.flatMap((i) => (i.targets ?? []).map((t) => `${t.page}/${t.section}${t.block ? `/${t.block}` : ""}.${t.setting}`)))
  return (slot) => own.has(`${slot.page}/${slot.sectionId}`) && !declared.has(`${slot.page}/${slot.sectionId}${slot.at === "section" ? "" : `/${slot.at}`}.${slot.setting}`)
}
