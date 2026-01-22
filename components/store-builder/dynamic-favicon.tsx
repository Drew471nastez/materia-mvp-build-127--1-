"use client"

import { useEffect } from "react"

interface DynamicFaviconProps {
  avatarUrl?: string | null
  faviconUrl?: string | null
}

// Platform favicon URL from Supabase storage
const PLATFORM_FAVICON_URL = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"

/**
 * DynamicFavicon - Dynamically sets the page favicon
 * - On seller pages: Uses the seller's profile avatar with border-radius 7px
 * - On platform pages: Uses platform favicon with border-radius 7px
 * - Seller favicons are NOT overridden by platform favicon
 */
export function DynamicFavicon({ avatarUrl, faviconUrl }: DynamicFaviconProps) {
  useEffect(() => {
    const iconUrl = avatarUrl || faviconUrl

    // Function to create rounded favicon from image URL
    const createRoundedFavicon = (imageUrl: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const size = 64 // Favicon size
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext("2d")
          if (!ctx) {
            reject(new Error("Could not get canvas context"))
            return
          }

          // Draw rounded rectangle clip path (border-radius 7px)
          const radius = 7 * (size / 32) // Scale radius to canvas size (7px at 32px display)
          ctx.beginPath()
          ctx.moveTo(radius, 0)
          ctx.lineTo(size - radius, 0)
          ctx.quadraticCurveTo(size, 0, size, radius)
          ctx.lineTo(size, size - radius)
          ctx.quadraticCurveTo(size, size, size - radius, size)
          ctx.lineTo(radius, size)
          ctx.quadraticCurveTo(0, size, 0, size - radius)
          ctx.lineTo(0, radius)
          ctx.quadraticCurveTo(0, 0, radius, 0)
          ctx.closePath()
          ctx.clip()

          // Draw the image
          ctx.drawImage(img, 0, 0, size, size)

          // Convert to data URL
          resolve(canvas.toDataURL("image/png"))
        }
        img.onerror = () => reject(new Error("Failed to load image"))
        img.src = imageUrl
      })
    }

    // Function to set favicon
    const setFavicon = (href: string, type: string = "image/png") => {
      // Remove existing favicons
      const existingLinks = document.querySelectorAll("link[rel*='icon']")
      existingLinks.forEach((link) => link.remove())

      // Create new favicon link
      const link = document.createElement("link")
      link.rel = "icon"
      link.href = href
      link.type = type
      document.head.appendChild(link)

      // Also add apple-touch-icon for iOS
      const appleLink = document.createElement("link")
      appleLink.rel = "apple-touch-icon"
      appleLink.href = href
      document.head.appendChild(appleLink)
    }

    // Set favicon based on whether we have a seller avatar or not
    if (iconUrl) {
      // Seller page - use seller's avatar with rounded corners (7px border-radius)
      createRoundedFavicon(iconUrl)
        .then((dataUrl) => {
          setFavicon(dataUrl, "image/png")
        })
        .catch(() => {
          // Fallback to platform favicon on error
          createRoundedFavicon(PLATFORM_FAVICON_URL)
            .then((dataUrl) => setFavicon(dataUrl, "image/png"))
            .catch(() => setFavicon(PLATFORM_FAVICON_URL, "image/svg+xml"))
        })
    } else {
      // Platform page - use platform favicon with rounded corners (7px border-radius)
      createRoundedFavicon(PLATFORM_FAVICON_URL)
        .then((dataUrl) => {
          setFavicon(dataUrl, "image/png")
        })
        .catch(() => {
          // Fallback to direct SVG if canvas fails
          setFavicon(PLATFORM_FAVICON_URL, "image/svg+xml")
        })
    }

    // Cleanup on unmount - restore default platform favicon
    return () => {
      const addedLinks = document.querySelectorAll("link[rel*='icon']")
      addedLinks.forEach((link) => link.remove())

      // Restore default favicon
      const defaultLink = document.createElement("link")
      defaultLink.rel = "icon"
      defaultLink.href = PLATFORM_FAVICON_URL
      defaultLink.type = "image/svg+xml"
      document.head.appendChild(defaultLink)
    }
  }, [avatarUrl, faviconUrl])

  return null
}
