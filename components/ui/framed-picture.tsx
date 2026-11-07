"use client"

/**
 * A picture that fills its frame without the bars a padded upload carries (lib/images/letterbox).
 *
 * useLetterbox reads a small copy of the picture once per address (the optimizer's 128px one where it can, so the
 * read costs a few kilobytes and is same origin) and remembers what it found for the whole page: the product sheet
 * and the checkout ask for the same picture and the second asks for free. A picture that cannot be read (another
 * site without CORS) is drawn as before, filled from its centre.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { contentRatio, coverBox, findLetterbox, type ContentBox } from "@/lib/images/letterbox"

export type PictureShape = { ratio: number; box: ContentBox | null }

const known = new Map<string, PictureShape | null>()
const waiting = new Map<string, Promise<PictureShape | null>>()

/** What the probe and the tests read: the shape found for an address, if it has been read. */
export function knownPictureShape(src: string): PictureShape | null | undefined {
  return known.get(src)
}

export function readPictureShape(src: string): Promise<PictureShape | null> {
  if (known.has(src)) return Promise.resolve(known.get(src) ?? null)
  const already = waiting.get(src)
  if (already) return already
  const job = new Promise<PictureShape | null>((resolve) => {
    if (typeof window === "undefined" || typeof Image === "undefined") return resolve(null)
    const img = new Image()
    const small = optimizedImageUrl(src, 64)
    if (!/^(data|blob):/.test(small)) img.crossOrigin = "anonymous"
    img.decoding = "async"
    img.onload = () => {
      try {
        const ratio = img.naturalWidth / img.naturalHeight
        if (!(ratio > 0) || !Number.isFinite(ratio)) return resolve(null)
        const w = Math.min(128, img.naturalWidth)
        const h = Math.max(1, Math.round(w / ratio))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return resolve({ ratio, box: null })
        ctx.drawImage(img, 0, 0, w, h)
        resolve({ ratio, box: findLetterbox(ctx.getImageData(0, 0, w, h).data, w, h) })
      } catch {
        /* Another site's picture without CORS: drawn as it is. */
        resolve({ ratio: img.naturalWidth / img.naturalHeight || 1, box: null })
      }
    }
    img.onerror = () => resolve(null)
    img.src = small
  }).then((shape) => {
    known.set(src, shape)
    waiting.delete(src)
    return shape
  })
  waiting.set(src, job)
  return job
}

/** The picture's shape once read: undefined while it is being read, null when it could not be. */
export function useLetterbox(src: string | null | undefined, enabled = true): PictureShape | null | undefined {
  const [shape, setShape] = React.useState<PictureShape | null | undefined>(() => (src ? known.get(src) : null))
  React.useEffect(() => {
    if (!src) return setShape(null)
    if (known.has(src)) return setShape(known.get(src) ?? null)
    if (!enabled) return
    let live = true
    setShape(undefined)
    void readPictureShape(src).then((s) => live && setShape(s))
    return () => {
      live = false
    }
  }, [src, enabled])
  return shape
}

/** The picture's own width over height, padding taken off; null until known. */
export function shownRatio(shape: PictureShape | null | undefined): number | null {
  return shape ? contentRatio(shape.ratio, shape.box) : null
}

/**
 * The picture inside a frame the caller sizes. `fit`:
 *   cover     fills the frame, centred on `focus`
 *   contain   whole, over a soft, blurred fill of the same picture (no empty bars either)
 * Padding in the file is outside the frame either way. Before the shape is read, a plain cover fill.
 */
export function FramedPicture({
  src,
  displaySrc,
  alt = "",
  frame,
  fit = "cover",
  focus,
  shape: given,
  className,
  style,
  imgClassName,
  imgProps,
}: {
  src: string
  /** The address drawn, when it differs from the one read (an optimized size of the same picture). */
  displaySrc?: string
  alt?: string
  /** The frame's width over height. */
  frame: number
  fit?: "cover" | "contain"
  focus?: { x: number; y: number }
  shape?: PictureShape | null
  className?: string
  style?: React.CSSProperties
  imgClassName?: string
  imgProps?: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "className" | "style">
}) {
  const read = useLetterbox(given === undefined ? src : null)
  const shape = given === undefined ? read : given
  const drawn = displaySrc || src
  const box = shape?.box ?? null
  const placed = shape && (box || fit === "contain") ? coverBox(shape.ratio, box ?? { x: 0, y: 0, w: 1, h: 1 }, frame, fit, focus) : null
  return (
    <span className={cn("relative isolate block overflow-hidden", className)} style={style} data-framed-picture={box ? "trimmed" : shape ? "plain" : "reading"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...imgProps}
        src={drawn}
        alt={alt}
        draggable={false}
        className={cn(placed ? "absolute max-w-none" : "h-full w-full object-cover", imgClassName)}
        style={placed ? percent(placed) : focus ? { objectPosition: `${focus.x * 100}% ${focus.y * 100}%` } : undefined}
      />
      {fit === "contain" && placed ? (
        /* Behind the picture (the first <img> stays the picture itself, for whoever reads it). */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={drawn}
          alt=""
          aria-hidden
          draggable={false}
          className={cn("pointer-events-none absolute -z-10 max-w-none scale-110 opacity-70 blur-xl", !box && "object-cover")}
          style={percent(box ? coverBox(shape!.ratio, box, frame, "cover") : { left: 0, top: 0, width: 100, height: 100 })}
          data-framed-fill=""
        />
      ) : null}
    </span>
  )
}

function percent(p: { left: number; top: number; width: number; height: number }): React.CSSProperties {
  return { left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%` }
}
