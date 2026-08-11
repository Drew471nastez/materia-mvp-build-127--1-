import { SlidersHorizontal, GalleryVerticalEnd, Search } from "lucide-react"

/**
 * The shell the Acasă tab paints the instant it is tapped.
 *
 * Home was the one tab with no loading boundary, and it is the most expensive
 * route in the app: `force-dynamic`, with the product queries behind it. Without
 * a boundary Next has no static shell to cache, so `router.prefetch("/")` in the
 * tab bar fetched nothing, and every tap on Acasă sat on whatever screen you
 * were already looking at — frozen, tab bar included — until a cold render came
 * back. That wait is the whole of "switching to home is slow"; no animation
 * anywhere else could have covered it.
 *
 * The route group `(feed)` exists purely to scope this file. A loading.tsx
 * applies to its segment AND everything nested under it, so putting one in
 * app/(marketing)/ would have handed this skeleton to /cart, /faq, /legal and a
 * dozen other routes that look nothing like it. The group adds no URL segment —
 * this is still `/`.
 *
 * THE TAB BAR IS NOT HERE, and that is the point. It used to be — because the
 * feed rendered its own and GlobalMobileNav stepped aside on `/`, so during
 * this skeleton neither existed and the bar you had just tapped disappeared.
 * The answer turned out to be one bar for the whole app rather than three that
 * hand off to each other: the layout renders it once, on every route, and it is
 * already on screen above this shell. Nothing here to hand over, nothing to
 * rebuild, and the tab you pressed stays lit the entire time.
 *
 * Everything else is measured against components/explore/mobile-feed.tsx — the
 * safe-area padding above the search row, the 44px controls, the 15px tab row
 * and its 2px underline, the hairline under it, the pill rail's padding, the
 * 2-column grid at 3:4. Nothing may move when the real feed replaces it.
 */
export default function FeedLoading() {
  return (
    <>
      {/* `mobile-feed-shell` is what makes this an overlay in the app and a
          plain block under the site header on mobile web — the same class the
          real feed uses, so the two occupy the same box in both. */}
      <div
        className="mobile-feed-shell md:hidden fixed inset-0 z-[60] flex flex-col bg-white"
        style={{ height: "100dvh" }}
      >
        {/* Search + filter + view switcher. Drawn rather than skeletonised: the
            row is three constants, and three grey pills where three controls
            are about to be is more of a change than the controls themselves. */}
        <div
          className="feed-own-search shrink-0 px-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.85rem)" }}
        >
          <div className="flex items-center gap-2">
            <div className="relative h-11 flex-1 rounded-full border border-neutral-200 bg-neutral-100">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700">
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </div>
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
              style={{
                background: "linear-gradient(160deg, #8b5cf6 0%, #7c3aed 52%, #6d28d9 100%)",
                boxShadow:
                  "0 1px 2px rgba(76, 29, 149, 0.28), 0 6px 16px -4px rgba(124, 58, 237, 0.55), inset 0 1px 0 rgba(255,255,255,0.22)",
              }}
            >
              <GalleryVerticalEnd className="h-[19px] w-[19px]" strokeWidth={2.2} />
            </div>
          </div>
        </div>

        {/* For You / Following / Saved, with the underline already under the
            first — the feed always opens on For You, so this is not a guess. */}
        <div className="flex shrink-0 items-stretch px-3 pt-3.5">
          {["Pentru tine", "Urmăriți", "Salvate"].map((label, i) => (
            <div
              key={label}
              className={`flex flex-1 flex-col items-center pb-2.5 text-[15px] ${
                i === 0 ? "font-semibold text-neutral-900" : "font-medium text-neutral-400"
              }`}
            >
              <span className="relative inline-flex flex-col items-center">
                {label}
                <span
                  className={`mt-2 h-[2px] w-full rounded-full bg-[#7c3aed] ${
                    i === 0 ? "opacity-100" : "opacity-0"
                  }`}
                />
              </span>
            </div>
          ))}
        </div>

        <div className="mt-1 h-px shrink-0" style={{ backgroundColor: "rgba(0, 0, 0, 0.07)" }} />

        {/* The pill rail's height, at its real padding. The pills themselves are
            grey because their labels come from the category list and getting one
            wrong would be a word changing under your eyes at the swap. */}
        <div className="flex shrink-0 gap-2 overflow-hidden px-4 pb-3 pt-3">
          {[64, 78, 56, 88, 70, 60].map((w, i) => (
            <div
              key={i}
              className="h-[34px] shrink-0 animate-pulse rounded-full bg-neutral-100"
              style={{ width: w }}
            />
          ))}
        </div>

        {/* Two columns at 3:4, the grid's own gaps and padding. `overflow-hidden`
            rather than a scroller: this is never scrolled, and a scroll
            container here would take the position the real one is about to
            restore. */}
        <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col">
                <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-neutral-100" />
                <div className="flex flex-col gap-1.5 px-0.5 pt-2.5">
                  <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
                  <div className="h-3.5 w-full animate-pulse rounded bg-neutral-100" />
                  <div className="h-4 w-14 animate-pulse rounded bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* The same reservation the real feed makes. The bar is rendered once,
            by the layout, and is already on screen above this — so drawing
            another one here would be two bars stacked for the length of the
            skeleton. */}
        <div
          aria-hidden
          className="shrink-0"
          style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 63px)" }}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          THE DESKTOP SHELL, IN THE SHAPE OF THE PAGE THAT IS COMING
          ═══════════════════════════════════════════════════════════════════

          There was a ten-card grid here. It was removed for being a flash of
          the WRONG shape, and removing it made things worse in a way that is
          worth writing down: with nothing at all, a refresh drew the header, a
          category bar and then the FOOTER — because an empty document is a
          short one — and a second later the real page arrived and shoved the
          footer two thousand pixels down. A blank page that jumps is not an
          improvement on a skeleton that jumps; it is the same jump with less
          warning.

          The fix was never "skeleton or no skeleton". It was that a placeholder
          has exactly one job — hold the space its content will take — and one
          that holds the wrong space does the opposite of its job. So this one
          is measured against components/explore/home: the hero is 260px and
          split 42/58, the rows are five across at the card's own 3:4, the pill
          strip is a row of lozenges, and the headings are where the headings
          are. Nothing moves when the real page replaces it.

          Two rows and a strip, not the whole page. Below the fold there is
          nothing to hold still, and every extra element here is markup shipped
          on the critical path to be thrown away. */}
      <div className="mx-auto hidden w-full max-w-[1400px] px-4 pb-8 pt-4 sm:px-6 sm:pt-5 md:block lg:px-8">
        {/* The hero: two halves, the real height, no pulse on the ground —
            a 1400×260 block flashing grey is the single most distracting thing
            a loading screen can do, and it is the first thing on the page. */}
        <div className="grid h-[240px] grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] overflow-hidden rounded-2xl lg:h-[260px]">
          <div className="flex flex-col justify-center gap-3 bg-neutral-200/70 px-8 lg:px-12">
            <div className="h-3 w-16 rounded bg-white/25" />
            <div className="h-7 w-3/4 rounded bg-white/25" />
            <div className="h-4 w-5/6 rounded bg-white/20" />
            <div className="mt-3 h-11 w-36 rounded-lg bg-white/30" />
          </div>
          <div className="bg-neutral-100" />
        </div>

        {[0, 1].map((row) => (
          <div key={row} className="mt-10">
            <div className="mb-4 h-6 w-64 animate-pulse rounded bg-neutral-100" />
            <div className="grid grid-cols-3 gap-x-4 gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col">
                  <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-neutral-100" />
                  <div className="flex flex-col gap-1.5 px-0.5 pt-2.5">
                    <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
                    <div className="h-3.5 w-full animate-pulse rounded bg-neutral-100" />
                    <div className="h-4 w-14 animate-pulse rounded bg-neutral-100" />
                  </div>
                </div>
              ))}
            </div>
            {/* The pill strip sits between the two rows, exactly as it does on
                the page itself. */}
            {row === 0 && (
              <div className="mt-10">
                <div className="mb-4 h-6 w-56 animate-pulse rounded bg-neutral-100" />
                <div className="flex flex-wrap gap-2.5">
                  {[112, 148, 96, 132, 104, 160].map((w, i) => (
                    <div key={i} className="h-11 animate-pulse rounded-lg bg-neutral-100" style={{ width: w }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
