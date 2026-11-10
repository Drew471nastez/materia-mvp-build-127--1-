/**
 * The design knowledge library: entries (markdown under ./entries, embedded
 * by scripts/build-ai-knowledge.mjs), retrieval, the visual concept, the
 * external component registry and the search_knowledge tool.
 * The anti-slop evaluator is lib/ai-builder/slop.ts.
 */
export * from "./types"
export { parseEntry, parseFrontmatter, validateEntry } from "./parse"
export {
  allKnowledge,
  formatKnowledge,
  knowledgeById,
  knowledgeCatalog,
  knowledgeIndex,
  rankKnowledge,
  retrieveKnowledge,
  searchKnowledge,
  DEFAULT_BUDGET_TOKENS,
  MAX_BUDGET_TOKENS,
  SEARCH_BUDGET_TOKENS,
  type KnowledgeQuery,
  type KnowledgeResult,
  type RankedEntry,
} from "./retrieve"
export * from "./concept"
export * from "./type-systems"
export * from "./resources"
export { SEARCH_KNOWLEDGE_TOOL, runSearchKnowledge, type SearchContext } from "./tool"
export { allExamples, chromeExamples, exampleById, exampleCatalog, matchExamples, parseExample, type ComponentExample } from "./examples"
export * from "./chrome-kit"
