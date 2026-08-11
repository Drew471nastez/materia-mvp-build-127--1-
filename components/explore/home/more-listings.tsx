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

export function MoreListings({ items }: { items: any[] }) {
  const [shown, setShown] = useState(PAGE)
  /** Auto-loading only begins once somebody has asked for more once. */
  const [auto, setAuto] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const hasMore = shown < items.length

  const more = useCallback(() => {
    setShown((n) => Math.min(n + PAGE, items.length))
  }, [items.length])

  useEffect(() => {
    if (!auto || !hasMore) return
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
  }, [auto, hasMore, more])

  if (items.length === 0) return null

  return (
    <section className="mt-12 pb-16">
      <h2 className="mb-4 text-[22px] font-bold tracking-[-0.02em] text-neutral-900">Mai multe anunțuri</h2>

      <div className="grid grid-cols-3 gap-x-4 gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
        {items.slice(0, shown).map((product) => (
          <ProductCard key={product.id} product={product} origin="feed" />
        ))}
      </div>

      {hasMore && (
        <div className="mt-10 flex flex-col items-center gap-3">
          {!auto ? (
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
