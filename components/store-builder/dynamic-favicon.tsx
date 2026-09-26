"use client"

import { useEffect } from "react"
import { STORELIB_LOGO } from "@/lib/brand/logo"

interface DynamicFaviconProps {
  avatarUrl?: string | null
  faviconUrl?: string | null
}

// Platform favicon URL from Supabase storage
const PLATFORM_FAVICON_URL = STORELIB_LOGO

/**
 * DynamicFavicon - Dynamically sets the page favicon
 * Priority: Custom favicon → Header avatar → Platform favicon
 * - If faviconUrl is set, use that (custom favicon)
 * - Otherwise use avatarUrl (header section avatar)
 * - Fallback to platform favicon if neither is available
 */
export function DynamicFavicon({ avatarUrl, faviconUrl }: DynamicFaviconProps) {
  useEffect(() => {
    // Priority: custom favicon → header avatar → platform favicon
    const iconUrl = faviconUrl || avatarUrl

    /**
     * =====================================================================
     *  THE PICTURE FILLS THE ICON, AND IS NOT SQUEEZED INTO IT
     * =====================================================================
     * This drew the source with `drawImage(img, 0, 0, size, size)`, which
     * scales whatever it is given to fit a square exactly. An avatar is very
     * often not square — a phone photo is 3:4, a screenshot is wider than it
     * is tall — so the face was compressed along one axis and left gaps of
     * canvas along the other. At sixteen pixels in a browser tab that reads
     * as a small, squashed picture, which is the report.
     *
     * COVER, not stretch: the source is scaled by the LARGER of the two
     * ratios so it covers the square, then centred, and the overflow is
     * cropped by the clip. Aspect ratio is kept, and nothing is left empty.
     *
     * AND IT IS DRAWN BIG. 64px was the whole icon, and a tab on any modern
     * screen asks for 32 CSS pixels at 2x or 3x — so the browser was
     * upscaling a 64px bitmap and the result was soft. 256 costs a few
     * kilobytes of data URL and is sharp everywhere.
     */
    const ICON_SIZE = 256

    const createRoundedFavicon = (imageUrl: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        /* Only a picture from elsewhere needs asking for with CORS to be drawn
           and read back; the platform's own logo asked that way was fetched a
           second time beside the footer's copy of it. */
        if (new URL(imageUrl, window.location.href).origin !== window.location.origin) img.crossOrigin = "anonymous"
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const size = ICON_SIZE
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext("2d")
          if (!ctx) {
            reject(new Error("Could not get canvas context"))
            return
          }

          /* The app-icon corner, in proportion, so it is the same shape at
             any icon size rather than a radius tuned for one of them. */
          const radius = size * 0.22
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

          /*
           * An SVG with no intrinsic size reports 0x0 in some browsers, and
           * dividing by it gives an infinite scale and a blank icon. Falling
           * back to the square keeps the old behaviour for that one case.
           */
          const sw = img.naturalWidth || img.width || size
          const sh = img.naturalHeight || img.height || size
          const scale = Math.max(size / sw, size / sh)
          const dw = sw * scale
          const dh = sh * scale
          ctx.imageSmoothingQuality = "high"
          ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)

          resolve(canvas.toDataURL("image/png"))
        }
        img.onerror = () => reject(new Error("Failed to load image"))
        img.src = imageUrl
      })
    }

    /**
     * =====================================================================
     *  ONLY EVER REMOVE THE LINKS THIS COMPONENT PUT THERE
     * =====================================================================
     * This used to clear `link[rel*='icon']` — every icon link in the
     * document — before adding its own. One of those belongs to the root
     * layout and is rendered BY REACT, and pulling a React-owned node out of
     * the DOM behind React's back is not a cosmetic mistake. React goes on
     * holding a fiber that points at it, and the next time that subtree is
     * deleted it calls removeChild on a parent that is now null:
     *
     *   TypeError: Cannot read properties of null (reading 'removeChild')
     *
     * That throw lands in the commit phase, so the render that was in flight
     * never lands. Measured on the live site: pressing the creator's name in
     * a product page's top bar changed the address and left the product page
     * on screen, three runs out of three, for ever. The creator page was not
     * slow and was not failing to fetch. It was rendered and then thrown away
     * by this.
     *
     * The cleanup did it a second time, which is how the page you arrived at
     * lost its icon too.
     *
     * Nothing needs removing anyway: a browser uses the LAST icon link in the
     * document, so appending is enough to win. The layout's own link stays
     * where React put it, and takes over again by itself when ours go.
     */
    const OURS = "data-storelib-favicon"

    const dropOurs = () => {
      document.querySelectorAll(`link[${OURS}]`).forEach((link) => link.remove())
    }

    // Function to set favicon
    const setFavicon = (href: string, type: string = "image/png") => {
      dropOurs()

      // Create new favicon link
      const link = document.createElement("link")
      link.rel = "icon"
      link.href = href
      link.type = type
      link.setAttribute(OURS, "")
      /* Named, so a tab picks this one rather than guessing at its size. */
      if (type === "image/png") link.setAttribute("sizes", `${ICON_SIZE}x${ICON_SIZE}`)
      document.head.appendChild(link)

      // Also add apple-touch-icon for iOS
      const appleLink = document.createElement("link")
      appleLink.rel = "apple-touch-icon"
      appleLink.href = href
      appleLink.setAttribute(OURS, "")
      document.head.appendChild(appleLink)
    }

    // Set favicon based on whether we have a seller avatar or not
    if (iconUrl) {
      // Seller page — the creator's own picture, cropped to the icon's square.
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
      // Platform page — the Storelib mark, through the same crop.
      createRoundedFavicon(PLATFORM_FAVICON_URL)
        .then((dataUrl) => {
          setFavicon(dataUrl, "image/png")
        })
        .catch(() => {
          // Fallback to direct SVG if canvas fails
          setFavicon(PLATFORM_FAVICON_URL, "image/svg+xml")
        })
    }

    /**
     * Take back what we added and nothing else. There is no default to put
     * back by hand: the layout's icon link was never removed, so it is still
     * in the document and becomes the last one again as soon as ours are out.
     */
    return dropOurs
  }, [avatarUrl, faviconUrl])

  return null
}
