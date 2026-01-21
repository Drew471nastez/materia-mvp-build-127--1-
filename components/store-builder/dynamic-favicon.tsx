"use client"

import { useEffect } from "react"

interface DynamicFaviconProps {
  avatarUrl?: string | null
  faviconUrl?: string | null
}

export function DynamicFavicon({ avatarUrl, faviconUrl }: DynamicFaviconProps) {
  useEffect(() => {
    // Always use platform favicon (/icon.svg) with border-radius 8px
    const iconUrl = "/icon.svg"

    // Find existing favicon links
    const existingLinks = document.querySelectorAll("link[rel*='icon']")

    // Remove existing favicons
    existingLinks.forEach((link) => link.remove())

    // Create new favicon link
    const link = document.createElement("link")
    link.rel = "icon"
    link.href = iconUrl
    link.type = "image/svg+xml"
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
  }, [])

  return null
}
