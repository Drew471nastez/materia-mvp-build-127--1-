"use client"

import { useEffect } from "react"
import { isSellerSubdomain } from "@/lib/url-helpers"

interface DynamicFaviconProps {
  avatarUrl?: string | null
  faviconUrl?: string | null
}

/**
 * DynamicFavicon - Sets favicon based on context
 *
 * - On seller subdomain (e.g., seller.storelib.com): uses seller's avatar/favicon
 * - On main platform (storelib.com): uses platform icon (/icon.svg)
 */
export function DynamicFavicon({ avatarUrl, faviconUrl }: DynamicFaviconProps) {
  useEffect(() => {
    // Check if we're on a seller subdomain
    const onSellerSubdomain = isSellerSubdomain()

    // Determine which icon to use
    let iconUrl: string

    if (onSellerSubdomain) {
      // On seller subdomain: use seller's avatar or favicon, fallback to platform icon
      iconUrl = avatarUrl || faviconUrl || "/icon.svg"
    } else {
      // On main platform: always use platform icon
      iconUrl = "/icon.svg"
    }

    // Find existing favicon links
    const existingLinks = document.querySelectorAll("link[rel*='icon']")

    // Remove existing favicons
    existingLinks.forEach((link) => link.remove())

    // Create new favicon link
    const link = document.createElement("link")
    link.rel = "icon"
    link.href = iconUrl
    // Use appropriate type based on URL
    link.type = iconUrl.endsWith(".svg") ? "image/svg+xml" : "image/x-icon"
    document.head.appendChild(link)

    // Also add apple-touch-icon for iOS
    const appleLink = document.createElement("link")
    appleLink.rel = "apple-touch-icon"
    appleLink.href = iconUrl
    document.head.appendChild(appleLink)

    // Cleanup on unmount - restore default favicon
    return () => {
      const addedLinks = document.querySelectorAll("link[rel*='icon']")
      addedLinks.forEach((link) => link.remove())

      // Restore default favicon
      const defaultLink = document.createElement("link")
      defaultLink.rel = "icon"
      defaultLink.href = "/icon.svg"
      document.head.appendChild(defaultLink)
    }
  }, [avatarUrl, faviconUrl])

  return null
}
