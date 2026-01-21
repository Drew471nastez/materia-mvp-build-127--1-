"use client"

import { useEffect } from "react"

interface DynamicFaviconProps {
  avatarUrl?: string | null
  faviconUrl?: string | null
}

/**
 * DynamicFavicon - Always uses the platform favicon (icon.svg with border-radius 8px)
 * We no longer use dynamic seller favicons - all pages use the platform favicon
 */
export function DynamicFavicon({ avatarUrl, faviconUrl }: DynamicFaviconProps) {
  useEffect(() => {
    // Always use the platform favicon (icon.svg) with border-radius 8px
    // The platform icon already has rounded corners built into the SVG
    const platformFavicon = "/icon.svg"

    // Find existing favicon links
    const existingLinks = document.querySelectorAll("link[rel*='icon']")

    // Remove existing favicons
    existingLinks.forEach((link) => link.remove())

    // Create new favicon link with platform icon
    const link = document.createElement("link")
    link.rel = "icon"
    link.href = platformFavicon
    link.type = "image/svg+xml"
    document.head.appendChild(link)

    // Also add apple-touch-icon for iOS
    const appleLink = document.createElement("link")
    appleLink.rel = "apple-touch-icon"
    appleLink.href = platformFavicon
    document.head.appendChild(appleLink)

    // Cleanup on unmount - restore default favicon
    return () => {
      const addedLinks = document.querySelectorAll("link[rel*='icon']")
      addedLinks.forEach((link) => link.remove())

      // Restore default favicon
      const defaultLink = document.createElement("link")
      defaultLink.rel = "icon"
      defaultLink.href = "/icon.svg"
      defaultLink.type = "image/svg+xml"
      document.head.appendChild(defaultLink)
    }
  }, [])

  return null
}
