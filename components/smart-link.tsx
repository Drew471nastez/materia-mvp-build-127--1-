"use client"

import Link from "next/link"
import { isNativeApp } from "@/lib/platform-utils"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"

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
 * A link component that keeps navigation in-app in Capacitor native apps.
 *
 * In Capacitor:
 *  1. Uses Next.js <Link> for internal paths to enable client-side navigation
 *     which preserves React state — including the Supabase singleton client
 *     with its active auth session. Full page reloads (plain <a>) force the
 *     session to be re-read from Capacitor Preferences (async), causing a
 *     brief "logged out" state or auth loss.
 *  2. Strips target="_blank" so links don't open the system browser
 *  3. Rewrites subdomain URLs (seller.storelib.com) to internal paths
 *     (/u/seller) to avoid cross-origin navigation that loses the
 *     native auth session stored in SharedPreferences.
 *
 * On desktop web, behaves exactly like a normal <a> tag.
 */
export function SmartLink({
  href,
  children,
  onClick,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const inApp = isNativeApp()
  const resolvedHref = inApp && href ? toInternalHref(href) : href

  // Fire the loading bar immediately on every tap/click (native AND browser)
  // so product cards, seller profiles, and "more from" links show the bar
  // within <100 ms — before the route actually changes.
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    startNavigationLoading()
    onClick?.(e)
  }

  // In Capacitor, use Next.js Link for internal paths to enable client-side
  // navigation which preserves the Supabase auth session (no full page reload).
  if (inApp && resolvedHref?.startsWith("/")) {
    const { target, rel, ...linkSafeProps } = props
    return (
      <Link href={resolvedHref} onClick={handleClick} {...linkSafeProps}>
        {children}
      </Link>
    )
  }

  return (
    <a
      href={resolvedHref}
      onClick={handleClick}
      {...props}
      target={inApp ? undefined : props.target}
      rel={inApp ? undefined : props.rel}
    >
      {children}
    </a>
  )
}
