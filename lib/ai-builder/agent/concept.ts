/**
 * ===========================================================================
 *  THE VISUAL CONCEPT, DECIDED BEFORE ANY FILE IS WRITTEN
 * ===========================================================================
 * A new website starts from an art direction, not from a section catalogue:
 * the agent must hand one in (report_progress with phase "plan" and a
 * `concept`) before the write tools open. The fields are L6's
 * (lib/storelib-ai/library/entries/core/core-visual-concept-first.md):
 * name, mood, type system, palette, layout principles, motion stance,
 * imagery, signature moves.
 *
 * TODO(L6 merge): L6 owns the schema in lib/storelib-ai/library/concept.ts.
 * Until it lands this is the same shape, checked here; when it lands,
 * `readConcept` should call L6's validator and this file keeps only the
 * re-export.
 */

export interface VisualConcept {
  /** Two to four words about the idea, not the business. */
  name: string
  /** Three adjectives pulling in different directions. */
  mood: string[]
  type: { display: string; body: string; scale?: string; rule?: string }
  palette: { background: string; text: string; accent: string; accentUse?: string }
  layout: string[]
  motion: { stance: "none" | "subtle" | "expressive" | "cinematic"; what?: string }
  imagery: string
  signature: string[]
  /** The pages the concept plans, by key. */
  pages?: string[]
}

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
const list = (v: unknown, max = 6): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, max) : [])

/** The concept as given, or what is missing from it. Pure. */
export function readConcept(raw: unknown): { ok: true; concept: VisualConcept } | { ok: false; missing: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const type = (r.type && typeof r.type === "object" ? r.type : {}) as Record<string, unknown>
  const palette = (r.palette && typeof r.palette === "object" ? r.palette : {}) as Record<string, unknown>
  const motion = (r.motion && typeof r.motion === "object" ? r.motion : {}) as Record<string, unknown>
  const stance = ["none", "subtle", "expressive", "cinematic"].includes(String(motion.stance)) ? (motion.stance as VisualConcept["motion"]["stance"]) : null
  const concept: VisualConcept = {
    name: str(r.name, 60),
    mood: list(r.mood, 4),
    type: { display: str(type.display, 60), body: str(type.body, 60), ...(str(type.scale) ? { scale: str(type.scale, 40) } : {}), ...(str(type.rule) ? { rule: str(type.rule) } : {}) },
    palette: { background: str(palette.background, 40), text: str(palette.text, 40), accent: str(palette.accent, 40), ...(str(palette.accentUse) ? { accentUse: str(palette.accentUse) } : {}) },
    layout: list(r.layout, 4),
    motion: { stance: stance ?? "subtle", ...(str(motion.what) ? { what: str(motion.what) } : {}) },
    imagery: str(r.imagery, 300),
    signature: list(r.signature, 3),
    ...(list(r.pages, 12).length ? { pages: list(r.pages, 12) } : {}),
  }
  const missing: string[] = []
  if (!concept.name) missing.push("name")
  if (concept.mood.length < 2) missing.push("mood (three adjectives)")
  if (!concept.type.display || !concept.type.body) missing.push("type.display and type.body")
  if (!concept.palette.background || !concept.palette.text || !concept.palette.accent) missing.push("palette.background, palette.text, palette.accent")
  if (!concept.layout.length) missing.push("layout (two or three principles)")
  if (!stance) missing.push("motion.stance (none, subtle, expressive or cinematic)")
  if (!concept.imagery) missing.push("imagery")
  if (!concept.signature.length) missing.push("signature (one to three moves)")
  return missing.length ? { ok: false, missing } : { ok: true, concept }
}

/** The JSON schema of `concept` for the tool spec. */
export const CONCEPT_SCHEMA = {
  type: "object",
  description: "The visual concept. Required once, before any write, when making a new website.",
  properties: {
    name: { type: "string", description: "Two to four words about the idea, not the business." },
    mood: { type: "array", items: { type: "string" }, description: "Three adjectives that pull in different directions." },
    type: { type: "object", properties: { display: { type: "string" }, body: { type: "string" }, scale: { type: "string" }, rule: { type: "string" } }, required: ["display", "body"] },
    palette: { type: "object", properties: { background: { type: "string" }, text: { type: "string" }, accent: { type: "string" }, accentUse: { type: "string" } }, required: ["background", "text", "accent"] },
    layout: { type: "array", items: { type: "string" } },
    motion: { type: "object", properties: { stance: { type: "string", enum: ["none", "subtle", "expressive", "cinematic"] }, what: { type: "string" } }, required: ["stance"] },
    imagery: { type: "string" },
    signature: { type: "array", items: { type: "string" } },
    pages: { type: "array", items: { type: "string" }, description: "Page keys the site will have." },
  },
  required: ["name", "mood", "type", "palette", "layout", "motion", "imagery", "signature"],
} as const
