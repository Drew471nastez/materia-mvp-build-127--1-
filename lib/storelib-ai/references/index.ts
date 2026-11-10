/**
 * ===========================================================================
 *  CURATED DESIGN REFERENCES (round O): O6's STUB OF O1's MODULE
 * ===========================================================================
 * TODO(integrator, round O): O1 owns lib/storelib-ai/references/ (the
 * DesignReference record of spec 2.4, the seed and vendored library,
 * deterministic searchReferences, referencesForPrompt, the admin's analysed
 * screenshots and their pictures for the plan turn, wired into the agent loop
 * through AgentDeps.references). When O1's branch merges, take its files
 * whole and delete this stub. The names and parameters below are O1's, read
 * from its branch, so O6's caller (lib/ai-builder/agent/design-brief.ts)
 * compiles against either.
 *
 * The stub has no library, so it finds nothing and the prompts say nothing
 * about references: never a claim about a picture that was not sent.
 */

/** O1's record, the fields O6 reads. */
export interface DesignReference {
  id: string
  title: string
  summary: string
  styleTags: string[]
  industries: string[]
  borrow: string[]
  avoid: string[]
  image: { path: string; mediaType: string; width: number | null; height: number | null; sha256: string } | null
}

/** O1's brief shape: free text, a query or any record. */
export type BriefLike = string | { text?: string; industry?: string | null } | Record<string, unknown>

/** STUB: no references yet. */
export function searchReferences(_brief: BriefLike, _opts: { limit?: number } = {}): DesignReference[] {
  return []
}

/** The references as text for a prompt: analyses and principles, evidence and not templates. */
export function referencesForPrompt(refs: readonly DesignReference[], _opts: { withImages?: readonly string[]; maxChars?: number } = {}): string {
  if (!refs.length) return ""
  return [
    "VISUAL REFERENCES (evidence, not templates: take the principles, never one reference's layout, words, artwork or brand):",
    ...refs.map((r) => `- ${r.title} [${r.id}; ${r.styleTags.join(", ")}]: ${r.summary} Borrow: ${r.borrow.join("; ")}. Avoid: ${r.avoid.join("; ")}.`),
  ].join("\n")
}
