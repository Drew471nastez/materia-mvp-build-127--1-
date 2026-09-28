import { Metadata } from "next"
import { Suspense } from "react"
import { WishlistContent } from "@/components/wishlist/wishlist-content"

export const metadata: Metadata = {
  title: "Wishlist | Library",
  description: "Your saved products",
}

export const dynamic = "force-dynamic"

function WishlistSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="aspect-[4/3] bg-neutral-100 animate-pulse" />
          <div className="p-3.5 space-y-2">
            <div className="h-4 w-3/4 bg-neutral-100 rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-neutral-100 rounded animate-pulse" />
            <div className="h-4 w-1/4 bg-neutral-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LibraryWishlistPage() {
  /* The heading and the tabs are the library's (components/library/library-tabs). */
  return (
    <div className="animate-in fade-in-0 duration-300">
      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistContent isLibrary />
      </Suspense>
    </div>
  )
}
