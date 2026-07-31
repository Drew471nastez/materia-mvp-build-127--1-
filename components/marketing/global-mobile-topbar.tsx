"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { GalleryVerticalEnd, SlidersHorizontal } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { MobileSearchOverlay } from "@/components/explore/mobile-search-overlay"
import { CategoryPillRail, SearchTrigger } from "@/components/marketplace/search-row"
import { claimSurface } from "@/lib/surface-bg"

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
            <SearchTrigger onOpen={() => setSearchOpen(true)} />
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

        <CategoryPillRail onSelect={onCategory} />
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
