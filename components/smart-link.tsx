"use client"

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

/**
 * An anchor tag that keeps navigation in-app in Capacitor native apps.
 *
 * In Capacitor:
 *  1. Strips target="_blank" so links don't open the system browser
 *  2. Rewrites subdomain URLs (seller.storelib.com) to internal paths
 *     (/u/seller) to avoid cross-origin navigation that loses the
 *     native auth session stored in SharedPreferences.
 *
 * On desktop web, behaves exactly like a normal <a> tag.
 */
export function SmartLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  // Synchronous check — isNativeApp() returns false during SSR, so the
  // server renders the original href. On the client the very first render
  // already applies the rewrite, leaving no window where a stale
  // subdomain link could be clicked.
  const inApp = isNativeApp()

  const resolvedHref = inApp && href ? toInternalHref(href) : href

  return (
    <a
      href={resolvedHref}
      {...props}
      target={inApp ? undefined : props.target}
      rel={inApp ? undefined : props.rel}
    >
      {children}
    </a>
  )
}
