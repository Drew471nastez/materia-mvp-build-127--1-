"use client"

import { useEffect } from "react"

// Platform default favicon URL
const PLATFORM_FAVICON_URL = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib.svg"

interface DynamicFaviconProps {
  avatarUrl?: string | null
  faviconUrl?: string | null
}

export function DynamicFavicon({ avatarUrl, faviconUrl }: DynamicFaviconProps) {
  useEffect(() => {
    const iconUrl = avatarUrl || faviconUrl

    if (!iconUrl) return

    // Find existing favicon links
    const existingLinks = document.querySelectorAll("link[rel*='icon']")

    // Remove existing favicons
    existingLinks.forEach((link) => link.remove())

    // Create new favicon link
    const link = document.createElement("link")
    link.rel = "icon"
    link.href = iconUrl
    link.type = "image/x-icon"
    document.head.appendChild(link)

    // Also add apple-touch-icon for iOS
    const appleLink = document.createElement("link")
    appleLink.rel = "apple-touch-icon"
    appleLink.href = iconUrl
    document.head.appendChild(appleLink)

    // Cleanup on unmount - restore platform default favicon
    return () => {
      const addedLinks = document.querySelectorAll("link[rel*='icon']")
      addedLinks.forEach((link) => link.remove())

      // Restore platform default favicon
      const defaultLink = document.createElement("link")
      defaultLink.rel = "icon"
      defaultLink.href = PLATFORM_FAVICON_URL
      document.head.appendChild(defaultLink)
    }
  }, [avatarUrl, faviconUrl])

  return null
}

// Export the platform favicon URL for use in other components
export { PLATFORM_FAVICON_URL }
