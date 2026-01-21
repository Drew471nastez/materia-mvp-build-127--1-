"use client"

import type React from "react"
import Link from "next/link"
import { forwardRef } from "react"

interface SmartLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children: React.ReactNode
  /**
   * Force use of native anchor tag even for internal links.
   * Use this when you need a full page reload.
   */
  forceAnchor?: boolean
}

/**
 * SmartLink - Intelligent link component that handles navigation correctly
 *
 * Rules:
 * - Uses <a> for external URLs (different domain)
 * - Uses <a> for cross-subdomain navigation (sellername.storelib.com)
 * - Uses <a> when forceAnchor is true
 * - Uses Next.js <Link> for same-domain internal navigation
 *
 * This prevents the "URL changes but page doesn't load" bug
 * that happens when using Next.js Link for cross-subdomain navigation.
 */
export const SmartLink = forwardRef<HTMLAnchorElement, SmartLinkProps>(
  ({ href, children, forceAnchor = false, ...props }, ref) => {
    // Check if href is an absolute URL
    const isAbsoluteUrl = href.startsWith("http://") || href.startsWith("https://")

    // Check if it's a hash link or javascript: link
    const isHashOrJs = href.startsWith("#") || href.startsWith("javascript:")

    // For external/absolute URLs, hash links, js: links, or when forceAnchor is true,
    // always use native anchor tag
    if (isAbsoluteUrl || isHashOrJs || forceAnchor) {
      return (
        <a ref={ref} href={href} {...props}>
          {children}
        </a>
      )
    }

    // For internal relative paths, use Next.js Link for SPA navigation
    return (
      <Link ref={ref} href={href} {...props}>
        {children}
      </Link>
    )
  }
)

SmartLink.displayName = "SmartLink"

/**
 * ProductLink - Specialized link for product pages
 *
 * Always uses native anchor tag to prevent SPA navigation issues
 * when navigating to product pages (which may be on seller subdomains).
 */
export const ProductLink = forwardRef<HTMLAnchorElement, Omit<SmartLinkProps, "forceAnchor">>(
  ({ href, children, ...props }, ref) => {
    return (
      <a ref={ref} href={href} {...props}>
        {children}
      </a>
    )
  }
)

ProductLink.displayName = "ProductLink"

/**
 * StoreLink - Specialized link for seller store pages
 *
 * Always uses native anchor tag to prevent SPA navigation issues
 * when navigating to seller stores (which are on subdomains).
 */
export const StoreLink = forwardRef<HTMLAnchorElement, Omit<SmartLinkProps, "forceAnchor">>(
  ({ href, children, ...props }, ref) => {
    return (
      <a ref={ref} href={href} {...props}>
        {children}
      </a>
    )
  }
)

StoreLink.displayName = "StoreLink"
