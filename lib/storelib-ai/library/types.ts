/**
 * ===========================================================================
 *  DESIGN KNOWLEDGE: THE SHAPE OF ONE ENTRY
 * ===========================================================================
 * The entries are markdown files under ./entries/<category>/<id>.md with a
 * small frontmatter block. Markdown is where they are written and reviewed;
 * the runtime never opens them (a readFileSync against a file nothing
 * imports works locally and throws on Vercel, see lib/storelib-ai/knowledge.ts).
 * `scripts/build-library.ts` parses them into index.generated.ts,
 * which is checked in, and tests/library.test.ts fails when the two
 * drift apart.
 *
 * The shared contract (lib/ai-builder/types.ts, KnowledgeEntry) is the
 * smaller shape the agent's search_knowledge tool returns; `toContractEntry`
 * maps this one onto it. This shape keeps the extra metadata retrieval ranks
 * on (intents, phases, priority, capabilities, components).
 *
 * Pure types. Browser safe.
 */
import type { KnowledgeEntry as ContractEntry, KnowledgeKind } from "@/lib/ai-builder/types"

export const KNOWLEDGE_CATEGORIES = [
  "core",
  "industry",
  "style",
  "typography",
  "color",
  "layout",
  "header",
  "footer",
  "component",
  "state",
  "motion",
  "responsive",
  "accessibility",
  "storelib",
  "anti-slop",
  "debugging",
] as const
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

/**
 * What the agent is doing when it asks. A plan needs the concept and the
 * industry; a repair needs debugging and states. Every entry names the
 * phases it is useful in, so retrieval can prefer it there.
 */
export const KNOWLEDGE_PHASES = ["concept", "plan", "build", "review", "repair"] as const
export type KnowledgePhase = (typeof KNOWLEDGE_PHASES)[number]

/**
 * What the site can actually do, from Storelib's own data
 * (lib/website-builder/ai-site/capabilities.ts). An entry that presents a
 * membership is only worth sending to a site that has one.
 */
export const KNOWLEDGE_CAPABILITIES = [
  "products",
  "checkout",
  "digital",
  "courses",
  "memberships",
  "community",
  "forms",
  "bookings",
  "blog",
  "newsletter",
  "events",
] as const
export type KnowledgeCapability = (typeof KNOWLEDGE_CAPABILITIES)[number]

export interface KnowledgeEntry {
  /** Unique, kebab case, also the file name. */
  id: string
  title: string
  category: KnowledgeCategory
  /** One line, used in the compact listing and as the first thing ranked. */
  summary: string
  /** What a request is trying to do when this entry helps, e.g. "design-hero", "choose-fonts". */
  intents: string[]
  /** Free tags for matching: style names, component names, moods. */
  tags: string[]
  /** Industries this is specifically about (empty = any). */
  industries: string[]
  /** Visual styles this is specifically about (empty = any). */
  styles: string[]
  /** UI components this covers. */
  components: string[]
  /** Capabilities the site must have for this entry to apply (empty = always applies). */
  capabilities: KnowledgeCapability[]
  phases: KnowledgePhase[]
  /** 1 (nice to know) to 5 (always worth sending when relevant). */
  priority: number
  /** Ids of existing archetypes, patterns, presets or other entries this links to. */
  related: string[]
  version: number
  /** The markdown body, without the frontmatter. */
  body: string
}

/** A rough, stable token estimate: four characters per token, rounded up. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** The contract's coarser kind for each library category. */
export const KIND_OF_CATEGORY: Record<KnowledgeCategory, KnowledgeKind> = {
  core: "core",
  industry: "industry",
  style: "style",
  typography: "style",
  color: "style",
  layout: "layout",
  header: "layout",
  footer: "layout",
  responsive: "layout",
  component: "component",
  state: "component",
  accessibility: "component",
  motion: "motion",
  storelib: "storelib",
  "anti-slop": "anti_slop",
  debugging: "debugging",
}

/** The categories a contract kind covers. */
export function categoriesOfKind(kind: KnowledgeKind): KnowledgeCategory[] {
  return KNOWLEDGE_CATEGORIES.filter((c) => KIND_OF_CATEGORY[c] === kind)
}

/** This entry in the shared contract's shape (what search_knowledge returns). */
export function toContractEntry(e: KnowledgeEntry, mode: "full" | "summary" = "full"): ContractEntry {
  return {
    id: e.id,
    kind: KIND_OF_CATEGORY[e.category],
    title: e.title,
    tags: e.tags,
    industries: e.industries.length ? e.industries : undefined,
    body: mode === "full" ? e.body : `${e.summary} (Ask for "${e.id}" for the full entry.)`,
  }
}

/**
 * The site's capabilities in the library's vocabulary, from the shape
 * lib/website-builder/ai-site/capabilities.ts reads (structural, so this
 * module does not import server code). Newsletter sign up is always possible
 * (data-storelib-form="subscribe"), so it is always included.
 */
export function capabilitiesFromSite(site: {
  facts?: { products?: unknown[] } | null
  productTypes?: Record<string, number>
  communities?: unknown[]
  forms?: { published: number; bookings: number }
  blog?: { posts: number }
}): KnowledgeCapability[] {
  const types = site.productTypes ?? {}
  const count = (k: RegExp) => Object.entries(types).filter(([t]) => k.test(t)).reduce((n, [, v]) => n + (v || 0), 0)
  const products = Object.values(types).reduce((n, v) => n + (v || 0), 0) + (site.facts?.products?.length ?? 0)
  const out = new Set<KnowledgeCapability>(["newsletter"])
  if (products > 0) {
    out.add("products")
    out.add("checkout")
  }
  if (count(/digital|download|file|pack/i) > 0) out.add("digital")
  if (count(/course|program/i) > 0) out.add("courses")
  if (count(/member|subscri/i) > 0) out.add("memberships")
  if (count(/event|ticket/i) > 0) out.add("events")
  if ((site.communities?.length ?? 0) > 0) out.add("community")
  if ((site.forms?.published ?? 0) > 0) out.add("forms")
  if ((site.forms?.bookings ?? 0) > 0) out.add("bookings")
  if ((site.blog?.posts ?? 0) > 0) out.add("blog")
  return [...out]
}
