"use client"

import { useRouter } from "next/navigation"
import { navigateWithTransition } from "@/lib/nav-transition"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal } from "@/lib/native-bridge"

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

export function SmartLink({
  href,
  children,
  useClientNav,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { useClientNav?: boolean }) {
  const inApp = isNativeApp()
  const resolvedHref = inApp && href ? toInternalHref(href) : href
  const router = useRouter()

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
      return (
        <a
          {...linkSafeProps}
          href={resolvedHref}
          onClick={(e) => {
            e.preventDefault()
            if (typeof onClick === "function") onClick(e as any)
            if (needsHardNav) {
              window.location.href = resolvedHref
            } else {
              // Opening a listing is a push — it slides in from the right, the
              // way a native screen does, so it reads as going deeper rather
              // than as the page being swapped out. Everything else navigates
              // plainly; a slide on a tab change would be motion for its own sake.
              const isPush = resolvedHref.startsWith("/products/")
              if (isPush) navigateWithTransition("forward", () => router.push(resolvedHref))
              else router.push(resolvedHref)
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
