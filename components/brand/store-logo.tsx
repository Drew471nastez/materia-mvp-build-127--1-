"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { storeLogoRadius } from "@/lib/brand/store-logo"

/**
 * ===========================================================================
 *  A STORE'S LOGO ON A BUYER'S PAGE, THE ONE WAY IT IS DRAWN (round 49)
 * ===========================================================================
 * The checkout's shop bar, the order status page, the receipt and the order
 * help page draw the store's logo through this: at its own shape, never
 * cropped, `height` px tall and at most as wide as the caller's max-w class
 * allows, with the store logo's small corner and no shadow
 * (lib/brand/store-logo.ts).
 *
 * THE CORNER IS ON THE PICTURE, NOT ON AN EMPTY BOX. Drawn `height` tall, a
 * wordmark wider than the max width would be letterboxed inside a box of
 * that height (object-contain), and the rounded corners would be the box's,
 * in the empty space above and below it, leaving the picture's own corners
 * square. So once the picture has loaded and turns out to be that wide, it
 * is drawn with both sides auto inside the same maxima instead: the box is
 * the picture, and its corners are the rounded ones. Nothing moves, as the
 * picture was already drawn at that size and centred.
 */
export function StoreLogo({
  src,
  alt,
  height = 32,
  className,
  onError,
  ...rest
}: {
  src: string
  alt: string
  /** The height it is drawn at, in px. */
  height?: number
  /** Its max width (max-w-[…]) and anything else about its place. */
  className?: string
  onError?: () => void
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "height" | "className" | "onError" | "style">) {
  /* The height a too wide picture is really drawn at, once known; null while it is drawn `height` tall. */
  const [wideAt, setWideAt] = React.useState<number | null>(null)
  const fit = React.useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return
    const box = img.getBoundingClientRect()
    const ratio = img.naturalWidth / img.naturalHeight
    if (box.height > 0 && box.width > 0 && ratio > box.width / box.height + 0.01) setWideAt((at) => at ?? Math.round((box.width / ratio) * 10) / 10)
  }, [])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      ref={(img) => {
        /* Failed before React was attached (a server rendered page): onError never fires for it. Not an SVG, which may have no size of its own. */
        if (img?.complete && img.naturalWidth === 0 && img.getAttribute("src") && !/\.svgz?(\?|#|$)/i.test(src)) onError?.()
        else fit(img)
      }}
      src={src}
      alt={alt}
      onLoad={(e) => fit(e.currentTarget)}
      onError={onError}
      className={cn("block w-auto shrink-0 object-contain", className)}
      style={wideAt ? { height: "auto", maxHeight: height, borderRadius: storeLogoRadius(wideAt) } : { height, borderRadius: storeLogoRadius(height) }}
      data-store-logo=""
    />
  )
}
