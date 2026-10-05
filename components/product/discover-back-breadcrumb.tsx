"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { fallbackHref, planBack } from "@/lib/navigation/back-plan"
import { goBackOr, readBackEvidence } from "@/lib/navigation/go-back"
import { useFirstTap } from "@/lib/navigation/first-tap"
import { usePressFeedback } from "@/lib/navigation/press-feedback"

/** The header's computer layout starts here (.platform-header-row in app/globals.css). */
const DESKTOP_QUERY = "(min-width: 768px)"
/** Where a product opened from Explore goes back to on a computer when nothing of ours is behind it. */
export const EXPLORE_HREF = "/explore"

/**
 * Drop this into any page that links to product pages so the back breadcrumb
 * on the product page shows that page's name (e.g. "< John's Store").
 * Renders nothing visible.
 */
export function BackLabelSetter({ label }: { label: string }) {
  useEffect(() => {
    try { sessionStorage.setItem("backPageName", label) } catch { /* ignore */ }
  }, [label])
  return null
}

/**
 * Back breadcrumb rendered above product content.
 *
 * Visible in two cases:
 *  1. Capacitor native app (iOS/Android): always shown on ALL product pages.
 *     Primary: CSS rule `html.capacitor [data-discover-breadcrumb]` activates
 *     synchronously before first paint (html.capacitor set via inline <script>).
 *     Backup: useEffect directly sets style.display="flex" in case the CSS
 *     rule fails to apply (e.g. specificity conflict or late class application).
 *  2. Web/desktop: only shown when showOnWeb=true (URL has ?layout=discover&recommended=1).
 *
 * The back label is read from sessionStorage key "backPageName" set by explore/
 * category/store pages before navigating to a product. Falls back to "Back".
 *
 * WHERE IT GOES. It called `router.back()` whatever was behind it, so a
 * product opened cold in the app (a notification, a shared link) had a back
 * that did nothing at all. It is a link to the creator's page now, and a
 * plain press goes back only when lib/navigation/back-plan says there is a
 * page of ours to go back to. A label read from sessionStorage describes the
 * page that set it, which may be in the past rather than behind this one, so
 * with nowhere to go back to it names the creator, which is where it goes.
 */
export function DiscoverBackBreadcrumb({
  showOnWeb = false,
  creatorHref,
  creatorName,
}: {
  showOnWeb?: boolean
  /** The creator's page, where the control goes when there is nothing behind. */
  creatorHref?: string
  creatorName?: string
}) {
  const router = useRouter()
  const ref = useRef<HTMLAnchorElement>(null)
  const [backLabel, setBackLabel] = useState("Back")
  const href = fallbackHref(creatorHref)
  /*
    ON A COMPUTER, A PRODUCT OPENED FROM EXPLORE GOES BACK TO EXPLORE. The
    control is drawn there now as on a phone (app/globals.css), and with
    nothing of ours behind it (a link opened in a new tab) the place this
    visitor was browsing is Explore, not the creator's page; the creator is
    one click away in the bar above. A phone and the app keep the creator.
    Read at the press, so the server's HTML and the first render agree.
  */
  const desktopFromExplore = () =>
    showOnWeb && !document.documentElement.classList.contains("capacitor") && !!window.matchMedia?.(DESKTOP_QUERY).matches
  const target = () => (desktopFromExplore() ? EXPLORE_HREF : href)

  useEffect(() => {
    // Read dynamic back label stored by the previous page, when that page is
    // really behind this one; otherwise the control names where it goes.
    if (planBack(readBackEvidence(), target()).kind === "navigate") {
      if (desktopFromExplore()) setBackLabel("Explore")
      else if (creatorName) setBackLabel(creatorName)
    } else {
      try {
        const stored = sessionStorage.getItem("backPageName")
        if (stored) setBackLabel(stored)
      } catch { /* ignore */ }
    }

    if (!ref.current) return
    // JS backup: force visibility with !important so this overrides any CSS
    // rule. At every width now: a computer shows it too (see above).
    const isNative = document.documentElement.classList.contains("capacitor")
    if (isNative || showOnWeb) {
      ref.current.style.setProperty("display", "flex", "important")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnWeb, href, creatorName])

  /*
    ===========================================================================
     THE ONE BACK ON A PRODUCT IN THE APP, AND IT IS EASY TO HIT
    ===========================================================================
    In the app the product's own dark bar is gone (components/store-builder/
    discover-sticky-wrapper.tsx), so this is the way back, and it was 14px
    of grey text with a 16px chevron: a target a thumb misses. The link is
    now a 44px tall pill with padding all round, pulled back by its own
    padding so the words sit exactly where they did, and a few more pixels
    of invisible reach around that. It tints under the finger on the frame
    it lands, without changing size (lib/navigation/press-feedback.ts), and it acts on the
    lift of the first tap (lib/navigation/first-tap.ts), so a tap that iOS
    turns into no click, or a second tap of a double tap, can never need a
    second go or go back twice. The page behind is the router's own kept
    copy, and Explore puts its scroll back before it paints.
  */
  const press = usePressFeedback<HTMLAnchorElement>()
  const tap = useFirstTap<HTMLAnchorElement>(() => {
    goBackOr(target(), (to) => router.push(to))
  })

  return (
    <a
      ref={ref}
      href={href}
      {...tap}
      onPointerDown={(e) => {
        press.onPointerDown(e)
        tap.onPointerDown(e)
      }}
      onPointerUp={(e) => {
        press.onPointerUp()
        tap.onPointerUp(e)
      }}
      onPointerCancel={() => {
        press.onPointerUp()
        tap.onPointerCancel()
      }}
      onPointerLeave={press.onPointerUp}
      data-discover-breadcrumb={showOnWeb ? "web" : "native"}
      data-back-control=""
      className={[
        "relative -ml-3 mb-3 -mt-1 min-h-[44px] w-fit select-none items-center gap-1.5 rounded-full py-2.5 pl-3 pr-4",
        "cursor-pointer touch-manipulation text-[#6b7280] [-webkit-tap-highlight-color:transparent]",
        /* A little more reach than it shows, for a thumb that lands near it. */
        "before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']",
        /* Pressed is a tint and the ink darkening, never a size change (round 11: no bump). */
        "transition-[background-color,color] duration-200 ease-out",
        "data-[pressed]:bg-[#1a1a2e]/[0.07] data-[pressed]:text-[#1a1a2e] data-[pressed]:duration-0",
        /* A pointer on a computer gets a hover ground, a keyboard a ring (the control shows at every width now). */
        "[@media(hover:hover)_and_(pointer:fine)]:hover:text-[#1a1a2e] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#1a1a2e]/[0.04]",
        "outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15",
      ].join(" ")}
    >
      <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
      <span className="text-[15px] font-medium">{backLabel}</span>
    </a>
  )
}
