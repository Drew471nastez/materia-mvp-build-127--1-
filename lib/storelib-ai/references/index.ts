/**
 * The visual reference library (round O, O1): typed records, deterministic
 * retrieval and the prompt block. Browser safe; the database, the pictures
 * and the admin handlers are in ./server.ts (server only).
 *
 *   searchReferences(brief, { limit, extra })  the few references for a brief
 *   referencesForPrompt(refs, { withImages })  them as a prompt block
 *   referenceImagesFor(ids)                    their pictures (./server.ts)
 */
export * from "./types"
export { SEED_REFERENCES } from "./seed"
export { PRINCIPLE_REFERENCES } from "./principles"
export { VENDORED_REFERENCES } from "./vendored.generated"
export {
  builtInReferences,
  queryFrom,
  rankReferences,
  referenceById,
  searchReferences,
  selectReferences,
  DEFAULT_REFERENCE_LIMIT,
  MAX_REFERENCE_LIMIT,
  type BriefLike,
  type RankedReference,
  type ReferenceQuery,
  type SearchOptions,
} from "./search"
export { referenceLines, referencesForPrompt, REFERENCES_PROMPT_MAX_CHARS } from "./prompt"
