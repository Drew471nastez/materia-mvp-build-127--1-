/**
 * ===========================================================================
 *  THE INTEGRATIONS DIRECTORY'S ORDER (round 30)
 * ===========================================================================
 * Two orders the owner set, kept here as plain functions so the directory
 * (components/app/settings/integrations-directory.tsx), its probe and its
 * tests read the same ones.
 *
 *   THE PILLS     All, Installed, Reviews, Analytics, Storelib apps,
 *                 Advertising, Email marketing, Automation, then every other
 *                 category in the catalog's order (Shipping, Print on
 *                 demand, Dropshipping, Fulfillment, Suppliers). Installed
 *                 moved up beside All in round K4, when it stopped being a
 *                 list of its own above the cards.
 *
 *   ALL, MIXED    "Storelib's own apps all come first in a block." Now every
 *                 card sits in a lane (its category, or Storelib apps for one
 *                 of Storelib's own that has none) and the lanes are woven
 *                 together: the first card of every lane, in the pills'
 *                 order, then the rest spread evenly through the list, and
 *                 never two of one lane side by side while another lane has
 *                 a card left to put between them. The cards that work today
 *                 are woven first and the Coming soon ones after them, so
 *                 Coming soon is still last.
 *
 * A lane keeps its own order inside the weave, so the cards of one category,
 * read off the woven list, are that category in its own order: Storelib's
 * own first, then the services that work, then Coming soon. That is why a
 * pill can still pick its cards from the one list (no card ever moves when
 * a pill is pressed, round 29) and each category still reads sensibly.
 */
import { CATEGORY_ORDER, type IntegrationCategory } from "@/lib/integrations/catalog"

export type DirectoryPill = "all" | "installed" | "storelib" | IntegrationCategory

/** The pills the owner placed, in their order. Every other category follows in CATEGORY_ORDER. */
export const PILL_HEAD: DirectoryPill[] = ["all", "installed", "reviews", "analytics", "storelib", "advertising", "email", "automation"]

/** Every pill in order. A category with no card in it has no pill; All, Installed and Storelib apps always have one. */
export function pillOrder(cardsIn: (pill: DirectoryPill) => number): DirectoryPill[] {
  const rest = CATEGORY_ORDER.filter((c) => !PILL_HEAD.includes(c))
  return [...PILL_HEAD, ...rest].filter((p) => p === "all" || p === "installed" || p === "storelib" || cardsIn(p) > 0)
}

/** A card's lane in the weave: its category, or "storelib" for one of Storelib's own apps that has none. */
export type Lane = IntegrationCategory | "storelib"

/** The lanes in the pills' order, so the first round reads like the pills do. */
export const LANE_ORDER: Lane[] = [...PILL_HEAD.filter((p): p is Lane => p !== "all" && p !== "installed"), ...CATEGORY_ORDER.filter((c) => !PILL_HEAD.includes(c))]

/**
 * Weave cards from their lanes. `items` are in each lane's own order already;
 * the result is deterministic for the same input.
 */
export function weave<T>(items: T[], laneOf: (item: T) => Lane): T[] {
  const lanes = new Map<Lane, T[]>()
  for (const item of items) {
    const lane = laneOf(item)
    const list = lanes.get(lane)
    if (list) list.push(item)
    else lanes.set(lane, [item])
  }
  const rank = (lane: Lane) => {
    const at = LANE_ORDER.indexOf(lane)
    return at < 0 ? LANE_ORDER.length : at
  }
  /* The first of every lane at 0, the rest at their share of the lane: spread evenly, whatever the lane's size. */
  const placed: { item: T; lane: Lane; key: number; rank: number; at: number }[] = []
  for (const [lane, list] of lanes) list.forEach((item, at) => placed.push({ item, lane, key: at === 0 ? 0 : at / list.length, rank: rank(lane), at }))
  placed.sort((a, b) => a.key - b.key || a.rank - b.rank || a.at - b.at)
  /* Two of one lane side by side: the next card of another lane goes between them. Only cards of that same lane are passed over, so no lane's own order changes. */
  for (let k = 1; k < placed.length; k++) {
    if (placed[k].lane !== placed[k - 1].lane) continue
    const j = placed.findIndex((p, i) => i > k && p.lane !== placed[k - 1].lane)
    if (j < 0) break
    const [moved] = placed.splice(j, 1)
    placed.splice(k, 0, moved)
  }
  return placed.map((p) => p.item)
}
