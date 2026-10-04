"use client"

import Link from "next/link"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal } from "@/lib/native-bridge"
import { needsDocumentLoad, nativeLinkFor } from "@/lib/native-links"
import { toSameOriginPath } from "@/lib/url-helpers"

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

  /*
    ===========================================================================
     IN THE PHONE APP, A STORELIB ADDRESS IS FOLLOWED IN THE APP
    ===========================================================================
    lib/native-links.ts decides what the address is. This used to send two
    kinds of link to Safari: anything with target="_blank" (the creator link
    on a product page) and any absolute address it could not turn into a path,
    which included https://storelib.com/<handle>/<slug> itself, the address
    getProductUrl hands every product card on Explore. So a product tapped on
    Explore left the app. Now:

      a storelib.com page (however it is spelled, target or not)
                       a Next link for the same layout, a document load for
                       /app, the library and the builders, which are another
                       layout and auth context
      a creator's website (<name>.storelib.com)
                       this WebView goes there (it stays in the app once the
                       host is in allowNavigation, with the next native release)
      somebody else's site
                       the system browser (openExternal)
  */
  if (inApp) {
    const { target, rel, onClick, ...linkSafeProps } = props
    const link = href ? nativeLinkFor(href) : ({ kind: "none" } as const)
    /* A page of the same layout is a Next link, as on the web: prefetched when it comes into view, followed on the client, never a new window. */
    if (link.kind === "path" && useClientNav !== false && !needsDocumentLoad(link.path)) {
      return (
        <Link href={link.path} {...linkSafeProps} onClick={onClick} style={{ ...TOUCH_STYLES, ...(linkSafeProps.style as React.CSSProperties) }}>
          {children}
        </Link>
      )
    }
    const shown = link.kind === "path" ? link.path : href
    return (
      <a
        {...linkSafeProps}
        href={shown}
        onClick={(e) => {
          if (typeof onClick === "function") onClick(e as any)
          if (link.kind === "none") return
          e.preventDefault()
          if (link.kind === "path") {
            window.location.href = link.path
          } else if (link.kind === "host") {
            window.location.href = link.url
          } else {
            openExternal(link.url)
          }
        }}
        style={{ ...TOUCH_STYLES, ...(linkSafeProps.style as React.CSSProperties) }}
      >
        {children}
      </a>
    )
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
  const internalPath = toSameOriginPath(href)
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
      href={href}
      {...props}
      style={{ ...TOUCH_STYLES, ...(props.style as React.CSSProperties) }}
    >
      {children}
    </a>
  )
}
