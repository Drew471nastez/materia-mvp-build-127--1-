import { normalizeCategoryToId } from "@/lib/marketplace/categories"

/**
 * ===========================================================================
 *  WHAT THIS ACCOUNT HAS SHOWN AN INTEREST IN, AND WHAT THE PAGE DOES WITH IT
 * ===========================================================================
 * NO SERVER IMPORTS IN HERE. The Explore client component needs the shape,
 * the threshold and the ranking, and a module that pulls in
 * lib/supabase/server cannot be in a client bundle — Turbopack fails the
 * build on it, which is how this came to be two files. The reading of the
 * rows lives in lib/explore/read-interests, which is server-only.
 *
 * Enough to turn "All" into "For you" and to put three of somebody's own
 * categories in the pill row, or not enough, in which case nothing changes
 * and they get the row everybody else gets.
 *
 * ---------------------------------------------------------------------------
 *  WHAT IS ACTUALLY RECORDED, AND WHAT IS NOT
 * ---------------------------------------------------------------------------
 * The ask named four sources: what they bought, which creators they have
 * dealt with, what they browsed, and what they searched for. Two of those
 * exist per account and two do not, and it is worth being exact about which:
 *
 *   BOUGHT / OWNED    entitlements.buyer_id, orders.buyer_id      yes
 *   SAVED             wishlist_items.user_id                      yes
 *   CREATORS          subscribers, keyed by creator_id + email    yes
 *   BROWSED           analytics_events has visitor_id and         NO
 *                     session_id and no user_id at all, so a
 *                     view is anonymous by construction
 *   SEARCHED          not written down anywhere, by anyone        NO
 *
 * So this is built from the three that exist. Tying views to accounts would
 * mean either a new column on every analytics row or a new table, plus a
 * write on every product page; that is a migration and a decision about what
 * to record about people, and neither belongs in a change nobody asked for.
 *
 * ---------------------------------------------------------------------------
 *  WEIGHTS
 * ---------------------------------------------------------------------------
 * Paying for something says more than saving it for later, and saving it says
 * more than the creator having your email. The numbers are small on purpose:
 * this decides which three pills to offer, not what somebody is allowed to
 * see, so being roughly right is the whole requirement.
 */
export const WEIGHT = {
  owned: 3,
  wishlisted: 2,
  subscribed: 1,
} as const

/**
 * "Enough" is three distinct products and at least one category that two of
 * them share. One purchase is not a taste, and three purchases spread across
 * three unrelated categories is not one either — offering somebody a pill for
 * a category they touched once is worse than offering them nothing.
 */
export const MIN_PRODUCTS = 3
export const MIN_TOP_SCORE = WEIGHT.wishlisted * 2

export interface Interests {
  /** Category ids, strongest first. Never more than a handful. */
  categories: string[]
  /** Creators this person has bought from or subscribed to. */
  creatorIds: string[]
  /** Products they already have, so the page can stop selling them back. */
  ownedProductIds: string[]
  /** Everything that fed the guess, for the threshold and for the logs. */
  productCount: number
  /** Whether there is enough here to change what anybody sees. */
  enough: boolean
}

export const EMPTY_INTERESTS: Interests = {
  categories: [],
  creatorIds: [],
  ownedProductIds: [],
  productCount: 0,
  enough: false,
}

/**
 * How well a product answers what this person has shown an interest in.
 *
 * Their own creators first, because "another thing by someone you already
 * bought from" is the strongest recommendation this data can make. Then their
 * categories, in the order they scored. Everything else keeps its place at
 * the bottom rather than being removed: a For you page that runs out after
 * nine products is worse than one that carries on into the general catalogue.
 */
export function interestScore(
  product: { category?: string | null; categoryName?: string | null; creator_id?: string | null; creatorId?: string | null },
  interests: Interests,
): number {
  if (!interests.enough) return 0
  let score = 0
  const creatorId = product.creator_id ?? product.creatorId ?? null
  if (creatorId && interests.creatorIds.includes(creatorId)) {
    score += 100 - interests.creatorIds.indexOf(creatorId)
  }
  const category = normalizeCategoryToId(product.category || product.categoryName || "")
  const rank = interests.categories.indexOf(category)
  if (rank >= 0) score += 50 - rank
  return score
}


/**
 * ===========================================================================
 *  THE PILL ROW, AS IDS
 * ===========================================================================
 * Pure, and in here rather than in the component, so the rule can be driven
 * by a test instead of read off a screenshot. The component owns what a pill
 * LOOKS like; this owns which ones there are and in what order.
 *
 * `general` is the row everybody gets, "all" included. `known` is every
 * category that exists, because an interest in something the row has no pill
 * for is still an interest and should be offered.
 */
export const FOR_YOU_ID = "for-you"
export const INTEREST_PILL_LIMIT = 3

export interface PillRow {
  /** The first pill: clears the category. "All", or "For you". */
  firstId: string
  firstLabel: string
  /** The rest, in order, not counting the first. */
  ids: string[]
  /** Which of `ids` were chosen from this account's own history. */
  personalised: string[]
}

export function buildPillRow(
  interests: Interests,
  general: readonly string[],
  known: readonly string[],
): PillRow {
  const rest = general.filter((id) => id !== "all")

  if (!interests.enough) {
    return { firstId: "all", firstLabel: "All", ids: [...rest], personalised: [] }
  }

  /*
    Three of theirs, then the general row with those three taken out, cut to
    the length the row was. The row does not grow: nine pills for everybody,
    so it does not change shape depending on who is looking at it.
  */
  const personalised = interests.categories
    .filter((id) => known.includes(id) && id !== "all" && id !== "other")
    .slice(0, INTEREST_PILL_LIMIT)

  const ids = [...personalised, ...rest.filter((id) => !personalised.includes(id))].slice(0, rest.length)

  return { firstId: FOR_YOU_ID, firstLabel: "For you", ids, personalised }
}
