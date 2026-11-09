/**
 * ===========================================================================
 *  RETRIEVAL: THE FEW ENTRIES THIS REQUEST NEEDS, NEVER ALL OF THEM
 * ===========================================================================
 * The whole knowledge base is tens of thousands of tokens. A request for a
 * premium fitness coach site needs the fitness industry entry, the two or
 * three styles in its concept, its hero and header choices, the anti-slop
 * rules and maybe a booking entry, and nothing about restaurants.
 *
 * Ranking is deterministic so a retry sees the same context and a test can
 * pin it:
 *   1. BM25 over title, summary, tags and body (title and tags weighted up).
 *   2. Structured boosts: the requested industry, styles, components,
 *      intent and phase matching the entry's own metadata.
 *   3. Priority as a small prior, then id as the final tie break.
 * Entries that need a capability the site lacks (a membership entry for a
 * site with no membership) are dropped, and industry or style entries about
 * a DIFFERENT industry or style are pushed down hard, so "fitness" never
 * pulls in the restaurant entry because both mention bookings.
 *
 * The index is built once per process and cached. Pure, browser safe.
 */
import { parseEntry } from "./parse"
import { KNOWLEDGE_SOURCES } from "./index.generated"
import { categoriesOfKind, estimateTokens, toContractEntry, type KnowledgeCapability, type KnowledgeCategory, type KnowledgeEntry, type KnowledgePhase } from "./types"
import type { KnowledgeEntry as ContractEntry, KnowledgeKind, KnowledgeQuery as ContractQuery } from "@/lib/ai-builder/types"

export interface KnowledgeQuery {
  /** The request or brief in the creator's words. */
  text?: string
  /** What the agent is trying to do, e.g. "design-hero", "choose-palette", "fix-mobile". */
  intent?: string
  /** e.g. "fitness coach", "music producer". Matched against entry industries and tags. */
  industry?: string
  /** Style ids or names from the visual concept, e.g. ["luxury", "editorial"]. */
  styles?: string[]
  /** Components about to be built, e.g. ["pricing", "header"]. */
  components?: string[]
  /** What the site can do. Omit to skip the capability filter. */
  capabilities?: KnowledgeCapability[]
  phase?: KnowledgePhase
  /** Only these categories. */
  categories?: KnowledgeCategory[]
  /** Only these contract kinds (lib/ai-builder/types.ts); combined with categories when both are given. */
  kinds?: KnowledgeKind[]
  /** Entries asked for by id; always first when they fit. */
  ids?: string[]
  /** Entries already in context. */
  exclude?: string[]
  /** Hard ceiling for the returned text. Default 2500. */
  budgetTokens?: number
  /** At most this many entries. Default 8. */
  limit?: number
}

export interface RankedEntry {
  entry: KnowledgeEntry
  score: number
  /** "full" sends the body; "summary" is what fitted when the body did not. */
  mode: "full" | "summary"
  tokens: number
  why: string[]
}

export interface KnowledgeResult {
  entries: RankedEntry[]
  usedTokens: number
  budgetTokens: number
  /** Relevant entries left out for the budget or the limit, so the agent can ask for one by id. */
  omitted: { id: string; title: string }[]
}

/* ── the index ─────────────────────────────────────────────────────────── */

interface Doc {
  entry: KnowledgeEntry
  tf: Map<string, number>
  len: number
  fullTokens: number
  summaryTokens: number
}

interface Index {
  entries: KnowledgeEntry[]
  byId: Map<string, KnowledgeEntry>
  docs: Doc[]
  df: Map<string, number>
  avgLen: number
}

const STOP = new Set(
  "a an and are as at be but by can do for from has have how i if in into is it its me my of on or our so than that the their them then there these they this to too up us was we what when where which who will with you your not no use make site page want need like just very more most get".split(" "),
)

/** Lowercase words, light stemming so "coaches", "coaching" and "coach" meet. */
export function tokenize(text: string): string[] {
  return ((text.toLowerCase().match(/[a-z0-9]+/g) ?? []) as string[]).filter((w) => w.length > 1 && !STOP.has(w)).map(stem)
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y"
  if (w.length > 4 && w.endsWith("es") && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1)
  return w
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function entryText(e: KnowledgeEntry): string {
  const weighted = [e.title, e.title, e.title, e.summary, e.summary, e.tags.join(" "), e.tags.join(" "), e.industries.join(" "), e.styles.join(" "), e.components.join(" "), e.intents.join(" ")]
  return `${weighted.join(" ")} ${e.body}`
}

/** The summary form sent when the body does not fit. */
export function summaryText(e: KnowledgeEntry): string {
  return `### ${e.title} [${e.id}]\n${e.summary} (Ask for "${e.id}" for the full entry.)`
}

export function fullText(e: KnowledgeEntry): string {
  return `### ${e.title} [${e.id}]\n${e.body}`
}

let cached: Index | null = null

/** The parsed, validated index. Built once per process. */
export function knowledgeIndex(): Index {
  if (cached) return cached
  /* tests/ai-knowledge.test.ts holds every entry valid; at runtime a bad one is skipped, never a thrown agent turn. */
  const entries: KnowledgeEntry[] = []
  for (const s of KNOWLEDGE_SOURCES) {
    try {
      entries.push(parseEntry(s.source, s.file))
    } catch {
      continue
    }
  }
  const byId = new Map<string, KnowledgeEntry>()
  for (const e of entries) {
    if (byId.has(e.id)) throw new Error(`duplicate knowledge id: ${e.id}`)
    byId.set(e.id, e)
  }
  const df = new Map<string, number>()
  const docs: Doc[] = entries.map((entry) => {
    const words = tokenize(entryText(entry))
    const tf = new Map<string, number>()
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1)
    for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1)
    return { entry, tf, len: words.length, fullTokens: estimateTokens(fullText(entry)), summaryTokens: estimateTokens(summaryText(entry)) }
  })
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length)
  cached = { entries, byId, docs, df, avgLen }
  return cached
}

export function allKnowledge(): readonly KnowledgeEntry[] {
  return knowledgeIndex().entries
}

export function knowledgeById(id: string): KnowledgeEntry | undefined {
  return knowledgeIndex().byId.get(id)
}

/* ── scoring ───────────────────────────────────────────────────────────── */

const K1 = 1.2
const B = 0.75

function bm25(doc: Doc, terms: string[], idx: Index): number {
  const N = idx.docs.length
  let score = 0
  for (const t of new Set(terms)) {
    const f = doc.tf.get(t)
    if (!f) continue
    const n = idx.df.get(t) ?? 0
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
    score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / idx.avgLen)))
  }
  return score
}

/** Does any of the entry's labels match any wanted label, by slug or by shared words? */
function labelMatch(labels: string[], wanted: string[]): boolean {
  if (!labels.length || !wanted.length) return false
  const ls = labels.map(norm)
  return wanted.map(norm).some((w) => ls.some((l) => l === w || l.split("-").includes(w) || w.split("-").includes(l)))
}

function scoreDoc(doc: Doc, q: KnowledgeQuery, terms: string[], idx: Index): { score: number; why: string[] } {
  const e = doc.entry
  const why: string[] = []
  let score = bm25(doc, terms, idx)
  if (score > 0) why.push(`text ${score.toFixed(2)}`)

  const industry = q.industry ? [q.industry, ...tokenize(q.industry)] : []
  const styles = q.styles ?? []
  const components = q.components ?? []

  if (industry.length && labelMatch([...e.industries, ...(e.category === "industry" ? e.tags : [])], industry)) {
    score += 6
    why.push("industry")
  } else if (e.category === "industry") {
    score *= 0.15
  }
  if (styles.length && labelMatch([...e.styles, ...(e.category === "style" ? e.tags : [])], styles)) {
    score += 5
    why.push("style")
  } else if (e.category === "style" && e.id !== "style-combining") {
    score *= 0.25
  }
  if (industry.length && e.category === "style" && labelMatch(e.styles, industry)) {
    score += 3
    why.push("industry style")
  }
  /* Repair advice is noise while planning: only at full weight when repairing or reviewing, or when the request is about a failure. */
  if (e.category === "debugging" && q.phase !== "repair" && q.phase !== "review" && !/\b(bug|broken|error|fix|fail|wrong|not working|overflow|jump)/i.test(q.text ?? "")) {
    score *= 0.4
  }
  if (components.length && labelMatch(e.components, components)) {
    score += 4
    why.push("component")
  }
  if (q.intent && labelMatch(e.intents, [q.intent, ...tokenize(q.intent)])) {
    score += 3
    why.push("intent")
  }
  if (q.phase && e.phases.includes(q.phase)) {
    score += 1.5
    why.push("phase")
  }
  score += e.priority * 0.4
  return { score, why }
}

function capable(e: KnowledgeEntry, caps: KnowledgeCapability[] | undefined): boolean {
  if (!caps || !e.capabilities.length) return true
  return e.capabilities.some((c) => caps.includes(c))
}

/** Every entry that passes the filters, best first, without a budget. */
export function rankKnowledge(q: KnowledgeQuery): { entry: KnowledgeEntry; score: number; why: string[]; doc: Doc }[] {
  const idx = knowledgeIndex()
  const terms = tokenize([q.text, q.intent, q.industry, ...(q.styles ?? []), ...(q.components ?? [])].filter(Boolean).join(" ").slice(0, 6_000))
  const exclude = new Set(q.exclude ?? [])
  const pinned = new Set(q.ids ?? [])
  const cats = new Set<KnowledgeCategory>([...(q.categories ?? []), ...(q.kinds ?? []).flatMap(categoriesOfKind)])
  /* A query with nothing to match (only a category, say) lists that category by priority instead of returning nothing. */
  const signal = terms.length > 0 || !!q.industry || !!q.intent || !!q.styles?.length || !!q.components?.length
  return idx.docs
    .filter((d) => !exclude.has(d.entry.id))
    .filter((d) => pinned.has(d.entry.id) || !cats.size || cats.has(d.entry.category))
    .filter((d) => pinned.has(d.entry.id) || capable(d.entry, q.capabilities))
    .map((d) => {
      const s = scoreDoc(d, q, terms, idx)
      return { entry: d.entry, doc: d, score: pinned.has(d.entry.id) ? 1_000 + s.score : s.score, why: pinned.has(d.entry.id) ? ["asked for", ...s.why] : s.why }
    })
    .filter((r) => !signal || r.score > r.entry.priority * 0.4 + 0.001 || pinned.has(r.entry.id))
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
}

export const DEFAULT_BUDGET_TOKENS = 2_500
export const MAX_BUDGET_TOKENS = 12_000

/**
 * The ranked entries that fit the budget. A body that does not fit is sent
 * as its summary when that fits, so a relevant entry is never silently lost:
 * it is either there, there in short, or listed in `omitted`.
 */
export function retrieveKnowledge(q: KnowledgeQuery): KnowledgeResult {
  const budget = Math.max(200, Math.min(MAX_BUDGET_TOKENS, Math.floor(q.budgetTokens ?? DEFAULT_BUDGET_TOKENS)))
  const limit = Math.max(1, Math.min(30, q.limit ?? 8))
  const ranked = rankKnowledge(q)
  const out: RankedEntry[] = []
  const omitted: { id: string; title: string }[] = []
  let used = 0
  for (const r of ranked) {
    if (out.length >= limit) {
      omitted.push({ id: r.entry.id, title: r.entry.title })
      continue
    }
    if (used + r.doc.fullTokens <= budget) {
      out.push({ entry: r.entry, score: r.score, mode: "full", tokens: r.doc.fullTokens, why: r.why })
      used += r.doc.fullTokens
    } else if (used + r.doc.summaryTokens <= budget) {
      out.push({ entry: r.entry, score: r.score, mode: "summary", tokens: r.doc.summaryTokens, why: r.why })
      used += r.doc.summaryTokens
    } else {
      omitted.push({ id: r.entry.id, title: r.entry.title })
    }
  }
  return { entries: out, usedTokens: used, budgetTokens: budget, omitted: omitted.slice(0, 12) }
}

/** The result as one block of text for a prompt turn. "" when nothing matched. */
export function formatKnowledge(result: KnowledgeResult): string {
  if (!result.entries.length) return ""
  const parts = result.entries.map((r) => (r.mode === "full" ? fullText(r.entry) : summaryText(r.entry)))
  const more = result.omitted.length ? `\n\nAlso relevant, ask by id: ${result.omitted.map((o) => `${o.id} (${o.title})`).join(", ")}` : ""
  return `DESIGN KNOWLEDGE for this step:\n\n${parts.join("\n\n")}${more}`
}

/** One line per entry, for a catalogue the agent can browse without loading bodies. */
export function knowledgeCatalog(category?: KnowledgeCategory): string {
  return allKnowledge()
    .filter((e) => !category || e.category === category)
    .map((e) => `${e.id} (${e.category}): ${e.summary}`)
    .join("\n")
}

/**
 * THE CONTRACT'S RETRIEVAL (lib/ai-builder/types.ts KnowledgeQuery), what the
 * agent's search_knowledge tool calls. Budgeted like retrieveKnowledge, with a
 * default small enough for a tool result. An exact id in the text ("full entry
 * for hero-editorial") is honoured, so the omitted list can be followed up.
 */
export const SEARCH_BUDGET_TOKENS = 1_800

export function searchKnowledge(q: ContractQuery & { budgetTokens?: number; capabilities?: KnowledgeCapability[] }): { entries: ContractEntry[]; omitted: { id: string; title: string }[]; usedTokens: number } {
  const idx = knowledgeIndex()
  const ids = (q.text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) ?? []).filter((id) => idx.byId.has(id))
  const result = retrieveKnowledge({
    text: q.text,
    industry: q.industry,
    kinds: q.kinds,
    ids,
    capabilities: q.capabilities,
    limit: Math.max(1, Math.min(10, q.limit ?? 5)),
    budgetTokens: q.budgetTokens ?? SEARCH_BUDGET_TOKENS,
  })
  return { entries: result.entries.map((r) => toContractEntry(r.entry, r.mode)), omitted: result.omitted, usedTokens: result.usedTokens }
}
