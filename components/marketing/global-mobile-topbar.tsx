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

  // Pages with no chrome of their own. They dropped the strip because a listings
  // search does not belong over an account or a conversation — but the strip was
  // also the only thing padding them below the status bar in the app, so without
  // a replacement their first line renders straight through the clock and the
  // battery. That is the overlap: not a layout bug in those pages, a missing
  // inset that used to arrive by accident.
  const ownsNoChrome =
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    // The inbox, but not a thread: a conversation renders its own header and
    // pays the status-bar inset inside it, so a spacer here would push it down
    // by that inset twice.
    pathname === "/messages" ||
    pathname.startsWith("/purchases") ||
    pathname.startsWith("/sales")

  const hidden =
    pathname === "/" || // the feed renders its own, with tabs
    pathname.startsWith("/explore") ||
    pathname.startsWith("/app") ||
    // Your account is not a place you browse. A search field and a rail of
    // category pills belong above things to look through — over your own
    // profile, your settings, or your order history they are furniture from
    // another room, and they push the thing you actually came for down the
    // screen.
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings") ||
    // Messages are correspondence, not a catalogue. The inbox has its own
    // title and segmented control, and a thread has its own header with the
    // person's name in it — a search field for listings above either of them
    // is answering a question nobody asked here. It also cost the thread its
    // geometry: that page sizes itself to the viewport, so a strip stacked
    // above it pushed the composer below the fold.
    pathname.startsWith("/messages") ||
    pathname.startsWith("/purchases") ||
    pathname.startsWith("/sales") ||
    isListingPage

  if (hidden) {
    // The inset those pages lost, and nothing else. A listing page is excluded
    // deliberately — its photo is MEANT to run under the status bar — and so is
    // the feed, which pads itself. Native only: a browser draws its own chrome
    // above the page, so there is no inset to stand in for.
    if (ownsNoChrome) {
      return (
        <div
          aria-hidden
          className="native-only-topbar md:hidden shrink-0 bg-white"
          style={{ height: "env(safe-area-inset-top, 0px)" }}
        />
      )
    }
    return null
  }

  return (
    <>
      {/* .native-only-topbar: this strip is the app's substitute for a header —
          it exists because the shell has no browser chrome and no site header to
          carry search or categories. A mobile BROWSER has MobileWebHeader
          instead, and both at once is search twice and two rows of navigation,
          so CSS drops this one there. See app/globals.css. */}
      <div className="native-only-topbar md:hidden sticky top-0 z-[60] border-b border-neutral-100 bg-white">
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
