"use client"

import Link from "next/link"
import { forwardRef } from "react"

interface SmartLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children: React.ReactNode
}

/**
 * SmartLink - Automatically chooses between Next.js Link and native <a> tag
 *
 * - Same-origin URLs → uses Next.js Link for SPA navigation
 * - Cross-origin/subdomain URLs → uses native <a> for full page navigation
 *
 * This prevents the "URL changes but page doesn't load" bug when navigating
 * between subdomains (e.g., storelib.com → seller.storelib.com)
 */
export const SmartLink = forwardRef<HTMLAnchorElement, SmartLinkProps>(
  ({ href, children, className, ...props }, ref) => {
    // Check if this is a cross-origin or subdomain URL
    const isCrossOrigin = isCrossOriginUrl(href)

    if (isCrossOrigin) {
      // Use native <a> for cross-origin navigation (including subdomains)
      return (
        <a ref={ref} href={href} className={className} {...props}>
          {children}
        </a>
      )
    }

    // Use Next.js Link for same-origin navigation
    return (
      <Link ref={ref} href={href} className={className} {...props}>
        {children}
      </Link>
    )
  }
)

SmartLink.displayName = "SmartLink"

/**
 * Check if a URL is cross-origin (different domain/subdomain)
 */
function isCrossOriginUrl(url: string): boolean {
  // If it's a relative URL, it's same-origin
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return false
  }

  // If we're on the server, treat absolute URLs as cross-origin
  if (typeof window === "undefined") {
    return true
  }

  try {
    const urlObj = new URL(url)
    const currentHost = window.location.host

    // Different host = cross-origin (includes subdomain differences)
    return urlObj.host !== currentHost
  } catch {
    return false
  }
}

/**
 * Navigate to a URL, handling cross-origin correctly
 * Use this instead of router.push() for seller/product URLs
 */
export function navigateTo(url: string): void {
  if (typeof window === "undefined") return

  if (isCrossOriginUrl(url)) {
    // Cross-origin: use window.location for full navigation
    window.location.assign(url)
  } else {
    // Same-origin: use window.location as well for consistency
    // (or you could use router.push here if you prefer)
    window.location.href = url
  }
}
