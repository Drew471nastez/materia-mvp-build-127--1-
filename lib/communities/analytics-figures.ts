/**
 * ===========================================================================
 *  A COMMUNITY'S FIGURES, AND THE FIVE IN THE ROW
 * ===========================================================================
 * The figures a community's Analytics chart can show
 * (components/community/creator/analytics-section.tsx), and which five of
 * them its row holds. Round 38, the owner: "too many stats in the chart,
 * 1 2 3 4 5 6 7 8. I want to limit things up to 5 maximum." The others are
 * in the menu at the row's end. Pure, so the rules are tested on their own
 * (tests/community-analytics-r38.test.ts).
 */

/** The figures the chart can show, in the order of the row. */
export type FigureKey = "members" | "joined" | "active" | "visitors" | "joinRate" | "engagement" | "churn" | "revenue"
export const FIGURES: readonly FigureKey[] = ["members", "joined", "active", "visitors", "joinRate", "engagement", "churn", "revenue"]

/** At most this many figures in the row; the rest are in the menu at its end. */
export const SHOWN_MAX = 5

/**
 * The five a community starts with, from the figures its answer has
 * (`available`): Members, Active members, Visitors, Engagement, and Revenue
 * for a community that sells or Join rate for one that does not; filled up
 * from the others when one of these is not counted yet. In the order of
 * FIGURES, so the row reads the way it always has.
 */
export function defaultShown(available: readonly FigureKey[], sells: boolean): FigureKey[] {
  return pickShown(available, ["members", "active", "visitors", "engagement", sells ? "revenue" : "joinRate"]).sort((a, b) => FIGURES.indexOf(a) - FIGURES.indexOf(b))
}

/**
 * The row on screen: the owner's own when they chose one (`saved`, each
 * figure still there kept in its place), filled up from the defaults; a
 * figure opened from the address (`open`, #churn) that is not among them
 * stands in the last place.
 */
export function shownFigures(available: readonly FigureKey[], saved: readonly string[] | null, sells: boolean, open: FigureKey | null): FigureKey[] {
  const base = saved && saved.length ? pickShown(available, [...saved.filter((k): k is FigureKey => FIGURES.includes(k as FigureKey)), ...defaultShown(available, sells)]) : defaultShown(available, sells)
  if (open && available.includes(open) && !base.includes(open)) base[base.length - 1] = open
  return base
}

function pickShown(available: readonly FigureKey[], wanted: readonly FigureKey[]): FigureKey[] {
  const out: FigureKey[] = []
  for (const k of [...wanted, ...available]) {
    if (out.length >= SHOWN_MAX) break
    if (available.includes(k) && !out.includes(k)) out.push(k)
  }
  return out
}
