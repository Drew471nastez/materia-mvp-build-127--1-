import { SlidersHorizontal, GalleryVerticalEnd, Search } from "lucide-react"
import { MobileBottomNav } from "@/components/explore/mobile-bottom-nav"

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
 * THE TAB BAR IS RENDERED HERE, and that is not decoration. The feed supplies
 * its own bar (it is a fixed full-screen overlay with its own stacking context),
 * which is why GlobalMobileNav steps aside on `/`. So during the moment this
 * shell is on screen, neither of them exists — the bar you just tapped
 * disappears, and comes back when the feed lands. Drawing it here makes the
 * handover invisible: global bar → this bar → the feed's bar, all identical
 * pixels in the same place. The unread badge carries across because its count
 * lives in a module-scoped cache, not in component state.
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

        <MobileBottomNav active="home" />
      </div>

      {/* Desktop is a plain grid under the site header, so it gets a plain grid
          skeleton. It shares nothing with the phone shell above and must not
          inherit its fixed positioning. */}
      <div className="mx-auto hidden max-w-[1400px] px-4 pb-8 pt-5 sm:px-6 md:block lg:px-8">
        <div className="grid grid-cols-3 gap-x-4 gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
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
    </>
  )
}
