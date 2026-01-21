"use client"

import { useEffect } from "react"

// Platform default favicon URL
const PLATFORM_FAVICON_URL = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib.svg"

// Border radius for favicon (8px on a 32x32 icon)
const FAVICON_BORDER_RADIUS = 8

interface DynamicFaviconProps {
  avatarUrl?: string | null
  faviconUrl?: string | null
}

/**
 * Creates a rounded favicon using canvas
 * @param imageUrl - URL of the image to use as favicon
 * @param size - Size of the favicon (default 32)
 * @param borderRadius - Border radius (default 8)
 * @returns Promise<string> - Data URL of the rounded favicon
 */
async function createRoundedFavicon(imageUrl: string, size = 32, borderRadius = FAVICON_BORDER_RADIUS): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        // Fallback to original URL if canvas not supported
        resolve(imageUrl)
        return
      }

      // Draw rounded rectangle clip path
      ctx.beginPath()
      ctx.moveTo(borderRadius, 0)
      ctx.lineTo(size - borderRadius, 0)
      ctx.quadraticCurveTo(size, 0, size, borderRadius)
      ctx.lineTo(size, size - borderRadius)
      ctx.quadraticCurveTo(size, size, size - borderRadius, size)
      ctx.lineTo(borderRadius, size)
      ctx.quadraticCurveTo(0, size, 0, size - borderRadius)
      ctx.lineTo(0, borderRadius)
      ctx.quadraticCurveTo(0, 0, borderRadius, 0)
      ctx.closePath()
      ctx.clip()

      // Draw the image
      ctx.drawImage(img, 0, 0, size, size)

      // Convert to data URL
      try {
        const dataUrl = canvas.toDataURL("image/png")
        resolve(dataUrl)
      } catch {
        // Fallback to original URL if CORS issues
        resolve(imageUrl)
      }
    }

    img.onerror = () => {
      // Fallback to original URL on error
      resolve(imageUrl)
    }

    img.src = imageUrl
  })
}

export function DynamicFavicon({ avatarUrl, faviconUrl }: DynamicFaviconProps) {
  useEffect(() => {
    const iconUrl = avatarUrl || faviconUrl

    if (!iconUrl) return

    let isMounted = true

    const setFavicon = async () => {
      // Create rounded favicon
      const roundedIconUrl = await createRoundedFavicon(iconUrl)

      if (!isMounted) return

      // Find existing favicon links
      const existingLinks = document.querySelectorAll("link[rel*='icon']")

      // Remove existing favicons
      existingLinks.forEach((link) => link.remove())

      // Create new favicon link
      const link = document.createElement("link")
      link.rel = "icon"
      link.href = roundedIconUrl
      link.type = "image/png"
      document.head.appendChild(link)

      // Also add apple-touch-icon for iOS
      const appleLink = document.createElement("link")
      appleLink.rel = "apple-touch-icon"
      appleLink.href = roundedIconUrl
      document.head.appendChild(appleLink)
    }

    setFavicon()

    // Cleanup on unmount - restore platform default favicon
    return () => {
      isMounted = false
      const addedLinks = document.querySelectorAll("link[rel*='icon']")
      addedLinks.forEach((link) => link.remove())

      // Restore platform default favicon with rounded corners
      createRoundedFavicon(PLATFORM_FAVICON_URL).then((roundedUrl) => {
        const defaultLink = document.createElement("link")
        defaultLink.rel = "icon"
        defaultLink.href = roundedUrl
        defaultLink.type = "image/png"
        document.head.appendChild(defaultLink)
      })
    }
  }, [avatarUrl, faviconUrl])

  return null
}

// Export the platform favicon URL for use in other components
export { PLATFORM_FAVICON_URL, createRoundedFavicon }
