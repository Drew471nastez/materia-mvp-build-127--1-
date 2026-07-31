"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { GalleryVerticalEnd, Search, SlidersHorizontal } from "lucide-react"
import { AnimatedSearchPlaceholder } from "@/components/explore/animated-search-placeholder"
import { useLocale } from "@/components/locale-provider"
import { MobileSearchOverlay } from "@/components/explore/mobile-search-overlay"
import { triggerHaptic } from "@/lib/native-bridge"
import { claimSurface } from "@/lib/surface-bg"
import { CATEGORIES } from "@/lib/marketplace/categories"
import { cn } from "@/lib/utils"

/**
 * The marketplace's top bar — search plus the category rail — on every mobile
 * page, not only the feed.
 *
 * It lived inside MobileFeed alone, so the moment you opened messages, settings
 * or the sell form you lost both search and any way to jump to a category. In
 * the app especially, where there is no browser chrome, that leaves a screen
 * with no way anywhere except the tab bar.
 *
 * The For You / Following / Saved tabs are deliberately NOT here: those are the
 * home feed's own modes and mean nothing on a settings page. Search and
 * categories are global; tabs are not.
 */
export function GlobalMobileTopBar() {
  const pathname = usePathname()

  // In the app a black shield sits behind the status bar (html.capacitor::before).
  // Wherever this bar renders, the bar itself owns that strip and paints it
  // white — without this you get exactly the black band above the content that
  // the screenshot shows.
  useEffect(() => {
    const surface = claimSurface("#ffffff")
    return () => surface.release()
  }, [])

  const router = useRouter()
  const { t } = useLocale()
  const [searchOpen, setSearchOpen] = useState(false)

  const onCategory = useCallback(
    (id: string) => {
      // Categories always resolve on the feed — that's where results live.
      router.push(id === "all" ? "/" : `/?category=${id}`)
    },
    [router],
  )

  // Only a LISTING page is excluded — its photo runs under the status bar, so a
  // bar over it would defeat the point. `/products/` matched /products/new and
  // /products/drafts too, which is why the sell form had a bare black status bar
  // where the search should be.
  const isListingPage =
    pathname.startsWith("/products/") &&
    !pathname.startsWith("/products/new") &&
    !pathname.startsWith("/products/drafts")

  const hidden =
    pathname === "/" || // the feed renders its own, with tabs
    pathname.startsWith("/explore") ||
    pathname.startsWith("/app") ||
    isListingPage

  if (hidden) return null

  return (
    <>
      <div className="md:hidden sticky top-0 z-[60] border-b border-neutral-100 bg-white">
        <div
          className="px-4 pb-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.85rem)" }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void triggerHaptic("light")
                setSearchOpen(true)
              }}
              aria-label={t("mfeed.search_placeholder")}
              className="relative flex-1 h-11 rounded-full border border-neutral-200 bg-neutral-100 pl-10 pr-10 text-left transition-transform active:scale-[0.99]"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <AnimatedSearchPlaceholder
                active
                prefix={`${t("mfeed.search_for")} `}
                quoted
                className="absolute left-10 right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500"
              />
            </button>
            <button
              type="button"
              aria-label={t("mfeed.filters")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 transition-transform active:scale-95"
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </button>

            {/* The same purple switcher the feed carries. It jumps to the feed in
                the view you pick — from here that IS the switch. */}
            <button
              type="button"
              aria-label={t("mfeed.view_reels")}
              onClick={() => router.push("/")}
              className="no-tap-fade relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
              style={{
                background: "linear-gradient(160deg, #8b5cf6 0%, #7c3aed 52%, #6d28d9 100%)",
                boxShadow:
                  "0 1px 2px rgba(76, 29, 149, 0.28), 0 6px 16px -4px rgba(124, 58, 237, 0.55), inset 0 1px 0 rgba(255,255,255,0.22)",
                transition: "transform 340ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 340ms ease",
              }}
            >
              <GalleryVerticalEnd className="h-[19px] w-[19px]" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pt-3 pb-3" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onCategory(c.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-200 active:scale-95",
                "bg-neutral-100 text-neutral-700 active:bg-neutral-200",
              )}
            >
              {t(`category.${c.id}`)}
            </button>
          ))}
        </div>
      </div>

      <MobileSearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectCategory={onCategory}
        initialQuery=""
      />
    </>
  )
}
