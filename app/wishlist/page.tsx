import { Metadata } from "next"
import { Suspense } from "react"
import { WishlistContent } from "@/components/wishlist/wishlist-content"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"

export const metadata: Metadata = {
  title: "My Wishlist | Storelib",
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

export default function WishlistPage() {
  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={<div className="h-16 border-b border-gray-200 bg-white" />}>
        <PlatformHeaderClient />
      </Suspense>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">My Wishlist</h1>
          <p className="text-sm text-neutral-500 mt-1">Products you&apos;ve saved for later</p>
        </div>
        <Suspense fallback={<WishlistSkeleton />}>
          <WishlistContent />
        </Suspense>
      </main>
    </div>
  )
}
