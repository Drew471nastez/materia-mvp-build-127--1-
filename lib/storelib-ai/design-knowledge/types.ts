/**
 * ===========================================================================
 *  DESIGN KNOWLEDGE: THE SHAPE OF ONE ENTRY
 * ===========================================================================
 * The entries are markdown files under ./entries/<category>/<id>.md with a
 * small frontmatter block. Markdown is where they are written and reviewed;
 * the runtime never opens them (a readFileSync against a file nothing
 * imports works locally and throws on Vercel, see lib/storelib-ai/knowledge.ts).
 * `scripts/build-design-knowledge.ts` parses them into index.generated.ts,
 * which is checked in, and tests/design-knowledge.test.ts fails when the two
 * drift apart.
 *
 * Pure types. Browser safe.
 */

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
