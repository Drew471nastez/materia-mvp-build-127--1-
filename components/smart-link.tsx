"use client"

import { useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal, triggerHaptic } from "@/lib/native-bridge"
import { navigateBlended } from "@/lib/nav-blend"
import { warmListingImage } from "@/lib/warm-image"
import { beginTabLeave } from "@/lib/tab-leave"

/**
 * Convert a full subdomain URL to an internal path for in-app navigation.
 *
 * Examples:
 *   https://seller.storelib.com           -> /u/seller
 *   https://seller.storelib.com/p/slug     -> /p/slug
 *   https://seller.storelib.com/links      -> /l/seller
 *   /u/seller  (already internal)          -> /u/seller
 */
function toInternalHref(href: string): string {
  // Already a relative/internal path — leave it alone
  if (href.startsWith("/")) return href

  try {
    const url = new URL(href)
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const host = url.hostname

    // Main domain (storelib.com / www.storelib.com): keep the URL as an INTERNAL
    // path so the native app navigates inside its own WebView instead of ejecting
    // to the system browser. Covers "/" and marketplace routes like /explore.
    if (host === mainDomain || host === `www.${mainDomain}`) {
      return (url.pathname || "/") + url.search
    }

    // Only rewrite storelib.com subdomains
    if (!host.endsWith(`.${mainDomain}`)) return href

    const username = host.replace(`.${mainDomain}`, "")
    if (!username || username.includes(".")) return href

    const path = url.pathname

    // sellername.storelib.com/ -> /u/sellername
    if (path === "/" || path === "") return `/u/${username}`

    // sellername.storelib.com/links -> /l/username
    if (path === "/links" || path === "/links/") return `/l/${username}`

    // Any other path on the subdomain — keep as /u/username + path
    return path
  } catch {
    return href
  }
}

// Touch styles applied to every SmartLink to fix iOS single-tap behaviour:
// - touchAction:manipulation removes the 300ms tap delay and prevents double-tap zoom
// - userSelect:none prevents the first tap from selecting text (which requires a
//   second tap to actually fire the click on iOS)
// - WebkitTapHighlightColor:transparent removes the grey flash on iOS tap
const TOUCH_STYLES: React.CSSProperties = {
  touchAction: "manipulation",
  userSelect: "none",
  WebkitTapHighlightColor: "transparent",
}

/** Past this much finger travel, the gesture is a scroll and not a tap. */
const TAP_SLOP = 10
/** Past this long on the glass, it is a press-and-hold, not a tap. */
const TAP_TIME = 700

/**
 * Telling a tap from a scroll, for the price of two events and nothing else.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HAPPENS ON TOUCH ANY MORE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * This used to light the card up under your finger: `data-pressed` on the link,
 * a `pressed` React state driving it, an onPointerMove on every link to take it
 * back off, and this rule in app/globals.css —
 *
 *   .press-dim[data-pressed="true"],
 *   .press-dim:has(a[data-pressed="true"]) {
 *     transform: scale(0.968);
 *     filter: brightness(0.94);
 *   }
 *
 * Every one of those is paid at the exact moment a scroll begins, because a
 * scroll begins with a finger on a card.
 *
 * `:has()` is the expensive part. Flipping an attribute INSIDE a tile forces the
 * style engine to re-evaluate the `:has()` on its ancestor, and it cannot know
 * which ancestors care without checking. `filter` is the second: brightness on a
 * photograph is a re-rasterisation, not a composite.
 *
 * Measured in Chromium on a 40-tile grid, one touch = the attribute going on
 * and off again:
 *
 *   with the rule       5.006 ms
 *   without it          0.024 ms
 *
 * Five milliseconds of main thread, twice per flick, at the one moment the
 * browser is deciding whether this gesture is a scroll. A 120Hz frame is 8.3ms.
 * That is the feed "blocking" when you touch it, and it was never a scroll bug
 * — it was a press effect nobody asked for, paid for on every scroll.
 *
 * So: no highlight, no attribute, no state, no per-move listener. Two events per
 * gesture, both writing to a ref, neither causing a render. The reply to the
 * finger is the page opening.
 *
 * The haptic still waits for the click, because a vibration cannot be taken back
 * once it has fired and a buzz on every scroll is worse than no buzz at all.
 *
 * ---------------------------------------------------------------------------
 * The screen you are leaving starts moving on the CLICK, not on the finger
 * ---------------------------------------------------------------------------
 * `tab-leaving` puts an opacity transition on <main>, which on the home feed is
 * a full-screen grid of photographs. The tab bar arms it on pointerdown for the
 * running start, and a card must not: that would composite the whole screen at
 * the start of every scroll and reverse it ten pixels later. A tab is a button
 * you cannot scroll from; a card is not.
 */
function useTap(enabled: boolean) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const end = useRef<{ x: number; y: number } | null>(null)

  const down = useCallback((e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }
    end.current = null
  }, [])

  // Once per gesture, not once per frame. Where the finger FINISHED is all the
  // click needs to know, and pointermove was only ever a way of finding that out
  // sixty times a second.
  const up = useCallback((e: React.PointerEvent) => {
    end.current = { x: e.clientX, y: e.clientY }
  }, [])

  /**
   * Was the gesture behind this click a tap?
   *
   * WebKit will still deliver a click after a short drag, and after a
   * press-and-hold — which is why "did a click happen" is not the same question
   * as "did someone tap this".
   *
   * A click with no pointer history counts as a tap: that is a keyboard, an
   * assistive device, or a synthetic event, and the only thing being ruled out
   * here is a finger that was doing something else.
   */
  const wasTap = useCallback((e: { timeStamp: number; clientX?: number; clientY?: number }) => {
    const from = start.current
    if (!from) return true
    const to =
      end.current ??
      (typeof e.clientX === "number" && typeof e.clientY === "number" ? { x: e.clientX, y: e.clientY } : null)
    if (to && (Math.abs(to.x - from.x) > TAP_SLOP || Math.abs(to.y - from.y) > TAP_SLOP)) return false
    return e.timeStamp - from.t < TAP_TIME
  }, [])

  const handlers = enabled ? ({ onPointerDown: down, onPointerUp: up } as const) : {}

  return { handlers, wasTap }
}

export function SmartLink({
  href,
  children,
  useClientNav,
  blend,
  warmImage,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  useClientNav?: boolean
  /**
   * There is deliberately no `press` prop. There is no highlight to turn off any
   * more — see the note on useTap; it cost five milliseconds of main thread per
   * touch and was why the feed stuttered when you put a finger on it.
   */
  /**
   * A photo the destination will show full-bleed. Fetched when the finger lands,
   * so the page it opens is not still waiting on its own picture. Pointless from
   * a surface that already shows the photo at that size — see warm-image.
   */
  warmImage?: string | null
  /**
   * Opt this link into a blended, client-side route change — and into press
   * feedback. Set it on things that behave like cards: a tap should feel like
   * opening the thing you touched, not like loading a document.
   *
   * It is opt-in because on the web every other SmartLink is deliberately a real
   * <a> full navigation, which is what keeps cross-layout and auth-sensitive
   * routes correct. This changes that for the links that want it, nothing else.
   */
  blend?: boolean
}) {
  const inApp = isNativeApp()
  const resolvedHref = inApp && href ? toInternalHref(href) : href
  const router = useRouter()
  const warmed = useRef(false)
  const { handlers: press, wasTap } = useTap(!!blend)

  // In Capacitor, use router.push() for same-layout paths (smooth, no white flash).
  // Cross-layout routes (/app, /store-builder, /library) and explicit
  // useClientNav=false still use window.location.href (full reload for auth context).
  // window.location.href remains the safe fallback for truly cross-context nav.
  // target="_blank" on native always opens in the external system browser.
  if (inApp) {
    const { target, rel, onClick, ...linkSafeProps } = props

    // target="_blank" → open in external browser (SFSafariViewController / Chrome Custom Tab)
    if (target === "_blank") {
      const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
      const externalUrl =
        href?.startsWith("/")
          ? `https://${mainDomain}${href}`
          : (href ?? "")
      return (
        <a
          {...linkSafeProps}
          href={href}
          onClick={(e) => {
            e.preventDefault()
            if (typeof onClick === "function") onClick(e as any)
            if (externalUrl) openExternal(externalUrl)
          }}
          style={{ ...TOUCH_STYLES, ...(linkSafeProps.style as React.CSSProperties) }}
        >
          {children}
        </a>
      )
    }

    if (resolvedHref?.startsWith("/")) {
      const needsHardNav =
        useClientNav === false ||
        resolvedHref.startsWith("/app") ||
        resolvedHref.startsWith("/store-builder") ||
        resolvedHref.startsWith("/library")
      // Warm the route on the way to the tap.
      //
      // SmartLink renders a plain <a> and pushes on click, so Next never
      // prefetched any of these — every product tap was a COLD fetch of a
      // force-dynamic page doing three database queries. That is the two-second
      // wait before the page appeared; the animation was only ever the last
      // thing to happen, not the slow part.
      //
      // pointerenter covers a mouse approaching, touchstart covers the moment a
      // finger lands, which buys time before it lifts and lets the rest overlap
      // the slide. Prefetching every card up front would be worse than the
      // problem — a hundred dynamic pages fetched to open one.
      const warm = () => {
        if (needsHardNav || warmed.current) return
        warmed.current = true
        router.prefetch(resolvedHref)
        warmListingImage(warmImage, "high")
      }

      return (
        <a
          {...linkSafeProps}
          {...press}
          href={resolvedHref}
          onPointerEnter={warm}
          onTouchStart={warm}
          onClick={(e) => {
            e.preventDefault()
            if (typeof onClick === "function") onClick(e as any)
            if (needsHardNav) {
              window.location.href = resolvedHref
            } else if (blend) {
              // Only for a real tap. A click alone is not proof of one —
              // WebKit delivers them after short drags and after long presses.
              if (wasTap(e)) void triggerHaptic("light")
              // The dip starts here, not on pointerdown — see the note on
              // useTap. By this point the gesture is definitely a tap.
              beginTabLeave()
              navigateBlended("enter", () => router.push(resolvedHref))
            } else {
              router.push(resolvedHref)
            }
          }}
          style={{ ...TOUCH_STYLES, ...(linkSafeProps.style as React.CSSProperties) }}
        >
          {children}
        </a>
      )
    }

    // Absolute URL that toInternalHref could not convert to an internal path
    // (e.g. a product page on a creator's subdomain store, or any external URL
    // the app cannot route to). Open in the in-app browser (SFSafariViewController
    // on iOS / Chrome Custom Tab on Android) so the user stays within the app
    // shell rather than being sent to the system browser.
    if (resolvedHref) {
      return (
        <a
          {...linkSafeProps}
          href={resolvedHref}
          onClick={(e) => {
            e.preventDefault()
            if (typeof onClick === "function") onClick(e as any)
            openExternal(resolvedHref)
          }}
          style={{ ...TOUCH_STYLES, ...(linkSafeProps.style as React.CSSProperties) }}
        >
          {children}
        </a>
      )
    }
  }

  // Web, opted in: the same client-side, warmed, blended navigation the app gets.
  //
  // Until now this branch rendered a bare <a href>, which is a FULL PAGE LOAD —
  // a fresh document, a fresh React tree, every query run again from cold. That
  // is the whole of the multi-second wait on mobile web, and no amount of
  // animation work could have touched it, because the animation was on the other
  // side of a document teardown.
  if (blend && useClientNav !== false && resolvedHref?.startsWith("/")) {
    const { onClick, ...rest } = props
    const warm = () => {
      if (warmed.current) return
      warmed.current = true
      router.prefetch(resolvedHref)
      warmListingImage(warmImage, "high")
    }
    return (
      <a
        {...rest}
        {...press}
        href={resolvedHref}
        onPointerEnter={warm}
        onTouchStart={warm}
        onClick={(e) => {
          // Let the browser have the ones the browser should keep: new tab,
          // new window, download, save-as. Only a plain left click is ours.
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          if (typeof onClick === "function") onClick(e)
          if (wasTap(e)) void triggerHaptic("light")
          beginTabLeave()
          navigateBlended("enter", () => router.push(resolvedHref))
        }}
        style={{ ...TOUCH_STYLES, ...(rest.style as React.CSSProperties) }}
      >
        {children}
      </a>
    )
  }

  return (
    <a
      href={resolvedHref}
      {...props}
      target={inApp ? undefined : props.target}
      rel={inApp ? undefined : props.rel}
      style={{ ...TOUCH_STYLES, ...(props.style as React.CSSProperties) }}
    >
      {children}
    </a>
  )
}
