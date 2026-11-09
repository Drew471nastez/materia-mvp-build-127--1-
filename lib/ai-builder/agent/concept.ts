/**
 * ===========================================================================
 *  THE VISUAL CONCEPT, DECIDED BEFORE ANY FILE IS WRITTEN
 * ===========================================================================
 * A new website starts from an art direction, not from a section catalogue:
 * the agent hands one in (report_progress with phase "plan" and `concept`)
 * before the write tools open. The schema, its validator and the starting
 * directions are L6's (lib/storelib-ai/library/concept.ts); this file only
 * reads an untrusted model answer into it.
 */
import { validateConcept, type VisualConcept } from "@/lib/storelib-ai/library/concept"

export type { VisualConcept }
export { VISUAL_CONCEPT_JSON_SCHEMA as CONCEPT_SCHEMA, describeConcept, suggestDirections } from "@/lib/storelib-ai/library/concept"

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

/** The concept as given, or what is wrong with it (L6's validateConcept, in its words). Pure. */
export function readConcept(raw: unknown): { ok: true; concept: VisualConcept } | { ok: false; missing: string[] } {
  if (!isObj(raw)) return { ok: false, missing: ["concept: an object with name, mood, styles, typeSystem, palette, layout, motion, imagery, signatureMoves"] }
  const r = raw as unknown as VisualConcept
  let errors: string[]
  try {
    errors = validateConcept(r)
  } catch {
    errors = ["concept: name, mood, styles, typeSystem, palette, layout, motion, imagery and signatureMoves are all required"]
  }
  if (!isObj(r.imagery) || !Array.isArray((r.imagery as { avoid?: unknown }).avoid)) errors.push("imagery.avoid: a list (may be empty)")
  if (!isObj(r.motion) || !Array.isArray((r.motion as { moves?: unknown }).moves)) errors.push("motion.moves: a list (may be empty)")
  /* Kept bounded: the concept rides in every checkpoint and resume. */
  const text = JSON.stringify(r)
  if (text.length > 8_000) errors.push("concept: keep it short (under 8000 characters)")
  if (errors.length) return { ok: false, missing: errors }
  return { ok: true, concept: JSON.parse(text) as VisualConcept }
}
