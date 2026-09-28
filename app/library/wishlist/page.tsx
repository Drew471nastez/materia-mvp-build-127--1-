import { Metadata } from "next"
import { Suspense } from "react"
import { WishlistContent } from "@/components/wishlist/wishlist-content"
import { WishlistSkeleton } from "@/components/wishlist/wishlist-skeleton"

export const metadata: Metadata = {
  title: "Wishlist | Library",
  description: "Your saved products",
}

export const dynamic = "force-dynamic"

export default function LibraryWishlistPage() {
  /* The heading and the tabs are the library's (components/library/library-tabs). */
  return (
    <div>
      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistContent isLibrary />
      </Suspense>
    </div>
  )
}
