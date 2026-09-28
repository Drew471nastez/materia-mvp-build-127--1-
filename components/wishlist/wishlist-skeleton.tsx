/**
 * The wishlist's shape while it is read, in the shape
 * components/wishlist/wishlist-content.tsx draws: the count, then on a phone
 * rows in one card (a 76px cover, the name, the seller, the price, one
 * button), and from 640px a grid of cards with a 16:9 cover. One shape for
 * the route's loading screen, the library's stage (library-skeletons.tsx)
 * and the public page's own fetch, so nothing moves when the cards land. No
 * heading block: in the library, "Library" above the pills is the only
 * heading on the screen.
 */

const LINE = "rounded bg-[#eceef1]"
const SOFT = "rounded bg-[#f1f3f5]"
const PULSE = "animate-pulse motion-reduce:animate-none"
const CARD = "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"
/** A card from 640px only: the wishlist is rows in one card on a phone and a grid of cards above it. */
const CARD_FROM_SM =
  "sm:rounded-2xl sm:border sm:border-[#e4e7ec]/80 sm:bg-white sm:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"

export function WishlistSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div aria-hidden data-wishlist-skeleton="">
      <div className={`mb-3 h-[18px] w-24 ${LINE} ${PULSE}`} />
      <div className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden sm:grid sm:grid-cols-2 sm:gap-4 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none lg:grid-cols-3 xl:grid-cols-4`}>
        {Array.from({ length: items }, (_, i) => (
          <div key={i} className={`grid grid-cols-[76px_minmax(0,1fr)] gap-x-3.5 px-4 py-4 sm:flex sm:flex-col sm:gap-0 sm:p-0 ${CARD_FROM_SM} sm:overflow-hidden`}>
            <div className={`row-span-2 h-[76px] w-[76px] rounded-xl sm:aspect-video sm:h-auto sm:w-full sm:rounded-none ${SOFT} ${PULSE}`} />
            <div className="min-w-0 space-y-2 pr-9 pt-0.5 sm:px-4 sm:pb-1 sm:pr-4 sm:pt-3.5">
              <div className={`h-4 w-4/5 ${LINE} ${PULSE}`} />
              <div className={`h-3.5 w-1/2 ${SOFT} ${PULSE}`} />
              <div className={`h-4 w-16 ${LINE} ${PULSE}`} />
            </div>
            <div className="col-start-2 mt-3 flex sm:mt-auto sm:px-4 sm:pb-4 sm:pt-3.5">
              <div className={`h-9 w-[112px] rounded-[10px] sm:w-full ${SOFT} ${PULSE}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

