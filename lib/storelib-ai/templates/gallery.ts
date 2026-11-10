/**
 * ===========================================================================
 *  THE GALLERY AS THE AGENT SEES IT
 * ===========================================================================
 * Two doors to the same list:
 *
 *   list_templates    a tool spec and its implementation (LIST_TEMPLATES_TOOL,
 *                     runListTemplates), ready for the loop to bind; P5 wires
 *                     it with the template-first flow
 *   search_knowledge  "site template coffee shop", "template:<id>" or a
 *                     template's id returns the template as a knowledge
 *                     entry (templateEntries), so it is browsable today
 *                     through the tool the agent already has
 *
 * Pure. Browser safe (but imports every template: server and tests only).
 */
import type { ToolSpec } from "@/lib/sites/agent/types"
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import { chooseTemplate } from "./choose"
import { SITE_TEMPLATES, templateById, templateSummary } from "./registry"
import { templatePlan } from "./apply"
import type { SiteTemplate, TemplateSummary } from "./types"

export const LIST_TEMPLATES_TOOL: ToolSpec<"list_templates"> = {
  name: "list_templates",
  description:
    "Browse Storelib's site templates: whole, original starting sites (home with 10 to 14 sections, product, collection, shop, search, about, contact, header and footer with drawers, search, cart and switches). Each answer gives the template's id, what it is for, its signature moves, pages and sections. Starting from the closest one and adapting it (words, palette, type, pictures, composition) is faster and better than writing every section from nothing. Never ship a template as it is.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The business or the look, in a few words (\"coffee shop\", \"dark music store\"), or a template id for its full layout." },
      limit: { type: "integer", minimum: 1, maximum: 12, description: "At most this many (default 4)." },
    },
    required: [],
    additionalProperties: false,
  },
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)

function haystack(t: SiteTemplate): string {
  return [t.id, t.name, t.summary, ...t.industries, ...t.stories, ...t.styles, ...t.directionIds, ...t.keywords, ...t.design.signature].join(" ").toLowerCase()
}

/** Templates for a query, best first: by the words they share (an id or name asked for leads). */
export function searchTemplates(query: string, limit = 4): SiteTemplate[] {
  const q = query.trim().toLowerCase()
  const exact = SITE_TEMPLATES.find((t) => q === t.id || q === `template:${t.id}` || q === t.name.toLowerCase())
  if (exact) return [exact]
  const words = new Set(tokens(q))
  const scored = SITE_TEMPLATES.map((t, i) => {
    const hay = haystack(t)
    const keywordHits = t.keywords.filter((k) => q.includes(k.toLowerCase())).length * 3
    const wordHits = [...words].filter((w) => hay.includes(w)).length
    return { t, i, n: keywordHits + wordHits }
  })
  const hits = scored.filter((x) => x.n > 0 || words.size === 0)
  return (hits.length ? hits : scored).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, Math.max(1, Math.min(12, limit))).map((x) => x.t)
}

/** list_templates: summaries, with the full layout when one id was asked for. */
export function runListTemplates(input: { query?: string; limit?: number } = {}): { templates: (TemplateSummary & { plan?: ReturnType<typeof templatePlan> })[] } {
  const found = searchTemplates(String(input.query ?? ""), input.limit ?? 4)
  const one = found.length === 1 && input.query && templateById(String(input.query).replace(/^template:/, "").trim())
  return { templates: found.map((t) => ({ ...templateSummary(t), ...(one ? { plan: templatePlan(t) } : {}) })) }
}

/** The template a brief should start from, as list_templates words it (the agent's first turn can quote it). */
export function templateSuggestion(brief: Pick<CreativeBrief, "prompt" | "business" | "story" | "style">): string {
  const c = chooseTemplate(brief)
  if (!c.template) return "SITE TEMPLATE: none is close to this business; build from the brief."
  return `SITE TEMPLATE: start from "${c.template.id}" (${c.template.name}): ${c.reasons.join(" ")} Adapt everything; never ship it as it is.`
}

/* ── as knowledge entries, for search_knowledge ────────────────────────── */

export interface TemplateEntry {
  id: string
  kind: "layout"
  title: string
  body: string
}

export function templateEntry(t: SiteTemplate): TemplateEntry {
  const s = templateSummary(t)
  const pages = s.pages.map((p) => `- ${p.key}: ${p.sections.join(", ") || "(the platform's layout)"}`).join("\n")
  return {
    id: `template:${t.id}`,
    kind: "layout",
    title: `Site template: ${t.name}`,
    body: [
      `${t.summary}`,
      `For: ${t.industries.join(", ")}. Story: ${t.stories.join(", ")}. Directions: ${t.directionIds.join(", ")}. Motion: ${t.motion}.`,
      `First screen: ${t.design.thesis}`,
      `Signature moves: ${t.design.signature.join("; ")}.`,
      `Pages and sections:\n${pages}`,
      `Pictures: ${t.imageSlots.length} slots (${t.imageSlots.map((i) => `${i.key} ${i.aspect}`).join(", ")}).`,
      `Fonts ${s.fonts.heading} and ${s.fonts.body}; ${s.palette.mode} ground ${s.palette.background}, accent ${s.palette.accent}.`,
      "Start from it with the template-first flow, then rewrite every word, take the palette and type from the direction, generate each picture and recompose. Read one of its files (sections/ai_<prefix>_*.storelib) for the exact markup.",
    ].join("\n"),
  }
}

const ASKS_FOR_TEMPLATES = /\b(?:site|website|starting|start(?:er)?)\s+templates?\b|^templates?\b|^template:/i

/** search_knowledge's template answers: only when the query asks for templates or names one. */
export function templateEntries(query: string, limit = 2): TemplateEntry[] {
  const q = query.trim()
  const named = SITE_TEMPLATES.find((t) => q.toLowerCase() === t.id || q.toLowerCase() === `template:${t.id}`)
  if (named) return [templateEntry(named)]
  if (!ASKS_FOR_TEMPLATES.test(q)) return []
  return searchTemplates(q.replace(ASKS_FOR_TEMPLATES, " "), limit).map(templateEntry)
}
