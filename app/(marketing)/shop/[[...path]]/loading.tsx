/**
 * ===========================================================================
 *  THE SHELL /shop PAINTS THE INSTANT IT IS PRESSED
 * ===========================================================================
 *
 * This page is `force-dynamic` with three database round trips behind it — the
 * page of listings with an exact count, the facet pass over the category, and
 * the creators and profiles for the rows that came back. Without a loading
 * boundary there is no static shell for Next to cache, so `prefetch` on every
 * link into it fetched nothing and every press waited out the whole cold render
 * before one pixel changed.
 *
 * That is what "browsing between categories is not smooth" actually is. The
 * search panel closes, the menu closes, and then the page you left sits there
 * for as long as the query takes — which reads as the press not landing, so it
 * gets pressed again.
 *
 * ---------------------------------------------------------------------------
 * ITS ONLY REAL JOB IS TO BE THE SAME SHAPE AS WHAT REPLACES IT
 * ---------------------------------------------------------------------------
 * Every measurement here is taken from components/explore/category-results.tsx:
 * the same `max-w-[1400px] px-4 sm:px-6 lg:px-8` shell, the trail's height, the
 * 26/32px heading, the count line, the brand rail, the refine bar's border and
 * padding, and a grid at `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4
 * xl:grid-cols-5` with the card's own 3:4 image box. A skeleton whose grid is a
 * different width from the real one moves every listing on arrival, which is
 * worse than no skeleton: it turns one wait into one wait and a jump.
 *
 * TEN CARDS, not ninety. Two rows is everything above the fold on a laptop and
 * more than a phone can show; the rest arrive with the real page, and drawing
 * ninety pulsing rectangles is a second of layout work spent on a thing that is
 * about to be thrown away.
 *
 * Still and pale rather than shimmering hard. The eye should stay where the
 * content will be, not be pulled to whichever grey box is brightest.
 */
export default function ShopLoading() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        {/* The trail. Two words and a chevron's worth of height, so the heading
            under it starts where it will actually start. */}
        <div aria-hidden className="flex items-center gap-2 pb-2">
          <div className="h-[14px] w-12 animate-pulse rounded bg-neutral-100" />
          <div className="h-[14px] w-3 rounded bg-neutral-100" />
          <div className="h-[14px] w-20 animate-pulse rounded bg-neutral-100" />
        </div>

        {/* The heading and the count, at the real line heights. */}
        <div aria-hidden className="h-[32px] w-56 animate-pulse rounded-lg bg-neutral-100 sm:h-[38px] sm:w-72" />
        <div aria-hidden className="mt-2 h-[14px] w-28 animate-pulse rounded bg-neutral-100" />

        {/* The popular-brand rail. */}
        <div aria-hidden className="mt-4 flex gap-2">
          {[64, 78, 56, 88, 70].map((w, i) => (
            <div
              key={i}
              className="h-[36px] shrink-0 animate-pulse rounded-full bg-neutral-100"
              style={{ width: w }}
            />
          ))}
        </div>

        {/* The refine bar, carrying its own top border so the rule does not
            appear out of nowhere when the real one lands. */}
        <div aria-hidden className="-mx-4 mt-4 border-t border-neutral-200 px-4 pt-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-stretch gap-6 md:hidden">
            <div className="h-[26px] flex-1 animate-pulse rounded bg-neutral-100" />
            <div className="h-[26px] flex-1 animate-pulse rounded bg-neutral-100" />
          </div>
          <div className="hidden flex-wrap gap-2 md:flex">
            {[96, 84, 76, 88, 92, 72].map((w, i) => (
              <div
                key={i}
                className="h-[38px] animate-pulse rounded-full bg-neutral-100"
                style={{ width: w }}
              />
            ))}
          </div>
        </div>

        {/* The grid. Same columns and same gaps as the real one, and the image
            box is the card's own 3:4 — see components/explore/product-card.tsx. */}
        <div
          aria-hidden
          className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-4 xl:grid-cols-5"
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-neutral-100" />
              <div className="mt-2 h-[13px] w-4/5 animate-pulse rounded bg-neutral-100" />
              <div className="mt-1.5 h-[13px] w-1/3 animate-pulse rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
