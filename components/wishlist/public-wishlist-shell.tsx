"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { backThen } from "@/lib/navigation/go-back"
import { WishlistContent } from "@/components/wishlist/wishlist-content"
import { MarketingFooter } from "@/components/marketing/footer"
import { StorelibLogo } from "@/components/brand/storelib-logo"

export function PublicWishlistShell() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            /* The same watch every back in the app has: this page is a link
               somebody is sent, so most visits have nothing behind them and a
               bare back did nothing at all (lib/navigation/go-back). */
            onClick={() => backThen(() => router.push("/explore"))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            {/* 5% UNDER THE 32PX IT WAS: the logo is a little smaller in every header. */}
            <StorelibLogo size={30.4} />
            <span className="text-sm font-semibold text-neutral-900">Storelib</span>
          </div>

          <div className="h-9 w-9" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Wishlist</h1>
          <p className="mt-1 text-sm text-neutral-500">Products you&apos;ve saved for later</p>
        </div>
        <WishlistContent showDiscoverMoreCta />
      </main>

      <MarketingFooter />
    </div>
  )
}
