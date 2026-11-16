/**
 * The search_knowledge tool: its JSON schema for the provider and the
 * implementation the loop (L3) binds, in the shapes fixed by
 * lib/ai-builder/agent-tools.ts. The job context (industry, styles from the
 * concept, the site's capabilities) is bound by the loop, not chosen by the
 * model, so a search for "pricing" on a site with no memberships never pulls
 * membership advice.
 *
 * Pure. Browser safe.
 */
import type { AgentToolInputs, AgentToolOutputs } from "@/lib/ai-builder/agent-tools"
import type { KnowledgeEntry as ContractEntry, KnowledgeKind } from "@/lib/ai-builder/types"
import type { ToolSpec } from "@/lib/sites/agent/types"
import { RESOURCES, type ResourceRecord } from "./resources"
import { matchExamples, type ComponentExample } from "./examples"
import { knowledgeById, searchKnowledge, tokenize } from "./retrieve"
import type { KnowledgeCapability } from "./types"
import { templateEntries } from "@/lib/storelib-ai/templates/gallery"

const KINDS: KnowledgeKind[] = ["core", "industry", "style", "layout", "component", "motion", "storelib", "anti_slop", "debugging", "resource"]

export const SEARCH_KNOWLEDGE_TOOL: ToolSpec<"search_knowledge"> = {
  name: "search_knowledge",
  description:
    "Search Storelib's design knowledge before deciding something you are unsure of. Ask for a working component by its id (ai_site_header, ai_marquee...) or as \"example <thing>\" to get a complete .storelib file that runs in Storelib's runtime, to adapt to the concept. Also: an industry (\"music producer sample packs\"), a style (\"editorial luxury\"), a component and its states (\"pricing table\", \"mobile menu\"), motion (\"marquee\"), presenting real store data (\"membership\", \"bookings\"), anti-slop rules, fixing generated code (\"sticky not working\"), or an external component library (kind resource). Returns a few short entries; ask for an entry by its id to get it in full. Do not search for everything up front.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What you are deciding or fixing, in a few words, or an entry id." },
      kinds: { type: "array", items: { type: "string", enum: KINDS }, description: "Optional: only these kinds." },
      limit: { type: "integer", minimum: 1, maximum: 8, description: "Optional: at most this many entries (default 4)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
}

export interface SearchContext {
  /**
   * Round BB (the owner: train it only on the AI source bank): the platform's working rules only. No site
   * template, example component, outside library, style, industry, layout, palette, motion recipe or stock header
   * and footer pattern: the look and the structure come from the owner's library.
   */
  bankOnly?: boolean
  industry?: string
  styles?: string[]
  capabilities?: KnowledgeCapability[]
  /** Token budget for one result. Default 1800. */
  budgetTokens?: number
}

/** The categories that are how Storelib works, not how a site looks (SearchContext.bankOnly). */
export const RULE_CATEGORIES: ReadonlySet<string> = new Set(["storelib", "accessibility", "debugging", "state", "responsive", "anti-slop"])
/** And the entries of other categories that are behaviour, never a look: a dialog's focus, a drawer's scroll, a form's states, the fonts that load. */
export const RULE_IDS: ReadonlySet<string> = new Set([
  "component-accordion", "component-carousel", "component-dialog", "component-drawer", "component-forms", "component-inputs", "component-loading",
  "component-media-player", "component-navigation-menus", "component-notifications", "component-tabs", "component-tooltip", "component-tables",
  "core-agent-loop", "core-links-and-actions", "core-prompt-reading", "core-self-review", "core-iteration", "core-copywriting",
  "typography-type-library", "typography-loading", "typography-scale",
])
/** Whether an entry is one of the platform's working rules (bank-only search keeps these and nothing else). */
export function isRuleEntry(id: string): boolean {
  return RULE_IDS.has(id) || RULE_CATEGORIES.has(knowledgeById(id)?.category ?? "")
}

function resourceEntry(r: ResourceRecord): ContractEntry {
  return {
    id: r.id,
    kind: "resource",
    title: r.name,
    tags: r.patterns,
    body: [
      `${r.what} ${r.url}`,
      `Licence: ${r.license} (${r.licenseStatus}${r.verifiedOn ? `, checked ${r.verifiedOn}` : ""}). Commercial use: ${r.commercialUse}`,
      r.toVerify ? `Check first: ${r.toVerify}` : "",
      `Use: ${r.integration}. Learn the behaviour and accessibility, write original markup and CSS; never import or copy code into a site.`,
      r.storelibUses.length ? `Worth studying: ${r.storelibUses.join("; ")}.` : "",
      `Accessibility: ${r.accessibility}`,
      r.notes ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
  }
}

function matchResources(query: string, limit: number): ContractEntry[] {
  const q = new Set(tokenize(query))
  return RESOURCES.map((r, i) => {
    const words = tokenize(`${r.id} ${r.name} ${r.patterns.join(" ")} ${r.storelibUses.join(" ")}`)
    const score = words.filter((w) => q.has(w)).length + (query.toLowerCase().includes(r.id) || query.toLowerCase().includes(r.name.toLowerCase()) ? 10 : 0)
    return { r, i, score }
  })
    .filter((x) => x.score > 0 || q.size === 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => resourceEntry(x.r))
}

function exampleEntry(e: ComponentExample): ContractEntry {
  return {
    id: e.id,
    kind: "component",
    title: `Working example: ${e.title}`,
    tags: e.tags,
    body: `${e.summary}\nA complete file that compiles and runs in Storelib's runtime. Adapt it to the concept (type, colour, spacing, words, its ai_ name); do not paste it unchanged.\n\n${e.source.replace(/^\{#\s*example[\s\S]*?#\}\n?/, "")}`,
  }
}

const LIBRARY_NAMES = /shadcn|radix|origin ?ui|coss|tremor|aceternity|magic ?ui|21st|component librar|code ui|shadow ui/i

/** The tool's implementation, in the contract's input and output shapes. */
export function runSearchKnowledge(input: AgentToolInputs["search_knowledge"], ctx: SearchContext = {}): AgentToolOutputs["search_knowledge"] {
  const query = String(input?.query ?? "").slice(0, 500)
  const limit = Math.max(1, Math.min(8, Math.floor(input?.limit ?? 4)))
  const kinds = (input?.kinds ?? []).filter((k): k is KnowledgeKind => KINDS.includes(k))
  /* Round P (P2a): a question about site templates ("site template coffee shop", "template:<id>") gets the gallery's answer first. */
  if (ctx.bankOnly) {
    const found = searchKnowledge({ text: query, kinds: kinds.filter((k) => k !== "resource").length ? kinds.filter((k) => k !== "resource") : undefined, industry: ctx.industry, limit: limit * 3, budgetTokens: ctx.budgetTokens, capabilities: ctx.capabilities })
    const entries = found.entries.filter((e) => isRuleEntry(e.id)).slice(0, limit).map(({ id, kind, title, body }) => ({ id, kind, title, body }))
    return { entries }
  }
  const templates = !kinds.length || kinds.includes("layout") ? templateEntries(query, Math.min(2, limit)) : []
  if (templates.length && templates.length >= limit) return { entries: templates }
  const examples = !kinds.length || kinds.includes("component") ? matchExamples(query, 1).map(exampleEntry) : []
  const wantResources = kinds.includes("resource") || (!kinds.length && LIBRARY_NAMES.test(query))
  const resources = wantResources ? matchResources(query, Math.min(limit, 3)) : []
  const otherKinds = kinds.filter((k) => k !== "resource")
  if (kinds.length && !otherKinds.length) return { entries: [...templates, ...examples, ...resources] }
  const text = [query, ...(ctx.styles ?? [])].join(" ")
  const found = searchKnowledge({ text, kinds: otherKinds.length ? otherKinds : undefined, industry: ctx.industry, limit: Math.max(1, limit - resources.length - examples.length), budgetTokens: ctx.budgetTokens, capabilities: ctx.capabilities })
  const entries = [...examples, ...resources, ...found.entries.filter((f) => !examples.some((e) => e.id === f.id))].map(({ id, kind, title, body }) => ({ id, kind, title, body }))
  return { entries: templates.length ? [...templates, ...entries].slice(0, Math.max(limit, templates.length)) : entries }
}
