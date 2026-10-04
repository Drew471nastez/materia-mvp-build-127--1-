"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal } from "@/lib/native-bridge"
import { getLinksInternalPath, isOnePageHost, toSameOriginPath } from "@/lib/url-helpers"

/**
 * Convert a full subdomain URL to an internal path for in-app navigation.
 *
 * Examples:
 *   https://seller.storelib.com           -> /u/seller
 *   https://seller.storelib.com/p/slug     -> /p/slug
 *   https://seller.storelib.com/links      -> /seller/links
 *   https://storelib.me/seller             -> /seller/links
 *   /u/seller  (already internal)          -> /u/seller
 */
function toInternalHref(href: string): string {
  // Already a relative/internal path — leave it alone
  if (href.startsWith("/")) return href

  try {
    const url = new URL(href)
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const host = url.hostname

    // storelib.me/name -> /name/links, the route the OnePage renders from
    if (isOnePageHost(host)) {
      const name = url.pathname.split("/").filter(Boolean)[0]
      return name ? getLinksInternalPath(name.toLowerCase()) : href
    }

    // Only rewrite storelib.com subdomains
    if (!host.endsWith(`.${mainDomain}`)) return href

    const username = host.replace(`.${mainDomain}`, "")
    if (!username || username.includes(".")) return href

    const path = url.pathname

    // sellername.storelib.com/ -> /u/sellername
    if (path === "/" || path === "") return `/${username}`

    // sellername.storelib.com/links -> /username/links
    if (path === "/links" || path === "/links/") return getLinksInternalPath(username)

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
        resolvedHref.startsWith("/creator-page") ||
        resolvedHref.startsWith("/store-builder") ||
        resolvedHref.startsWith("/account/library")
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

  /**
   * ===========================================================================
   *  ON THE WEB, AN INTERNAL LINK IS A LINK NEXT KNOWS ABOUT
   * ===========================================================================
   * This returned a bare `<a href>` for everything. A bare anchor is a FULL
   * DOCUMENT LOAD: the browser throws this page away, asks the server for the
   * next one, and waits. Nothing is prefetched, the route's `loading.tsx` is
   * never reached — a loading boundary only exists inside a client navigation
   * — and the product page is `force-dynamic`, so what a visitor gets after
   * pressing a product card is a white page for as long as the server takes.
   * That is the "more than two seconds".
   *
   * `next/link` changes both halves. It prefetches the route when the link
   * comes into view, so the work is already done before the press; and it
   * navigates on the client, so the route's own skeleton is on screen in the
   * same frame as the tap and the content streams in under it.
   *
   * THE HARD-NAVIGATION LIST IS THE SAME ONE THE NATIVE BRANCH USES, and for
   * the same reason: /app, /library and the builders are a different layout
   * and a different auth context, and a soft navigation into them carries
   * state that a full load is relied upon to clear. `useClientNav === false`
   * is a caller saying the same thing about a specific link.
   *
   * Anything not internal — another origin, a mailto, an anchor — is not
   * Next's to route and stays exactly as it was.
   */
  const internalPath = toSameOriginPath(resolvedHref)
  const needsHardNav =
    useClientNav === false ||
    (!!internalPath &&
      (internalPath.startsWith("/app") ||
        internalPath.startsWith("/creator-page") ||
        internalPath.startsWith("/store-builder") ||
        internalPath.startsWith("/website-builder") ||
        internalPath.startsWith("/account/library")))

  if (internalPath && !needsHardNav) {
    return (
      <Link
        href={internalPath}
        {...props}
        style={{ ...TOUCH_STYLES, ...(props.style as React.CSSProperties) }}
      >
        {children}
      </Link>
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
