/**
 * ===========================================================================
 *  WHERE THE RUN IS, IN WORDS A CREATOR READS WHILE THEY WAIT
 * ===========================================================================
 * The chat stream (application/x-ndjson, one JSON object per line, from
 * app/api/website-builder/themes/[installId]/agent/route.ts) already carries
 * a `step` per tool call. Those are the record; this is the headline. A
 * `progress` event says which stage of the job the run is in, at each real
 * step and only then:
 *
 *   phase       label                          sent when
 *   ─────────   ────────────────────────────   ─────────────────────────────
 *   reading     Reading the page               the page, theme and selection
 *                                              are put in front of the model
 *   reading     Looking at your picture        a picture came with the request
 *   products    Looking at your products       the catalogue is read
 *   planning    Planning                       the model is asked what to do
 *   writing     Writing <section name>         the first change to a section,
 *                                              and again when it moves on to
 *                                              another one
 *   checking    Checking contrast              the review reads the result
 *   saving      Saving <section name>          a section's file is saved
 *   done        Done                           the run finished; `detail` is
 *                                              one sentence of what changed,
 *                                              `sections` the sections it
 *                                              changed, by name
 *
 * THE CONTRACT FOR WHOEVER DRAWS IT: render `label` as it comes, replace the
 * previous progress line with each new one, and on `done` show `detail` and
 * `sections`. An unknown `phase` is still drawn by its label, so a stage
 * added here later needs no change there. Everything is plain text; nothing
 * in it is markup.
 */

export type ProgressPhase = "reading" | "products" | "planning" | "writing" | "checking" | "saving" | "done"

export interface ProgressEvent {
  type: "progress"
  phase: ProgressPhase
  /** What to show, as it is: "Reading the page", "Writing the FAQ". */
  label: string
  /** A second line where there is one: on `done`, the one-sentence summary. */
  detail?: string
  /** On `done`: the sections this run changed, by the names the creator sees. */
  sections?: string[]
}

export const PROGRESS_LABELS = {
  page: "Reading the page",
  picture: "Looking at your picture",
  products: "Looking at your products",
  planning: "Planning",
  checking: "Checking contrast",
  done: "Done",
} as const

export function progress(phase: ProgressPhase, label: string, extra: { detail?: string; sections?: string[] } = {}): ProgressEvent {
  const event: ProgressEvent = { type: "progress", phase, label }
  if (extra.detail) event.detail = extra.detail
  if (extra.sections?.length) event.sections = extra.sections
  return event
}

/** "Writing the FAQ", named the way the sidebar names it. */
export function writingLabel(sectionName: string): string {
  return `Writing ${sectionName}`
}

export function savingLabel(sectionName: string): string {
  return `Saving ${sectionName}`
}

/**
 * Says each stage once, and a writing line again only when the section being
 * written changes: ten changes to the same FAQ are one "Writing the FAQ".
 */
export class ProgressTrail {
  private last = ""

  next(event: ProgressEvent): ProgressEvent | null {
    const key = `${event.phase}:${event.label}`
    if (key === this.last) return null
    this.last = key
    return event
  }
}
