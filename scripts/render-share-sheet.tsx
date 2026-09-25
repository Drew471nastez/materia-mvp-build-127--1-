/**
 * The home page's address pill and what it opens (components/app/share), for
 * scripts/check-share-sheet.mjs. Real components, fixture addresses: a
 * creator with a creator page, a OnePage and a published website, on
 * Instagram, TikTok and X. The phone row is the home page's: the live count
 * and the period at their real sizes, with the pill taking what is left. A
 * second pill carries an address long enough to be cut, so the probe can
 * read the fade.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ShareStorelib } from "@/components/app/share/share-storelib"
import type { ConnectedPlatform, ShareAddress } from "@/components/app/share/share-data"

const ADDRESSES: ShareAddress[] = [
  { surface: "creator", label: "Creator page", url: "https://storelib.com/andrewrullz", display: "storelib.com/andrewrullz" },
  { surface: "onepage", label: "OnePage", url: "https://storelib.com/andrewrullz/links", display: "storelib.com/andrewrullz/links" },
  { surface: "website", label: "Website", url: "https://andrewrullz.storelib.com", display: "andrewrullz.storelib.com" },
]

const PLATFORMS: ConnectedPlatform[] = [
  { key: "instagram", profileUrl: "https://www.instagram.com/andrewrullz/" },
  { key: "tiktok", profileUrl: "https://www.tiktok.com/@andrewrullz" },
  { key: "twitter", profileUrl: "https://x.com/andrewrullz" },
]

const LONG: ShareAddress[] = [
  { surface: "creator", label: "Creator page", url: "https://storelib.com/a-very-long-creator-handle-indeed", display: "storelib.com/a-very-long-creator-handle-indeed" },
]

function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a2e] sm:text-[26px]">Good afternoon, Andrew</h1>
            <p className="mt-1 text-[14px] text-[#6b7280]">Here&apos;s what&apos;s happening with your store</p>
          </div>
          <div className="hidden min-w-0 max-w-[300px] shrink-0 items-center md:flex">
            <span data-probe="pill-md" className="inline-flex min-w-0 max-w-full">
              <ShareStorelib addresses={ADDRESSES} platforms={PLATFORMS} />
            </span>
          </div>
          <div data-probe="phone-row" className="flex min-w-0 items-center gap-2 md:hidden">
            <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#f3f4f6] px-2.5">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="whitespace-nowrap text-[12px] font-medium text-gray-500">0 live</span>
            </div>
            <button type="button" className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1a1a2e]">
              Last 30 days
            </button>
            <div className="ml-auto flex min-w-0 flex-1 justify-end">
              <span data-probe="pill-sm" className="inline-flex min-w-0 max-w-full">
                <ShareStorelib size="sm" addresses={ADDRESSES} platforms={PLATFORMS} />
              </span>
            </div>
          </div>
        </div>
        <div className="w-[240px]">
          <span data-probe="pill-long" className="inline-flex min-w-0 max-w-full">
            <ShareStorelib addresses={LONG} platforms={PLATFORMS} />
          </span>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
