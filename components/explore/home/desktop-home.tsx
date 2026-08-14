"use client"

import { useEffect, useMemo, useState } from "react"

import { HeroSlides } from "./hero-slides"
import { ListingRow } from "./listing-row"
import { MoreListings } from "./more-listings"
import { ShopByCategory } from "./shop-by-category"
import { SignedOutHero } from "./signed-out-hero"
import { YouMightBeInto } from "./you-might-be-into"
import { getRecentViews, signalsFrom, subscribeRecentViews, type RecentView } from "@/lib/marketplace/recent-views"
import { cn } from "@/lib/utils"

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
 *   based on your views  what is like the things you opened     — hidden if none
 *   hero                 three slides, two of them real listings
 *   recently viewed      the things themselves                  — hidden if none
 *   suggested for you    three rows, the wider net
 *   you might be into    queries worth trying next              — never empty
 *   by category          five doors
 *   more listings        everything left, two rows at a time
 *
 * The two marked "hidden if none" are not drawn AT ALL until this device has
 * opened MIN_HISTORY listings — not as a heading, not as a placeholder. So a
 * first visit OPENS ON THE HERO and is four full sections; a returning one
 * opens on the row that remembers what they were doing, and the hero drops to
 * second. The house's promotion goes first only while there is nothing better
 * to lead with.
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

export function DesktopHome({
  products,
  signedIn = false,
  variant = "page",
}: {
  products: any[]
  signedIn?: boolean
  /**
   * WHERE THIS IS BEING DRAWN, WHICH IS ONLY EVER ABOUT ONE CLASS.
   *
   * "page" is the marketing route, which renders this beside a phone feed that
   * covers the screen below md — so the wrapper is `hidden md:block` and the
   * phone never sees it.
   *
   * "phone" is inside that feed's scroller, which is itself `md:hidden`, so
   * the same wrapper there would hide this at every width: `hidden md:block`
   * inside `md:hidden` is a section that never renders anywhere. It is the same
   * component and the same order either way; what changes is which of the two
   * shells it is inside, and neither should be repeating the other's gate.
   *
   * The SECTIONS below are responsive in their own right — see the rails in
   * listing-row.tsx and the stacked slide in hero-slides.tsx. This prop does not
   * pick a layout; it only says which shell is already handling the breakpoint.
   */
  variant?: "page" | "phone"
}) {
  /**
   * THE GUTTERS ARE THE SHELL'S, AND ON A PHONE NOBODY WAS PROVIDING THEM.
   *
   * On the page this sits inside `mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8`,
   * so every section below is written against a container that already has side
   * padding — which is what the rails' `-mx-4 … px-4` bleeds pull back INTO.
   *
   * The phone feed's scroller has none. So those bleeds had nothing to cancel:
   * each rail came out 32px wider than the screen, the document gained
   * horizontal overflow, and the whole page could be dragged sideways. That is
   * the "I can drag the page to the left" — not a stray element, but a negative
   * margin with no padding behind it.
   *
   * `px-4` here is that padding. It belongs on the shell rather than on each
   * section, because the sections are shared with the desktop page and adding
   * it there would have been a second gutter inside the first.
   *
   * `overflow-x-clip` is the guarantee behind it. With the padding restored
   * nothing SHOULD reach past this box — but "should" is what was true of the
   * page before as well, and the failure is invisible until somebody drags
   * sideways and finds the whole document has come loose. `clip` rather than
   * `hidden`, because `hidden` on one axis forces the other to `auto` and would
   * turn this into a scroll container inside the feed's scroller; `clip` bounds
   * the painting and nothing else. The rails inside are their own scrollers and
   * their bleed lands exactly on this box's edges, so there is nothing here for
   * it to cut off.
   */
  const shell = variant === "phone" ? "px-4 overflow-x-clip" : "hidden md:block"
  /** True where the screen is one column — see the note beside the hero. */
  const phoneFirst = variant === "phone"
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  THE SIGNED-OUT PAGE IS A DIFFERENT PAGE, NOT THE SAME ONE WITH A BANNER
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * A visitor with no account is answering a different question from a member.
   * The member's question is "what is new since I was last here", and the page
   * below answers it by leading with their own history. A stranger has no
   * history — the personal rows are empty by definition on a first visit — so
   * the same layout hands them a hero, then a gap where two sections would be,
   * then a wall of listings under a heading that says "for you" about somebody
   * it has never met.
   *
   * So this order is written out rather than derived, and every position in it
   * is doing a job:
   *
   *   1  SignedOutHero          what this place is. The only screen it belongs
   *                             on, and the first thing on it.
   *   2  the personal row       Vizualizate recent, IF this device has browsed
   *                             — a signed-out visitor can still be a returning
   *                             one, and a second visit should not look like a
   *                             first. When there is no history it is Sugestii
   *                             pentru tine at TWO rows, which is the same
   *                             promise made honestly: ten of the newest things,
   *                             not a claim to know anybody.
   *   3  HeroSlides             the editorial, under the proposition rather than
   *                             above it. It is a promotion and it has to earn
   *                             the scroll, not open the page twice.
   *   4  YouMightBeInto         queries worth trying next.
   *   5  Sugestii pentru tine   two rows, BETWEEN the pills and the tiles. Both
   *                             of those are ways of narrowing — queries and
   *                             departments — and back to back they make the
   *                             middle of the page two rows of navigation with
   *                             nothing to look at between them.
   *   6  ShopByCategory         five doors, for somebody who has none of their
   *                             own yet.
   *   7  Sugestii pentru tine   three rows, CONTINUING the list rather than
   *                             repeating it — see the three slices below. The
   *                             heading appears up to three times on this page
   *                             and that is a decision about the page; it is
   *                             only defensible while the CONTENTS differ, which
   *                             is what the slicing guarantees.
   *   8  MoreListings           everything else, a page at a time.
   *
   * A member gets the layout after this one, unchanged.
   */
  const SIGNED_OUT_TOP_ROWS = 2
  const SIGNED_OUT_MID_ROWS = 2
  /**
   * THREE SUGGESTION BLOCKS ON A SIGNED-OUT PAGE, AND NONE OF THEM REPEATS.
   *
   * The top one stands in for the personal row when this device has no history;
   * the middle and the lower one are the two the page asks for either side of
   * the categories. They carry the same heading, which is a deliberate choice
   * about the page rather than an accident of the code — and it is only
   * defensible while the CONTENTS differ, so the list is cut into three
   * consecutive slices and no card can appear twice.
   *
   * `topTaken` is what the first block consumed, which is nothing when it was
   * not drawn — that is the whole of "the middle block starts wherever the top
   * one stopped", and writing it as an offset rather than as two branches is
   * what keeps the three slices provably disjoint.
   */
  const topTaken = personal ? 0 : ROW * SIGNED_OUT_TOP_ROWS
  const suggestedTop = sections.suggested.slice(0, topTaken)
  const suggestedMid = sections.suggested.slice(topTaken, topTaken + ROW * SIGNED_OUT_MID_ROWS)
  const suggestedRest = sections.suggested.slice(topTaken + ROW * SIGNED_OUT_MID_ROWS)

  if (!signedIn) {
    return (
      <div className={shell}>
        {/* ON A PHONE THE HERO SITS ON GREY, and nothing else does.

            Its edge is a hairline ring and a one-pixel contact shadow, weights
            chosen against this page's #f5f5f5 ground. The phone feed is white,
            and a near-white gradient panel on white is a card whose edges you
            cannot see. The strip gives it back the ground it was drawn for, and
            does a second job while it is there: it makes the promotion its own
            zone, so the white underneath starts where the marketplace starts.

            `mb-0` because the strip's own padding is the gap now — tailwind-
            merge replaces the panel's `mb-8` rather than stacking with it. */}
        {variant === "phone" ? (
          <div className="-mx-4 bg-[#f5f5f5] px-4 py-3">
            <SignedOutHero className="mb-0" />
          </div>
        ) : (
          <SignedOutHero />
        )}

        {personal ? (
          <ListingRow title="Vizualizate recent" items={sections.recentlyViewed} rows={1} minItems={ROW} />
        ) : (
          <ListingRow
            title="Sugestii pentru tine"
            items={suggestedTop}
            rows={SIGNED_OUT_TOP_ROWS}
            href="/shop"
            seeMoreLabel="Vezi mai multe"
          />
        )}

        {/* The same conditional gap as the member layout: a row above it means
            the hero needs the page's rhythm, and nothing above it means it does
            not. */}
        <HeroSlides listings={products} className="mb-11 mt-11" />

        <YouMightBeInto views={views} catalogue={products} />

        {/* BETWEEN THE PILLS AND THE CATEGORIES, not after them. The pills are
            queries and the tiles are departments — both are ways of NARROWING,
            and putting them back to back makes the middle of the page two rows
            of navigation with nothing to look at between them. A grid of things
            for sale in between is what a marketplace home page is for. */}
        <ListingRow
          title="Sugestii pentru tine"
          items={suggestedMid}
          rows={SIGNED_OUT_MID_ROWS}
          href="/shop"
          seeMoreLabel="Vezi mai multe"
        />

        <ShopByCategory catalogue={products} />

        <ListingRow
          title="Sugestii pentru tine"
          items={suggestedRest}
          rows={3}
          href="/shop"
          seeMoreLabel="Vezi mai multe"
        />

        {/* The button first and the observer after — see more-listings.tsx.
            Pure infinite scroll takes the footer away and loads pages nobody
            asked for; a pure button asks for a press every twelve cards. */}
        <MoreListings items={sections.rest.length > 0 ? sections.rest : products} manual={variant === "phone"} />
      </div>
    )
  }

  return (
    /* NO ENTRANCE ANIMATION ON THIS CONTAINER, deliberately.
     *
     * There was a 160ms opacity fade here to cover the swap from the loading
     * shell. It was also promoting two thousand pixels of page to a composited
     * layer at the exact moment that page changes height — and a layer that
     * grows after it is rasterised is how the footer ended up painted across
     * the middle of the listings. The shell is the right shape now, so there is
     * nothing left for a fade to hide. See app/globals.css. */
    <div className={shell}>
      {/* WHAT THIS PLACE IS, FOR SOMEBODY WHO HAS NEVER BEEN.

          Signed out only. Somebody with an account already knows what Storelib
          is, and telling them on every visit is the site failing to recognise
          them. */}
      {!signedIn && <SignedOutHero />}

      {/* ═══════════════════════════════════════════════════════════════════
          ABOVE THE HERO — BUT ONLY ONCE IT HAS SOMETHING TO SAY
          ═══════════════════════════════════════════════════════════════════

          The hero is a promotion. It is what the marketplace wants to show
          somebody it knows nothing about, and it is the right first thing on
          exactly that visit and no other.

          For a returning shopper it is the wrong first thing: they came back to
          carry on, and making them scroll past a campaign to reach the row that
          remembers what they were doing puts the house's business ahead of
          theirs. So once this device has enough history, that row takes the top
          of the page and the hero moves under it.

          `mb-2` rather than the row's own `mt-14`, because at the top of the
          page there is nothing above it to be separated from — the section's
          margin is for the gap between sections, and this one has none.

          This is the same `personal` gate as the sections below, so an early
          visit still opens on the hero and nothing has moved for the person who
          has not earned the row yet. */}
      {/* THE GAP IS CONDITIONAL, because the hero is sometimes the first thing
          on this page and sometimes the second. With a row above it, it needs
          the same `mt-14` every other section has — without one the row's cards
          butted straight against the slideshow, which is the "no space at all,
          looks horrible" in the screenshot. At the top of the page there is
          nothing above it to be separated from. */}
      {/* ═══════════════════════════════════════════════════════════════════
          WHICH SIDE OF THE HERO "VIZUALIZATE RECENT" SITS ON
          ═══════════════════════════════════════════════════════════════════

          A PHONE PUTS IT ABOVE. There is one column and about six hundred
          pixels of it: the slideshow alone is a picture and a headline and a
          button, so anything under it is a scroll away rather than a glance
          away. A returning shopper opening the app to carry on should not have
          to travel past a campaign to reach the row that remembers what they
          were doing.

          A DESKTOP PUTS IT BELOW. The slideshow is a 1400px band and the row
          under it is five cards — both are on screen at once, so "below" costs
          nothing and the page keeps the shape it has always had: the house's
          proposition first, then yours. Above the fold on a monitor is a
          different amount of page from above the fold on a phone, and this is
          the one section where that difference decides the order.

          Written as a flag rather than as two copies of the JSX, so the two
          layouts cannot drift in anything except this one decision.

          mt-11 UNDER a row and mb-11 always: fifty-six pixels between the
          slideshow and the listings under it was a band of white wide enough to
          read as the end of the page. The slideshow is a full-bleed picture, so
          the gap after it is measured against a hard edge rather than against a
          row of cards with their own air. */}
      {personal && phoneFirst && (
        <ListingRow
          title="Vizualizate recent"
          items={sections.recentlyViewed}
          rows={1}
          minItems={ROW}
          // mt-4, not the section rhythm's mt-10. Forty pixels is the gap
          // BETWEEN two sections; this one is the first thing on the page and
          // the only thing above it is the search row, which has padding of its
          // own. Sixteen is enough to separate them and not a hole.
          className="mt-4"
        />
      )}

      <HeroSlides listings={products} className={cn("mb-11", personal && phoneFirst && "mt-11")} />

      {personal && !phoneFirst && (
        <ListingRow
          title="Vizualizate recent"
          items={sections.recentlyViewed}
          rows={1}
          minItems={ROW}
          // The hero already carries the gap under itself (`mb-11`), so a second
          // one here would be two margins for one join.
          className="mt-0"
        />
      )}

      {/* What you were actually looking at, under the promotion.

          VANISHES COMPLETELY until this device has collected MIN_HISTORY
          listings — no heading, no placeholder, nothing.

          TWO CONDITIONS, AND THEY ARE NOT THE SAME ONE TWICE. `personal` is
          about the HISTORY — has this device opened five listings — and
          `minItems` is about the ROW — are there five cards to draw. Neither
          implies the other: five views of listings that have since sold leave
          this row with two cards in it. See the note beside MIN_HISTORY, and
          minItems in listing-row.tsx. */}
      {personal && (
        <ListingRow
          title="Bazat pe vizualizările tale recente"
          items={sections.basedOnViews}
          rows={1}
          // A FULL ROW OR NOTHING — see minItems in listing-row.tsx.
          minItems={ROW}
          href="/shop"
          seeMoreLabel="Vezi mai multe"
        />
      )}

      <ListingRow
        title="Sugestii pentru tine"
        items={sections.suggested}
        rows={3}
        href="/shop"
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

      <MoreListings items={sections.rest.length > 0 ? sections.rest : products} manual={variant === "phone"} />
    </div>
  )
}
