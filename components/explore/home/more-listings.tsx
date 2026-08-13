"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { ProductCard } from "@/components/explore/product-card"

/**
 * ===========================================================================
 *  THE REST OF THE MARKETPLACE
 * ===========================================================================
 *
 * Everything the rows above did not use, two rows at a time, with a button.
 *
 * A BUTTON AND THEN AN OBSERVER, which is the combination rather than either
 * alone. Pure infinite scroll takes the footer away from anybody who wants it
 * and loads pages nobody asked for on a metered connection; a pure button asks
 * for a press every twelve cards. So the first press is deliberate, and after
 * that the sentinel takes over — you have said you want more, and the page
 * stops asking.
 *
 * Nothing is fetched. The whole page's worth of listings is already on the
 * client (the feed hands down a hundred), so "load more" is a slice moving,
 * which is why it can be instant and why it works with the network off.
 */
/** Five across, matching every other row on the page — see the note in
 *  listing-row.tsx for why not six. */
const PER_ROW = 5
const ROWS_PER_PAGE = 2
const PAGE = PER_ROW * ROWS_PER_PAGE

export function MoreListings({ items, manual = false }: { items: any[]; manual?: boolean }) {
  const [shown, setShown] = useState(PAGE)
  /**
   * Auto-loading only begins once somebody has asked for more once — and on a
   * phone it never begins at all.
   *
   * The trade the observer makes is worth it on a desktop page you scroll with
   * a wheel through a section that is one of eight. On a phone this section IS
   * the rest of the screen: ten cards is five rows, five rows is most of the
   * height you have, and an observer that fires 600px early means the page has
   * no end — the footer is unreachable, the scrollbar never settles, and every
   * flick loads twelve more photographs on whatever connection you are on.
   *
   * A button is also the honest control there. It is the one place on this page
   * that says how much more there is, and pressing it is cheaper than the
   * scroll it replaces.
   */
  const [auto, setAuto] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const hasMore = shown < items.length

  const more = useCallback(() => {
    setShown((n) => Math.min(n + PAGE, items.length))
  }, [items.length])

  useEffect(() => {
    if (manual || !auto || !hasMore) return
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) more()
      },
      // Ahead of the fold, so the next twelve are in place before the last of
      // the current twelve leaves the screen.
      { rootMargin: "600px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [manual, auto, hasMore, more])

  if (items.length === 0) return null

  return (
    <section className="mt-10 pb-14 sm:mt-14 sm:pb-20">
      <h2 className="mb-4 text-[19px] font-bold tracking-[-0.02em] text-neutral-900 sm:text-[22px]">
        Mai multe anunțuri
      </h2>

      {/* TWO ACROSS ON A PHONE, and this is the one section that stays a grid.
          The rows above are shelves — one idea, as many examples as you want —
          so they scroll sideways. This is "everything else", which has no idea
          in it and no end: it is the marketplace itself, and the marketplace on
          a phone is the two-column grid the feed already draws. Three across at
          375px would be 105px a card. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
        {items.slice(0, shown).map((product) => (
          <ProductCard key={product.id} product={product} origin="feed" />
        ))}
      </div>

      {hasMore && (
        <div className="mt-10 flex flex-col items-center gap-3">
          {manual || !auto ? (
            <button
              type="button"
              onClick={() => {
                setAuto(true)
                more()
              }}
              className="inline-flex h-12 items-center justify-center rounded-lg border border-neutral-200 bg-white px-8 text-[15px] font-semibold text-neutral-900 transition-colors duration-200 ease-out hover:border-neutral-300 hover:bg-neutral-50"
            >
              Încarcă mai multe
            </button>
          ) : (
            <span className="flex items-center gap-2 text-[13.5px] font-medium text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se încarcă…
            </span>
          )}
          {/* Below the control, so it is only crossed on the way down. */}
          <div ref={sentinel} aria-hidden className="h-px w-full" />
        </div>
      )}
    </section>
  )
}
