/**
 * The wishlist's shape while it is read: the count line, then the grid of
 * cards components/wishlist/wishlist-content.tsx draws. One shape for the
 * route's loading screen, the page's Suspense and the content's own fetch,
 * so nothing moves when the cards land. No heading block: in the library,
 * "Library" above the pills is the only heading on the screen.
 */
export function WishlistSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div aria-hidden data-wishlist-skeleton="">
      <div className="mb-3 h-4 w-20 rounded bg-[#eceef1] animate-pulse" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white">
            <div className="aspect-[4/3] bg-[#f1f3f5] animate-pulse" />
            <div className="space-y-2 p-3.5">
              <div className="h-4 w-3/4 rounded bg-[#eceef1] animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-[#f1f3f5] animate-pulse" />
              <div className="h-4 w-1/4 rounded bg-[#f1f3f5] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
