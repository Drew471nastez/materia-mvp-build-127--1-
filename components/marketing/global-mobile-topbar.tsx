"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search, SlidersHorizontal } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { MobileSearchOverlay } from "@/components/explore/mobile-search-overlay"
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
    document.documentElement.classList.add("native-feed-bg")
    return () => document.documentElement.classList.remove("native-feed-bg")
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
      <div className="md:hidden sticky top-0 z-[60] border-b border-neutral-100 bg-white/95 backdrop-blur-md">
        <div
          className="px-4 pb-2.5"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.6rem)" }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={t("mfeed.search_placeholder")}
              className="relative h-10 flex-1 rounded-full border border-neutral-200 bg-neutral-100 pl-9 pr-3 text-left transition-transform active:scale-[0.99]"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <span className="absolute left-9 right-3 top-1/2 -translate-y-1/2 truncate text-sm text-neutral-500">
                {t("mfeed.search_placeholder")}
              </span>
            </button>
            <button
              type="button"
              aria-label={t("mfeed.filters")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 transition-transform active:scale-95"
            >
              <SlidersHorizontal className="h-[17px] w-[17px]" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-2.5" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onCategory(c.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200 active:scale-95",
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
