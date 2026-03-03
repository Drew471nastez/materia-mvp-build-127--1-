"use client"

import Link from "next/link"
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
 * A link component that keeps navigation in-app in Capacitor native apps.
 *
 * In Capacitor:
 *  - Uses Next.js <Link> for internal paths (/u/, /p/, /l/) so client-side
 *    navigation preserves the Supabase auth session (no full page reload).
 *  - Rewrites subdomain URLs to internal paths.
 *  - Strips target="_blank" to stay in-app.
 *
 * On desktop web, behaves exactly like a normal <a> tag.
 *
 * Navigation loading bar: handled by NavigationLoadingBar's document click
 * listener (catches all <a> clicks), so SmartLink does NOT need to call
 * startNavigationLoading() — that was causing a double-fire that required
 * users to tap twice.
 */
export function SmartLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const inApp = isNativeApp()
  const resolvedHref = inApp && href ? toInternalHref(href) : href

  // In Capacitor, use Next.js Link for internal paths to enable client-side
  // navigation which preserves the Supabase auth session (no full page reload).
  if (inApp && resolvedHref?.startsWith("/")) {
    // Strip anchor-only props that Link handles differently
    const { target, rel, onClick, ...linkSafeProps } = props
    return (
      <Link
        href={resolvedHref}
        onClick={onClick as any}
        {...linkSafeProps}
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
    >
      {children}
    </a>
  )
}
