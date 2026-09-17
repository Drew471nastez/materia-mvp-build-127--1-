import { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft, Heart } from "lucide-react"
import { WishlistContent } from "@/components/wishlist/wishlist-content"
import { ReturnLink } from "@/components/navigation/return-link"

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
    <div className="max-w-5xl mx-auto px-2 sm:px-0 animate-in fade-in-0 duration-300">
      {/* Page header card — matches library main page visual language */}
      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="h-16 sm:h-20 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900" />
        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="flex items-end justify-between -mt-6 sm:-mt-7 mb-3">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl border-4 border-white bg-neutral-100 flex items-center justify-center shadow-sm shrink-0">
              <Heart className="h-5 w-5 sm:h-6 sm:w-6 text-neutral-600" />
            </div>
            <ReturnLink
              href="/library"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors shadow-sm mt-8 sm:mt-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Library
            </ReturnLink>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Wishlist</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Products you&apos;ve saved for later</p>
        </div>
      </section>
      <Suspense fallback={<WishlistSkeleton />}>
        <WishlistContent isLibrary />
      </Suspense>
    </div>
  )
}
