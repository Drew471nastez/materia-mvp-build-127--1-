/**
 * ===========================================================================
 *  THE WEBSITE AGENT, BUILDING LIKE THE TEMPLATES (round 26)
 * ===========================================================================
 * The owner: Start with AI, AI from a template, and Edit with AI should build
 * the way Storelib's templates are built: on the Materia theme's sections and
 * blocks with a slight edge of custom work, using the templates as the
 * reference for design, structure, page sets and section choices instead of
 * inventing sections. This is the agent's side of lib/storelib-ai/materia:
 *
 *   materiaBrief         the first turn's block. A new website or a full
 *                        redesign: the rules, the closest template as a
 *                        pattern (chosen from the creator's words, the
 *                        example they picked and what they sell) and the
 *                        catalogue with that template's sections in detail.
 *                        An edit on a Materia site: the short rules, the
 *                        site's own sections by what they do, and the
 *                        catalogue of what the site can add. An edit on a
 *                        site that is not Materia: nothing (it keeps its
 *                        own design, and the turn its budget).
 *   repairPlanCitations  the site plan names each slot's Materia model as
 *                        materia:<type>: a near miss is rewritten, an
 *                        unknown type refuses the plan with the closest.
 *   materiaInstallTypes  the Materia sections this install really has (its
 *                        imported files), so a site on a Materia template is
 *                        told to PLACE them, and set_page_sections can repair
 *                        a type written another way.
 *
 * The first turn is cached with the job; the block is held to
 * MATERIA_BRIEF_CHARS (about 1,900 tokens) and the knowledge gives way to it.
 */
import { MATERIA_INSTALL_MIN, materiaInstallTypes } from "@/lib/storelib-ai/materia/install"
import {
  catalogueText,
  chooseMateriaTemplate,
  MATERIA_EDIT_RULES,
  MATERIA_RULES,
  planCitationIssues,
  purposeOfType,
  referenceFocus,
  templateReferenceText,
  type TemplateChoice,
} from "@/lib/storelib-ai/materia"
import type { RuntimeCapabilities } from "../runtime-contract"
import type { ValidationIssue } from "../types"
import type { AgentJobInput, StoredFile, StoredPage } from "./ports"

/** The most the block may take of the first turn. */
export const MATERIA_BRIEF_CHARS = 7_500

export { isMateriaInstall, materiaInstallTypes } from "@/lib/storelib-ai/materia/install"

const PLACE_ON_MATERIA = `THIS WEBSITE RUNS ON MATERIA: its sections are in the site's files (sections/<type>.storelib, Materia's own, read only). Build with them: set_page_sections with their types, then set_section_settings and blocks to make each one this business's. Write an ai_ component only for the edge, where no Materia section does the job, and keep its settings in the same style.`

const MODEL_ON_MATERIA = `THIS WEBSITE IS WRITTEN AS YOUR OWN COMPONENTS, ON THE MATERIA PATTERN: Materia's sections are not installed on this website, so each section is an ai_ component modelled on the Materia section for its slot: the same job, the same kind of controls (a color_scheme, section_width, alignment, heading, subheading and button settings, repeating items as blocks) and the reference template's running order and rhythm of colour schemes. In the site plan, name each section's model as materia:<type> ("ai_opening: materia:hero-image1, the promise and the first program"). A section with no Materia model says custom; that is the edge, two or three on a site at most.`

/** What a placed section is for, by the catalogue: "hero-image1 [hero]". */
function siteSections(pages: readonly StoredPage[]): string {
  return pages
    .map((p) => {
      const body = p.sections.filter((s) => !s.group).map((s) => `${s.type}${purposeOfType(s.type) ? ` [${purposeOfType(s.type)}]` : ""}`)
      return body.length ? `${p.key}: ${body.join(", ")}` : ""
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 1_600)
}

/**
 * The first turn's Materia block for this job, the template it follows (a new website or a full redesign), and
 * whether the install is a Materia site.
 */
export function materiaBrief(input: { job: AgentJobInput; files: readonly StoredFile[]; pages: readonly StoredPage[]; caps?: RuntimeCapabilities | null; withRules?: boolean }): { text: string; choice: TemplateChoice | null; install: boolean } {
  const { job } = input
  /* The agent has MATERIA_RULES in its shared prefix (./prompts.ts AGENT_SYSTEM); another caller gets them here. */
  const rules = input.withRules === false ? "" : MATERIA_RULES
  const own = materiaInstallTypes(input.files)
  const install = own.length >= MATERIA_INSTALL_MIN
  const scoped = !!job.edit || job.redesign === "changes"
  if (scoped) {
    if (!install) return { text: "", choice: null, install }
    const text = [MATERIA_EDIT_RULES, `THIS SITE'S SECTIONS (Materia type [what it does]):\n${siteSections(input.pages)}`, catalogueText({ only: new Set(own), budget: 2_600, detailBudget: 0 })].filter(Boolean).join("\n\n")
    return { text: text.slice(0, MATERIA_BRIEF_CHARS), choice: null, install }
  }
  const sells = (input.caps?.products ?? []).slice(0, 12).map((p) => p.title).join(" ")
  const choice = chooseMateriaTemplate({ prompt: job.prompt, category: job.options?.category ?? null, extra: sells })
  const reference = templateReferenceText(choice.template, { budget: 2_600, why: choice.matched })
  const used = rules.length + reference.length + (install ? PLACE_ON_MATERIA : MODEL_ON_MATERIA).length + 200
  const catalogue = catalogueText({ focus: referenceFocus(choice.template), ...(install ? { only: new Set(own) } : {}), budget: Math.max(1_500, MATERIA_BRIEF_CHARS - used) })
  const text = [rules, install ? PLACE_ON_MATERIA : MODEL_ON_MATERIA, reference, catalogue].filter(Boolean).join("\n\n")
  return { text: text.slice(0, MATERIA_BRIEF_CHARS), choice, install }
}

/**
 * The plan's materia:<type> citations checked and repaired in place. Errors (an unknown type) refuse the plan;
 * warnings (a near miss rewritten) ride with the accepted note. `cited` counts the lines naming a Materia model.
 */
export function repairPlanCitations(pages: unknown): { pages: unknown; issues: ValidationIssue[]; cited: number } {
  if (!Array.isArray(pages)) return { pages, issues: [], cited: 0 }
  const issues: ValidationIssue[] = []
  let cited = 0
  const out = pages.map((p) => {
    if (!p || typeof p !== "object" || !Array.isArray((p as { sections?: unknown }).sections)) return p
    const page = p as { key?: unknown; sections: unknown[] }
    const lines = page.sections.map((s) => (typeof s === "string" ? s : ""))
    const r = planCitationIssues(lines)
    cited += r.cited
    for (const i of r.issues) issues.push({ severity: i.severity, code: i.severity === "error" ? "plan.materia_unknown" : "plan.materia_repaired", message: `${String(page.key ?? "?")}: ${i.message}`.slice(0, 400) })
    return { ...page, sections: page.sections.map((s, i) => (typeof s === "string" ? r.lines[i] : s)) }
  })
  return { pages: out, issues, cited }
}
