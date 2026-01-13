import { Metadata } from "next"
import { Suspense } from "react"
import { WishlistContent } from "@/components/wishlist/wishlist-content"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Wishlist | Library",
  description: "Your saved products",
}

export const dynamic = "force-dynamic"

function WishlistSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4 p-4 border rounded-lg border-gray-200">
          <Skeleton className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-5 w-1/3" />
            <div className="flex gap-2 mt-4">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-9" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LibraryWishlistPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Wishlist</h1>
      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistContent isLibrary />
      </Suspense>
    </div>
  )
}
