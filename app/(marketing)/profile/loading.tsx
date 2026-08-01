/**
 * The skeleton the account tab paints the instant it is tapped.
 *
 * This file is why the tab feels immediate, and the reason is structural rather
 * than cosmetic: a `force-dynamic` route with no loading boundary cannot be
 * usefully prefetched — there is no static shell to cache, so `prefetch` on the
 * nav link fetched nothing and every tap waited out a cold render with several
 * database round trips behind it before a single pixel changed. With a boundary
 * here, Next caches this shell on prefetch and shows it the moment you tap,
 * while the real page streams in behind it.
 *
 * It mirrors the real layout closely enough that the swap reads as content
 * arriving rather than as one screen replacing another.
 */
export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-6 md:px-6 md:pt-10">
      <div className="flex items-start gap-4 md:items-center md:gap-6">
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-neutral-100 md:h-24 md:w-24" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="h-5 w-40 animate-pulse rounded bg-neutral-100" />
          <div className="h-3.5 w-28 animate-pulse rounded bg-neutral-100" />
          <div className="h-3 w-48 animate-pulse rounded bg-neutral-100" />
        </div>
      </div>

      {/* Articole / Urmăritori / Urmărește */}
      <div className="mt-5 flex items-center gap-8 border-b border-neutral-100 pb-5 md:gap-10">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-9 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 md:mt-10 md:grid-cols-3 md:gap-x-4 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-neutral-100" />
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
            <div className="h-3.5 w-14 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
