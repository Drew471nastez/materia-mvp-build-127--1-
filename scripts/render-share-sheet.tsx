/**
 * The home page's address pill and the share sheet it opens
 * (components/app/share), for scripts/check-share-sheet.mjs. Real components,
 * fixture addresses: a creator with a creator page, a OnePage and a
 * published website, on Instagram, TikTok and X. A second pill carries an
 * address long enough to be cut, so the probe can read the ellipsis.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { SharePill, ShareStorelibSheet } from "@/components/app/share/share-storelib"
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

function Page() {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex justify-end md:hidden">
              <span data-probe="pill-sm">
                <SharePill size="sm" display={ADDRESSES[0].display} onOpen={() => setOpen(true)} />
              </span>
            </div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a2e] sm:text-[26px]">Good afternoon, Andrew</h1>
            <p className="mt-1 text-[14px] text-[#6b7280]">Here&apos;s what&apos;s happening with your store</p>
          </div>
          <div className="hidden min-w-0 shrink-0 items-center md:flex">
            <span data-probe="pill-md">
              <SharePill display={ADDRESSES[0].display} onOpen={() => setOpen(true)} />
            </span>
          </div>
        </div>
        <span data-probe="pill-long">
          <SharePill display="storelib.com/a-very-long-creator-handle-indeed" onOpen={() => {}} />
        </span>
      </div>
      <ShareStorelibSheet open={open} onOpenChange={setOpen} addresses={ADDRESSES} platforms={PLATFORMS} />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
