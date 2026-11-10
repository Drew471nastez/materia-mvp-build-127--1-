/**
 * ===========================================================================
 *  CURATED DESIGN REFERENCES (round O): O6's STUB OF O1's MODULE
 * ===========================================================================
 * TODO(integrator, round O): O1 owns lib/storelib-ai/references/ (the
 * DesignReference record of spec 2.4, deterministic retrieval, images for a
 * multimodal turn, admin ingestion with vision analysis, vendored open
 * references with licence and provenance). When O1's branch merges, take its
 * files whole and delete this stub. Names as fixed in the round O brief:
 *
 *   searchReferences(brief, { limit })   → DesignReference[] (sync or async: callers await it)
 *   referencesForPrompt(refs)            → string (text analyses, never the images)
 *   referenceImagesFor(ids)              → Promise<AgentImage[]> (for the plan turn's content blocks)
 *
 * O6's only callers are lib/ai-builder/agent/design-brief.ts (text) and the
 * agent loop's plan turn (images, lib/ai-builder/agent/loop.ts).
 *
 * The stub has no library yet, so it returns nothing and the prompts say
 * nothing about references: never a claim about an image that was not sent.
 */
import type { AgentImage } from "@/lib/sites/agent/attachments"

/** Spec 2.4, the fields a prompt reads. O1's record has more. */
export interface DesignReference {
  id: string
  title: string
  source: string
  license: string
  industries: string[]
  styles: string[]
  /** Verified visible facts, as text. */
  summary: string
  /** Reusable principles drawn from it. */
  principles: string[]
  /** What must not be copied from it. */
  antiCopy: string[]
}

/** STUB: no references yet. */
export function searchReferences(_brief: unknown, _opts: { limit?: number } = {}): DesignReference[] {
  return []
}

/** The references as text for a prompt: analyses and principles, marked as evidence, never as templates. */
export function referencesForPrompt(refs: DesignReference[]): string {
  if (!refs.length) return ""
  return [
    "Visual evidence, not templates: take the principles, never the layout, words, artwork or brand of one reference.",
    ...refs.map((r) => `- ${r.title} [${r.id}; ${r.styles.join(", ")}]: ${r.summary} Principles: ${r.principles.join("; ")}. Do not copy: ${r.antiCopy.join("; ")}.`),
  ].join("\n")
}

/** STUB: no images yet. */
export async function referenceImagesFor(_ids: string[]): Promise<AgentImage[]> {
  return []
}
