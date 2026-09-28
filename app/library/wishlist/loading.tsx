import { WishlistSkeleton } from "@/components/wishlist/wishlist-skeleton"
import { TAB_SKELETON } from "../loading"

/* The rows and cards the wishlist draws, and no header card: the library's heading and pills stay put above it. */
export default function WishlistLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <WishlistSkeleton />
    </div>
  )
}
