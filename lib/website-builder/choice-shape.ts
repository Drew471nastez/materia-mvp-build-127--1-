/**
 * ===========================================================================
 *  ONE TO THREE CHOICES ARE BUTTONS, FOUR OR MORE ARE A DROPDOWN
 * ===========================================================================
 * The rule every select setting in the sidebar follows, whoever wrote the
 * schema: a Storelib theme, an imported theme's settings_schema.json or
 * section schema, Website settings, or a panel of our own.
 *
 *   1 to 3 options   a segmented control: every choice visible, one press
 *                    ("Vertical | Horizontal", "Top | Center | Bottom")
 *   4 or more        the dropdown
 *   labels too long  the dropdown, even with 3 or fewer: a segment that cuts
 *                    its word in half is worse than one more press
 *
 * Whether the labels fit is decided here from an estimate of their width, so
 * the first paint (and the server's) is already right, and again by the
 * control once it can measure the real text in the real track
 * (components/website-builder/editor/controls/choice-control.tsx).
 */

export const SEGMENTED_MAX_OPTIONS = 3

/** The sidebar's track at its narrowest: a 300px column less its 16px gutters. */
export const SIDEBAR_TRACK_WIDTH = 268
/** The track's inner padding, each side. */
export const TRACK_PAD = 3
/** A segment's own padding, each side, around its words. */
export const SEGMENT_PAD = 8
/** The segment's type: 12.5px Inter, medium. */
export const SEGMENT_FONT_PX = 12.5

export type ChoiceShape = "segments" | "dropdown"

export interface ChoiceOption {
  label: string
  value: string
}

/**
 * Inter's advance widths in em, coarse but on the safe side: narrow letters,
 * wide letters, capitals, digits and everything else. Enough to tell "Top"
 * from "Open a search window" without a browser.
 */
function charEm(ch: string): number {
  if (/[iljtf.,:;'|!()\[\] ]/.test(ch)) return 0.3
  if (/[mwMW]/.test(ch)) return 0.86
  if (/[A-Z]/.test(ch)) return 0.68
  if (/[0-9]/.test(ch)) return 0.6
  return 0.56
}

/** About how wide a label is drawn at the segment's size, in px. */
export function estimateLabelWidth(label: string, fontPx = SEGMENT_FONT_PX): number {
  let em = 0
  for (const ch of label) em += charEm(ch)
  return em * fontPx
}

/** The room one segment gives its words, in a track this wide split this many ways. */
export function segmentRoom(trackWidth: number, count: number): number {
  if (count < 1) return 0
  return (trackWidth - TRACK_PAD * 2) / count - SEGMENT_PAD * 2
}

/** Whether these widths, each its label's, fit their segments in a track this wide. */
export function labelsFit(widths: number[], trackWidth: number): boolean {
  if (widths.length === 0) return false
  const room = segmentRoom(trackWidth, widths.length)
  return widths.every((w) => w <= room)
}

/**
 * Buttons or a dropdown, for these options in a track this wide. Pass
 * `widths` when the real text has been measured; otherwise they are
 * estimated.
 */
export function choiceShape(
  options: readonly ChoiceOption[],
  trackWidth = SIDEBAR_TRACK_WIDTH,
  widths?: number[],
): ChoiceShape {
  if (options.length < 1 || options.length > SEGMENTED_MAX_OPTIONS) return "dropdown"
  const w = widths && widths.length === options.length ? widths : options.map((o) => estimateLabelWidth(o.label))
  return labelsFit(w, trackWidth) ? "segments" : "dropdown"
}

/** The option a press of an arrow key lands on: the next or previous one, round the ends. */
export function stepChoice(count: number, from: number, key: string): number | null {
  if (count < 1) return null
  const at = from < 0 ? 0 : from
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return from < 0 ? 0 : (at + 1) % count
    case "ArrowLeft":
    case "ArrowUp":
      return from < 0 ? count - 1 : (at - 1 + count) % count
    case "Home":
      return 0
    case "End":
      return count - 1
  }
  return null
}
