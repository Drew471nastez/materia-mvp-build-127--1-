/**
 * ===========================================================================
 *  REFERENCES AS A PROMPT BLOCK
 * ===========================================================================
 * The compact text the agent's plan phase (and any other AI surface) reads
 * about the references chosen for it. What it says, and does not:
 *
 *   - each reference by a neutral label [R1], [R2]..., its pattern title,
 *     and only the fields that have something in them;
 *   - which attached image belongs to which reference, when images ride
 *     along (the provider puts pictures before the words, so "image 1" is
 *     the first picture of the turn);
 *   - never the brand a design system analysis was made from, never a
 *     source URL: provenance stays in the record;
 *   - the rule on top: learn principles, blend several, never reproduce a
 *     layout, logo, photo, wordmark or words.
 *
 * Bounded: each reference is clipped and the whole block has a ceiling.
 * Pure, browser safe.
 */
import type { DesignReference } from "./types"

export const REFERENCES_PROMPT_MAX_CHARS = 6_000
const PER_REFERENCE_MAX = 1_400

const RULE =
  "VISUAL REFERENCES (chosen for this brief; analysis only). Take PRINCIPLES from them: hierarchy, crop, rhythm, type character, how colour is spent, how the action is placed. Blend several into something new that fits this creator. Never reproduce a reference's layout, logo, wordmark, photographs, illustrations, words or a brand's identity, and never name a reference on the site. Motion described for a still screenshot is a suggestion, not something that was seen."

function line(label: string, value: string | undefined | null): string {
  const v = (value ?? "").trim()
  return v ? `  ${label}: ${v}` : ""
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** One reference as a few lines. `imageIndex` is its picture's position in the turn (1 based), when it has one attached. */
export function referenceLines(r: DesignReference, label: string, imageIndex?: number): string {
  const kind = r.kind === "system" ? "design system analysis" : r.kind === "style" ? "style" : r.kind === "principle" ? "principle" : r.kind === "section" ? "page section" : "page"
  const fit = r.industries.length ? `; fits ${r.industries.slice(0, 4).join(", ")}` : ""
  const pic = imageIndex ? ` [image ${imageIndex} above]` : ""
  const palette = r.palette.colors.length ? `${r.palette.mode}, ${r.palette.colors.map((c) => `${c.role} ${c.hex}`).join(", ")}${r.palette.strategy ? `. ${r.palette.strategy}` : ""}` : r.palette.strategy
  const type = [r.type.display && `display ${r.type.display}`, r.type.body && `body ${r.type.body}`, r.type.strategy].filter(Boolean).join("; ")
  const layout = [r.layout.topology, r.layout.hero && `hero: ${r.layout.hero}`, r.layout.grid && `grid: ${r.layout.grid}`, r.layout.rhythm && `rhythm: ${r.layout.rhythm}`].filter(Boolean).join("; ")
  const motion = [r.motion.character, r.motion.ideas.length ? `ideas: ${r.motion.ideas.join(", ")}` : ""].filter(Boolean).join("; ")
  const text = [
    `[${label}] ${r.title} (${kind}${fit})${pic}`,
    line("What", r.summary),
    line("Mood", r.tone.join(", ")),
    line("Palette", palette),
    line("Type", type),
    line("Layout", layout),
    line("Imagery", r.imagery),
    line(r.motion.evidence === "observed" ? "Motion" : "Motion (suggested)", motion),
    line("Details", r.details.join("; ")),
    line("Borrow", r.borrow.join("; ")),
    line("Do not", r.avoid.join("; ")),
    line("Fits badly", r.fitsPoorly.join(", ")),
  ]
    .filter(Boolean)
    .join("\n")
  return clip(text, PER_REFERENCE_MAX)
}

/**
 * THE SHARED NAME (round O): the chosen references as one prompt block.
 * `withImages` lists the ids whose pictures are attached to the same turn,
 * in attachment order. "" when there is nothing to say.
 */
export function referencesForPrompt(refs: readonly DesignReference[], opts: { withImages?: readonly string[]; maxChars?: number } = {}): string {
  if (!refs.length) return ""
  const max = Math.max(500, Math.min(20_000, opts.maxChars ?? REFERENCES_PROMPT_MAX_CHARS))
  const images = opts.withImages ?? []
  const parts: string[] = [RULE]
  let used = RULE.length
  for (const [i, r] of refs.entries()) {
    const at = images.indexOf(r.id)
    const block = referenceLines(r, `R${i + 1}`, at >= 0 ? at + 1 : undefined)
    if (used + block.length + 2 > max) {
      const short = `[R${i + 1}] ${r.title}: ${clip(r.summary, 200)}`
      if (used + short.length + 2 > max) break
      parts.push(short)
      used += short.length + 2
      continue
    }
    parts.push(block)
    used += block.length + 2
  }
  return parts.join("\n\n")
}
