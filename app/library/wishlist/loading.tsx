import { WishlistSkeleton } from "@/components/library/library-skeletons"
import { TAB_SKELETON } from "../loading"

/** The wishlist's shape while it is read (components/wishlist/wishlist-content.tsx). */
export default function WishlistLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <WishlistSkeleton />
    </div>
  )
}
