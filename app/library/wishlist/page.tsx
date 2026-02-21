import { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft, Heart } from "lucide-react"
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
  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-0">
      <div className="mb-6">
        <Link
          href="/library"
          className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to library
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Wishlist</h1>
            <p className="text-sm text-neutral-500 mt-1">Products you&apos;ve saved for later</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-neutral-100 flex items-center justify-center">
            <Heart className="h-5 w-5 text-neutral-600" />
          </div>
        </div>
      </div>
      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistContent isLibrary />
      </Suspense>
    </div>
  )
}
