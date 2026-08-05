"use client"

import { useCallback, useRef, useState } from "react"
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
 * Instant acknowledgement of a finger — for taps, and only for taps.
 *
 * Everything else about opening a page takes time you can't get to zero — a
 * fetch, a render, an animation. What you *can* make immediate is the reply to
 * the touch itself, and that is most of what "instant" feels like: the highlight
 * lands on pointerdown, before any of the work starts, so the tap is never in
 * doubt while the page is on its way.
 *
 * The catch is that pointerdown also fires at the start of every scroll, because
 * a scroll begins with a finger on a card. So the highlight is withdrawn the
 * moment the finger travels — the same rule UIKit uses for a table row, and the
 * reason a native list doesn't light up while you flick through it.
 *
 * The haptic can't work that way, because a vibration cannot be taken back once
 * it has fired. It waits for the tap to actually be a tap: it goes with the
 * navigation, in the click handler, which a scroll never reaches. That is late
 * by a few milliseconds and right every time, and being right matters more —
 * a buzz on every scroll is worse than no buzz at all.
 *
 * ---------------------------------------------------------------------------
 * The screen you are leaving starts moving on the CLICK, not on the finger
 * ---------------------------------------------------------------------------
 * Opening a listing animates both halves of the journey now: the outgoing screen
 * eases down, the route changes in the middle of it, and the arrival takes the
 * mark off so the same element carries on back up. See lib/tab-leave.ts.
 *
 * The tab bar arms that on POINTERDOWN, for the running start, and a card must
 * not. `tab-leaving` puts an opacity transition on <main>, which on the home
 * feed is a full-screen grid of photographs — so arming it on pointerdown meant
 * every scroll gesture began by compositing the entire screen into one layer,
 * and every scroll gesture then reversed it 10px later when the finger proved to
 * be scrolling. Two full-screen opacity transitions per flick, on the longest
 * scroller in the app. That is not a transition cost, it is a scrolling cost,
 * and it made the feed feel broken.
 *
 * A tab is a button you cannot scroll from, so pointerdown is free there. A card
 * is in a grid, and every scroll starts with a pointerdown on one. So the leave
 * begins in the click handler, where the gesture has already been proven to be a
 * tap. What is lost is the few milliseconds between the finger landing and
 * lifting; what is kept is everything from there to the route committing, which
 * on a cold open is nearly all of it.
 */
function useTap(enabled: boolean, showHighlight: boolean) {
  const [pressed, setPressed] = useState(false)
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const dragged = useRef(false)

  const down = useCallback(
    (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }
      dragged.current = false
      if (showHighlight) setPressed(true)
    },
    [showHighlight],
  )

  const move = useCallback((e: React.PointerEvent) => {
    const from = start.current
    if (!from || dragged.current) return
    if (Math.abs(e.clientX - from.x) > TAP_SLOP || Math.abs(e.clientY - from.y) > TAP_SLOP) {
      dragged.current = true
      setPressed(false)
    }
  }, [])

  // The browser taking the gesture over IS the answer: a pointercancel here
  // means a scroller claimed the finger. Nothing that follows is a tap.
  const cancel = useCallback(() => {
    dragged.current = true
    setPressed(false)
  }, [])

  const up = useCallback(() => setPressed(false), [])

  /**
   * Was the gesture behind this click a tap?
   *
   * WebKit will still deliver a click after a short drag, and after a
   * press-and-hold — which is why "did a click happen" is not the same question
   * as "did someone tap this". A vibration is irreversible, so it only goes out
   * when the answer is yes.
   *
   * A click with no pointer history counts as a tap: that is a keyboard, an
   * assistive device, or a synthetic event, and the only thing being ruled out
   * here is a finger that was doing something else.
   */
  const wasTap = useCallback((e: { timeStamp: number }) => {
    const from = start.current
    if (!from) return true
    if (dragged.current) return false
    return e.timeStamp - from.t < TAP_TIME
  }, [])

  // Tracking is attached whenever the link is interactive, INDEPENDENT of
  // whether it shows a highlight. The reel photo turns the highlight off because
  // it is swiped as often as it is tapped — and turning that off used to take
  // the tracking with it, leaving the one surface most often scrolled over with
  // no way to tell a scroll from a tap. That is exactly backwards.
  const handlers = enabled
    ? ({
        "data-pressed": pressed ? "true" : "false",
        onPointerDown: down,
        onPointerMove: move,
        onPointerUp: up,
        onPointerCancel: cancel,
        onPointerLeave: up,
      } as const)
    : {}

  return { handlers, wasTap }
}

export function SmartLink({
  href,
  children,
  useClientNav,
  blend,
  press: pressProp,
  warmImage,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  useClientNav?: boolean
  /**
   * The visual highlight, on by default wherever `blend` is. Turn it off on
   * surfaces you also swipe — a reel photo is dragged as often as it is tapped,
   * and a highlight on pointerdown would flinch at the start of every swipe.
   *
   * This is the HIGHLIGHT only. Gesture tracking stays on regardless, because
   * telling a tap from a scroll matters most precisely where the highlight is
   * least wanted.
   */
  press?: boolean
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
  const { handlers: press, wasTap } = useTap(!!blend, pressProp ?? !!blend)

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
