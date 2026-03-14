"use client"

import { useRouter } from "next/navigation"
import { isNativeApp } from "@/lib/platform-utils"

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

    // Only rewrite storelib.com subdomains
    if (!host.endsWith(`.${mainDomain}`)) return href

    const username = host.replace(`.${mainDomain}`, "")
    if (!username || username.includes(".")) return href

    const path = url.pathname

    // sellername.storelib.com/ -> /u/sellername
    if (path === "/" || path === "") return `/u/${username}`

    // sellername.storelib.com/p/slug -> /p/slug
    if (path.startsWith("/p/")) return path

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

  // In Capacitor, ALWAYS use window.location.href for root-relative paths to
  // prevent URL mixing. Next.js <Link> / router.push can resolve paths relative
  // to the current route in some Capacitor WebView contexts — e.g. clicking a
  // seller link on /p/slug would produce /p/slug/u/seller instead of /u/seller.
  // window.location.href with a leading "/" is always root-relative.
  // NativeAuthGate handles session restore on reload.
  // Exception: useClientNav=true forces router.push() for smooth same-layout
  // transitions (e.g. /explore → /p/slug) without a full page reload/white flash.
  if (inApp && resolvedHref?.startsWith("/")) {
    const { target, rel, onClick, ...linkSafeProps } = props
    return (
      <a
        {...linkSafeProps}
        href={resolvedHref}
        onClick={(e) => {
          e.preventDefault()
          if (typeof onClick === "function") onClick(e as any)
          if (useClientNav) {
            router.push(resolvedHref)
          } else {
            window.location.href = resolvedHref
          }
        }}
        style={{ ...TOUCH_STYLES, ...(linkSafeProps.style as React.CSSProperties) }}
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
