"use client"

/**
 * A ProductCard with the words taken out.
 *
 * Every row is the real card's row in the real card's type, holding a
 * zero-width character, so its height comes from the same font metrics
 * rather than from a guessed h-5: the seller line, the title line with its
 * badge, the price. The grey bars sit inside those lines. Measured against
 * the real card by scripts/check-explore-loading.mjs.
 *
 * The bars breathe on opacity alone (the chart skeleton's keyframes), not a
 * shimmer sweeping a background across them: that repaints every frame.
 */

const BAR = "inline-block rounded-[4px] bg-[#e9ebee] align-middle"
const BREATHE = "motion-safe:animate-[chart-skeleton-breath_1.7s_cubic-bezier(0.4,0,0.6,1)_infinite]"

export function ProductCardSkeleton() {
  return (
    <div data-card-skeleton="" className="flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className={`relative aspect-video bg-[#eceef1] ${BREATHE}`} />
      <div className={`flex flex-1 flex-col p-4 ${BREATHE}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="block h-5 w-5 shrink-0 rounded-full bg-[#e9ebee]" />
          <span className="text-[13px]">
            &#8203;<span className={`${BAR} h-[0.8em] w-20`} />
          </span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 text-[17px] font-medium leading-tight">
            &#8203;<span className={`${BAR} h-[0.75em] w-3/4`} />
          </div>
          <span className="inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium">
            &#8203;<span className={`${BAR} h-[0.9em] w-12`} />
          </span>
        </div>
        <div className="mt-auto pt-4 font-semibold">
          &#8203;<span className={`${BAR} h-[0.8em] w-14`} />
        </div>
      </div>
    </div>
  )
}
