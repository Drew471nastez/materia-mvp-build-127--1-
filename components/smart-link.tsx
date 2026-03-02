"use client"

import Link from "next/link"
import { isNativeApp } from "@/lib/platform-utils"

/**
 * Convert a full URL to an internal path for in-app navigation.
 *
 * Examples:
 *   https://seller.storelib.com           -> /u/seller
 *   https://seller.storelib.com/p/slug    -> /p/slug
 *   https://seller.storelib.com/links     -> /l/seller
 *   https://storelib.com/p/slug           -> /p/slug
 *   https://storelib.com/u/seller         -> /u/seller
 *   /u/seller  (already internal)         -> /u/seller
 */
function toInternalHref(href: string): string {
  // Already a relative/internal path — leave it alone
  if (href.startsWith("/")) return href

  try {
    const url = new URL(href)
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const host = url.hostname
    const path = url.pathname

    // Handle root domain (storelib.com/p/slug, storelib.com/u/seller, etc.)
    if (host === mainDomain || host === `www.${mainDomain}`) {
      // Already an internal-style path on the root domain — just return the path
      if (path && path !== "/") return path
      return "/"
    }

    // Only rewrite storelib.com subdomains
    if (!host.endsWith(`.${mainDomain}`)) return href

    const username = host.replace(`.${mainDomain}`, "")
    if (!username || username.includes(".")) return href

    // sellername.storelib.com/ -> /u/sellername
    if (path === "/" || path === "") return `/u/${username}`

    // sellername.storelib.com/p/slug -> /p/slug
    if (path.startsWith("/p/")) return path

    // sellername.storelib.com/links -> /l/username
    if (path === "/links" || path === "/links/") return `/l/${username}`

    // Any other path on the subdomain — use as-is (it's already a valid internal path)
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
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  // isNativeApp() is synchronous and returns false during SSR.
  // To avoid hydration mismatches and pre-hydration cross-origin clicks,
  // prefer passing internal paths (e.g. /u/username) as href directly
  // rather than full subdomain URLs when calling from server components.
  const inApp = isNativeApp()

  const resolvedHref = inApp && href ? toInternalHref(href) : href

  // In Capacitor, use Next.js Link for internal paths to enable client-side
  // navigation which preserves the Supabase auth session (no full page reload).
  if (inApp && resolvedHref?.startsWith("/")) {
    // Strip anchor-only props that Link handles differently
    const { target, rel, ...linkSafeProps } = props
    return (
      <Link href={resolvedHref} {...linkSafeProps}>
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
    >
      {children}
    </a>
  )
}
