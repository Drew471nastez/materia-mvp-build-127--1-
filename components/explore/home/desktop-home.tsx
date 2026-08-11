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
 *   based on your views  what is like the things you opened     — hidden if none
 *   recently viewed      the things themselves                  — hidden if none
 *   suggested for you    three rows, the wider net
 *   you might be into    queries worth trying next              — never empty
 *   by category          five doors
 *   more listings        everything left, two rows at a time
 *
 * The two marked "hidden if none" are not drawn AT ALL on a device with no
 * history — not as a heading, not as a placeholder. So a first visit is four
 * sections and every one of them is full, and a second visit is six.
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

/**
 * HOW MUCH BROWSING THE TWO PERSONAL ROWS WAIT FOR.
 *
 * (Their headings are written once each, below, and deliberately not quoted up
 * here — the guards in tests/desktop-home.test.ts find those sections by
 * searching this file for their titles, and a second copy in a comment is the
 * one they find first.)
 *
 * They used to appear on the FIRST listing anybody opened, and that is where
 * both of them are at their worst. The recently-viewed row with one card in it
 * is four fifths empty — the grid is five across, so a single view draws one
 * square and four columns of white — and it is telling somebody something they
 * already know, about a page they were on ten seconds ago.
 *
 * The row above it is worse, because it is FULL: one view of one jumper is
 * enough for the ranking to produce five cards, and it puts a heading claiming
 * to know what you are into over a row derived from a single click. The heading
 * writes a cheque the signal cannot cash, and a recommendation that is obviously
 * guessing is worse for trust than no recommendation at all.
 *
 * FIVE is not an arbitrary threshold: it is one full row of the grid below, so
 * the first time either row is drawn it is drawn complete, and it is enough
 * browsing for `signalsFrom` to have a brand or a category with more than one
 * vote behind it.
 *
 * Counted on the HISTORY rather than on either row's own contents, because that
 * is what "collected" means and it is the one number both rows depend on — the
 * second row can produce a hundred candidates from a single view, so gating it
 * on its own length would gate nothing.
 */
const MIN_HISTORY = 5

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

  /**
   * Whether this device has browsed enough for the two personal rows to exist.
   *
   * Read from `views` and not from `sections.recentlyViewed`: a view whose
   * listing has since sold falls out of that array, and somebody who has opened
   * eight things should not lose the rows because two of them are gone. What was
   * collected is what was collected.
   */
  const personal = views.length >= MIN_HISTORY

  return (
    /* NO ENTRANCE ANIMATION ON THIS CONTAINER, deliberately.
     *
     * There was a 160ms opacity fade here to cover the swap from the loading
     * shell. It was also promoting two thousand pixels of page to a composited
     * layer at the exact moment that page changes height — and a layer that
     * grows after it is rasterised is how the footer ended up painted across
     * the middle of the listings. The shell is the right shape now, so there is
     * nothing left for a fade to hide. See app/globals.css. */
    <div className="hidden md:block">
      <HeroSlides listings={products} />

      {/* Personal first. Somebody who has been here before should see what they
          were doing before they see what we would like them to do.

          BOTH OF THESE VANISH COMPLETELY until this device has collected
          MIN_HISTORY listings — no heading, no placeholder, nothing. An early
          visit is not a page with two apologies on it; it is the hero, then
          suggestions, then the pills, then the categories, and these two arrive
          once there is enough browsing behind them to fill a row and mean
          something.

          TWO CONDITIONS, AND THEY ARE NOT THE SAME ONE TWICE. `personal` is
          about the HISTORY — has this device opened five listings — and
          `minItems` is about the ROW — are there five cards to draw. Neither
          implies the other: five views of listings that have since sold leave
          the recently-viewed row with two cards in it, and a single view is
          enough for the ranking below to produce fifty candidates for the row
          above. See the note beside MIN_HISTORY, and minItems in
          listing-row.tsx. */}
      {personal && (
        <>
          <ListingRow
            title="Bazat pe vizualizările tale recente"
            items={sections.basedOnViews}
            rows={1}
            // A FULL ROW OR NOTHING — see minItems in listing-row.tsx.
            minItems={ROW}
            href="/?q="
            seeMoreLabel="Vezi mai multe"
          />

          <ListingRow
            title="Vizualizate recent"
            items={sections.recentlyViewed}
            rows={1}
            minItems={ROW}
          />
        </>
      )}

      <ListingRow
        title="Sugestii pentru tine"
        items={sections.suggested}
        rows={3}
        href="/?q="
        seeMoreLabel="Vezi mai multe"
      />

      {/* UNDER the suggestions, not above them.

          It sat between the two personal rows, which put a strip of search
          chips in the middle of the part of the page that is about what YOU
          were looking at. It belongs after the browsing is done: you have
          scrolled four rows, nothing has caught you, and here are the queries
          worth trying next. It is also the one section that is never empty, so
          it is the one that carries a first visit — see you-might-be-into.tsx. */}
      <YouMightBeInto views={views} catalogue={products} />

      <ShopByCategory catalogue={products} />

      <MoreListings items={sections.rest.length > 0 ? sections.rest : products} />
    </div>
  )
}
