"use client"

import { useEffect, useMemo, useState } from "react"

import { HeroSlides } from "./hero-slides"
import { ListingRow } from "./listing-row"
import { MoreListings } from "./more-listings"
import { ShopByCategory } from "./shop-by-category"
import { YouMightBeInto } from "./you-might-be-into"
import { getRecentViews, signalsFrom, subscribeRecentViews, type RecentView } from "@/lib/marketplace/recent-views"

/**
 * ===========================================================================
 *  THE DESKTOP HOME PAGE
 * ===========================================================================
 *
 * It was a banner, one grid, and a pill rail — the same hundred listings in the
 * same order for everybody, on every visit. This is the shape a marketplace
 * home page actually has: a promotion, then what you were looking at, then what
 * that suggests, then a way in by category, then everything else.
 *
 *   hero                 three slides, two of them real listings
 *   based on your views  what is like the things you opened
 *   you might be into    the searches those things imply
 *   recently viewed      the things themselves
 *   suggested for you    three rows, the wider net
 *   by category          five doors
 *   more listings        everything left, two rows at a time
 *
 * ---------------------------------------------------------------------------
 * EVERY ROW IS DERIVED, AND NOTHING IS FETCHED
 * ---------------------------------------------------------------------------
 * The feed already hands this component the page's listings and the device
 * already knows what was viewed, so all seven sections are one array being cut
 * seven ways. No endpoint, no waterfall, no spinner — and the personalised rows
 * are correct on the first frame after hydration rather than a second later.
 *
 * The cost of that is honesty about the ranking: this is recency-weighted
 * overlap on brand and category, not a recommender. It is written as arithmetic
 * you can read rather than as a black box, and when it has nothing to go on it
 * says so by drawing fewer sections rather than by inventing worse ones.
 */
/** Cards per row on a desktop, and the number every exclusion below counts in.
 *  Stated once here rather than repeated as 5, 15 and 5 — they are one fact. */
const ROW = 5

export function DesktopHome({ products }: { products: any[] }) {
  /**
   * SERVER AND FIRST CLIENT RENDER SEE NO HISTORY, deliberately.
   *
   * localStorage does not exist on the server, so seeding this from it in a
   * lazy initialiser is a hydration mismatch — React would discard the server
   * HTML for the whole page. Empty first, filled in the effect, which costs one
   * extra paint on a section that is below the hero anyway.
   */
  const [views, setViews] = useState<RecentView[]>([])
  useEffect(() => {
    const read = () => setViews(getRecentViews())
    read()
    return subscribeRecentViews(read)
  }, [])

  const sections = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]))
    const viewedIds = new Set(views.map((v) => v.id))

    /** The listings themselves, in the order they were opened. Ones that are no
     *  longer published simply fall out — a sold jumper in "recently viewed" is
     *  a link to a page that will not have it. */
    const recentlyViewed = views.map((v) => byId.get(v.id)).filter(Boolean)

    const brandScores = new Map(signalsFrom(views, "brand").map((s) => [s.value.toLowerCase(), s.weight]))
    const subScores = new Map(signalsFrom(views, "subcategory").map((s) => [s.value.toLowerCase(), s.weight]))
    const catScores = new Map(signalsFrom(views, "category").map((s) => [s.value.toLowerCase(), s.weight]))

    /**
     * HOW CLOSE THIS LISTING IS TO WHAT YOU HAVE BEEN LOOKING AT.
     *
     * Brand outweighs the exact kind of thing, which outweighs the department:
     * somebody looking at Carhartt trousers is more likely to want a Carhartt
     * jacket than another pair of trousers by anybody, and that ordering is the
     * single thing this ranking gets right that "same category" does not.
     */
    const affinity = (p: any): number => {
      const brand = (p?.brand || "").toLowerCase()
      const sub = (p?.subcategory || "").toLowerCase()
      const cat = (p?.category || "").toLowerCase()
      return (
        (brandScores.get(brand) ?? 0) * 3 +
        (subScores.get(sub) ?? 0) * 2 +
        (catScores.get(cat) ?? 0) * 1
      )
    }

    const candidates = products.filter((p) => !viewedIds.has(p.id))

    const basedOnViews = candidates
      .map((p) => ({ p, score: affinity(p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p)

    /**
     * SUGGESTED FOR YOU — the wider net, and it is NOT the same list again.
     *
     * Everything the row above used is excluded, so the two sections cannot be
     * eighteen cards restating six. What is left keeps whatever affinity it has
     * as a tie-break and falls back to the catalogue's own order, which is
     * newest-first — so a visitor with no history gets "the newest things",
     * which is the correct answer to "suggested for you" when nothing is known.
     */
    // FIVE and FIFTEEN, matching what the rows actually draw — see PER_ROW in
    // listing-row.tsx. When these two numbers drift from the grid, the last
    // section either repeats a card that is already on the screen or hides one
    // that never made it there, and both are invisible until somebody counts.
    const usedInBased = new Set(basedOnViews.slice(0, ROW).map((p) => p.id))
    const suggested = candidates
      .filter((p) => !usedInBased.has(p.id))
      .map((p, i) => ({ p, score: affinity(p), i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.p)

    /** What the last section shows: everything not already on the screen. */
    const alreadyShown = new Set<string>([
      ...usedInBased,
      ...suggested.slice(0, ROW * 3).map((p) => p.id),
      ...recentlyViewed.slice(0, ROW).map((p: any) => p.id),
    ])
    const rest = products.filter((p) => !alreadyShown.has(p.id))

    return { recentlyViewed, basedOnViews, suggested, rest }
  }, [products, views])

  return (
    // `home-arrive` is a 160ms opacity fade over the loading shell, which is
    // otherwise replaced in a single commit — a hard cut on two thousand pixels
    // of content. See the note in app/globals.css.
    <div className="home-arrive hidden md:block">
      <HeroSlides listings={products} />

      {/* Personal first. Somebody who has been here before should see what they
          were doing before they see what we would like them to do. */}
      <ListingRow
        title="Bazat pe vizualizările tale recente"
        items={sections.basedOnViews}
        rows={1}
        href="/?q="
        seeMoreLabel="Vezi mai multe"
      />

      <YouMightBeInto views={views} catalogue={products} />

      <ListingRow title="Vizualizate recent" items={sections.recentlyViewed} rows={1} />

      <ListingRow
        title="Sugestii pentru tine"
        items={sections.suggested}
        rows={3}
        href="/?q="
        seeMoreLabel="Vezi mai multe"
      />

      <ShopByCategory catalogue={products} />

      <MoreListings items={sections.rest.length > 0 ? sections.rest : products} />
    </div>
  )
}
