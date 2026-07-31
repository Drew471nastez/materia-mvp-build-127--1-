"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal, triggerHaptic } from "@/lib/native-bridge"
import { navigateBlended } from "@/lib/nav-blend"

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

/**
 * Instant acknowledgement of a finger.
 *
 * Everything else about opening a page takes time you can't get to zero — a
 * fetch, a render, an animation. What you *can* make immediate is the reply to
 * the touch itself, and that is most of what "instant" feels like: the press
 * lands on pointerdown, before any of the work starts, so the tap is never in
 * doubt while the page is on its way.
 *
 * pointerdown rather than click, because click waits for the lift. The haptic is
 * a no-op off-device. Released on cancel too, so scrolling away from a card you
 * brushed doesn't leave it stuck down.
 */
function usePress(enabled: boolean) {
  const [pressed, setPressed] = useState(false)
  const down = useCallback(() => {
    if (!enabled) return
    setPressed(true)
    void triggerHaptic("light")
  }, [enabled])
  const up = useCallback(() => setPressed(false), [])
  if (!enabled) return {}
  return {
    "data-pressed": pressed ? "true" : "false",
    onPointerDown: down,
    onPointerUp: up,
    onPointerCancel: up,
    onPointerLeave: up,
  } as const
}

export function SmartLink({
  href,
  children,
  useClientNav,
  blend,
  press: pressProp,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  useClientNav?: boolean
  /**
   * Press feedback, on by default wherever `blend` is. Turn it off on surfaces
   * you also swipe — a reel photo is dragged sideways as often as it is tapped,
   * and pointerdown can't yet tell the two apart, so it would flinch on a swipe.
   */
  press?: boolean
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
  const press = usePress(pressProp ?? !!blend)

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
