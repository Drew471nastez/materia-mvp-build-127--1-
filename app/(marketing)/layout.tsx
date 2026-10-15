import type React from "react"
import { Suspense } from "react"
import { isBuyerHeaderLight } from "@/lib/platform/buyer-header-theme"
import { isPlatformDomain, readWishlistCount } from "@/lib/platform/header-props"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"
import { LeaveIntoApp } from "@/components/navigation/leave-into-app"

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [initialWishlistCount, onPlatformDomain, buyerHeaderLight] = await Promise.all([
    readWishlistCount(),
    isPlatformDomain(),
    isBuyerHeaderLight(),
  ])
  return (
    /*
      ═══════════════════════════════════════════════════════════════════════
       THE PROVIDER IS GONE AGAIN, AND #253's OWN NOTE SAYS WHY IT CAN BE
      ═══════════════════════════════════════════════════════════════════════
      #253 wrapped this tree in LanguageProvider to stop /explore throwing,
      and its test says so in as many words: "if this ever stops being true
      the provider above can go too". It has stopped being true. The page
      calls useLocale now, whose LocaleProvider is in the ROOT layout, so
      nothing under (marketing) reaches the hook that needed this one.

      IT HAD TO GO, NOT MERELY COULD. lib/i18n/context returns null until a
      client effect has run:

          if (!isHydrated) return null

      Wrapped around this layout, that is every marketing page rendering
      nothing on the server. Measured against production while it was live,
      storelib.com/explore served 778 characters of visible text and no
      <main> element at all: no heading, no search field, no category pills,
      no products. The page still worked in a browser, because the content
      was in the RSC payload and hydration put it on screen, which is why
      nothing looked broken. A crawler that does not run JavaScript saw an
      empty document, and everybody else saw a blank frame first.
    */
    <div className="flex min-h-svh flex-col marketing-flex-wrapper">
      {/* Preconnect to image CDN — saves ~200-400ms on first image request */}
      <link rel="preconnect" href="https://cdn.sanity.io" />
      <BodyScrollRestorer />
      {/* Nothing until a navigation has been slow for 220ms; see the
          component for why it cannot block and cannot get stuck. */}
      <RouteLoadingBar />
      {/* A Dashboard press: this page fades off the dashboard rather than being cut away (round 31). */}
      <LeaveIntoApp />
      <ConditionalHeader initialWishlistCount={initialWishlistCount} onPlatformDomain={onPlatformDomain} buyerHeaderLight={buyerHeaderLight} />

      {/*
        ═══════════════════════════════════════════════════════════════════
         NO PAINT CONTAINMENT AROUND ELEVEN THOUSAND PIXELS
        ═══════════════════════════════════════════════════════════════════
        This carried `overflow-x: clip`, which is redundant: <html> already
        sets `overflow-x: hidden`, so anything too wide is clipped at the
        window and cannot produce a sideways scrollbar. What the extra rule
        did add was a containment box wrapped around the entire page, and on
        /explore that page is about eleven thousand pixels tall on a phone.

        The reported symptom is footer links, a category pill and product
        cards all painted into the same band of screen, which is not a
        layout overlap — every measurement of this page says main's bottom
        edge and the footer's top edge are the same number to the pixel.
        Three parts of a very tall document drawn on top of each other is
        iOS reusing the wrong tiles, and a containment box that size is one
        of the things that provokes it.

        `overflow-x: clip` also leaves VERTICAL overflow visible, so it was
        the one mechanism by which anything inside main could paint over the
        footer at all. Both reasons point the same way.
      */}
      <main className="flex-1">{children}</main>

      {/*
        And the footer gets its own stacking context, so it is composited as
        itself rather than as part of whatever is above it. It also arrives
        after hydration — see conditional-footer — which means it is inserted
        into a document the browser has already painted.
      */}
      <div className="relative isolate">
        <Suspense fallback={null}>
          <ConditionalFooter />
        </Suspense>
      </div>

      {/* The phone's Home, Search, Library and Profile bar, on the pages of
          this layout that are Storelib's own buyer pages. It decides which
          those are, and brings the room it takes at the end of the page. */}
      <BuyerTabBar />
    </div>
  )
}
