"use client"

/**
 * A picture that is not there: the grey box with a camera (lib/media/
 * missing-image.ts says where and why).
 *
 *   <MissingImageGuard />   once, in the root layout: every <img> on the page
 *                           that fails, or has no address, turns into the box
 *                           in place, without moving anything
 *   <MissingImage />        the box itself, where Storelib's own rows have no
 *                           picture to draw (a cart line, a checkout line)
 *   <ProductImg />          an <img> that is the box from the start when it
 *                           has no address, and becomes it if it fails
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { CAMERA_PATHS, FALLBACK_SRC, MISSING_BG_DARK, MISSING_IMAGE_CSS, MISSING_INK, installMissingImageGuard } from "@/lib/media/missing-image"

export function MissingImageGuard() {
  React.useEffect(() => installMissingImageGuard(document, FALLBACK_SRC), [])
  /* The grey is in the first paint: a picture that fails before the script has run is already styled the moment it is marked. */
  return <style data-sl-missing-image="" dangerouslySetInnerHTML={{ __html: MISSING_IMAGE_CSS }} />
}

/** Whether a colour is dark (a site's dark scheme): the box takes the dark grey there. */
export function isDarkColor(color: string | null | undefined): boolean {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color ?? "").trim())
  if (!m) return false
  const hex = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4
}

/**
 * The box. It fills whatever holds it (h-full w-full by default), so it
 * takes the exact place a picture would; the camera is a third of the
 * box's width, between 18 and 56 pixels.
 */
export function MissingImage({ className, dark = false, label }: { className?: string; dark?: boolean; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-missing-image=""
      /* bg-[#f3f4f6] (MISSING_BG) as a class, so Storelib's dark buyer pages give it their dark grey (app/theme-dark.css); a site's dark scheme says `dark`. */
      className={cn("flex h-full w-full items-center justify-center overflow-hidden bg-[#f3f4f6]", className)}
      style={dark ? { backgroundColor: MISSING_BG_DARK } : undefined}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke={MISSING_INK} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="aspect-square h-auto w-[34%] min-w-[18px] max-w-[56px]" dangerouslySetInnerHTML={{ __html: CAMERA_PATHS }} />
    </span>
  )
}

/**
 * A product's picture: the <img> as before when there is an address, the box
 * when there is none or it fails. Same classes either way, so the row does
 * not move when it swaps.
 */
export function ProductImg({ src, alt = "", className, dark, loading, width, height }: { src: string | null | undefined; alt?: string; className?: string; dark?: boolean; loading?: "lazy" | "eager"; width?: number; height?: number }) {
  const [failed, setFailed] = React.useState<string | null>(null)
  if (!src || failed === src) return <MissingImage className={className} dark={dark} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={loading} width={width} height={height} onError={() => setFailed(src)} />
}
