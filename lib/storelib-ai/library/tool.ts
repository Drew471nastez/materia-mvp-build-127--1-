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
import { searchKnowledge, tokenize } from "./retrieve"
import type { KnowledgeCapability } from "./types"

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
  industry?: string
  styles?: string[]
  capabilities?: KnowledgeCapability[]
  /** Token budget for one result. Default 1800. */
  budgetTokens?: number
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
  const examples = !kinds.length || kinds.includes("component") ? matchExamples(query, 1).map(exampleEntry) : []
  const wantResources = kinds.includes("resource") || (!kinds.length && LIBRARY_NAMES.test(query))
  const resources = wantResources ? matchResources(query, Math.min(limit, 3)) : []
  const otherKinds = kinds.filter((k) => k !== "resource")
  if (kinds.length && !otherKinds.length) return { entries: [...examples, ...resources] }
  const text = [query, ...(ctx.styles ?? [])].join(" ")
  const found = searchKnowledge({ text, kinds: otherKinds.length ? otherKinds : undefined, industry: ctx.industry, limit: Math.max(1, limit - resources.length - examples.length), budgetTokens: ctx.budgetTokens, capabilities: ctx.capabilities })
  return { entries: [...examples, ...resources, ...found.entries.filter((f) => !examples.some((e) => e.id === f.id))].map(({ id, kind, title, body }) => ({ id, kind, title, body })) }
}
