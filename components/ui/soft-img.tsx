"use client"

/**
 * ===========================================================================
 *  A THUMBNAIL THAT ARRIVES QUIETLY
 * ===========================================================================
 * Round 25, the owner: switching the library's pills, "items and thumbnails
 * appear too abruptly and glitchy". Every list picture was a bare <img> on
 * the original upload: the row came in, its box stood empty, and a moment
 * later the picture was painted into it in one frame (or in strips, decoded
 * on the paint), each at its own moment, so a screenful of rows blinked in
 * one by one. Four things now, for every small picture in a list:
 *
 *   THE RIGHT FILE   through the image route (lib/images/optimized-url.ts):
 *                    the slot's width at the screen's density, AVIF or WebP,
 *                    never the full upload. Same visible quality.
 *   ITS BOX FIRST    the caller draws the box, at its final size, on a quiet
 *                    grey; the picture fills a box that already exists.
 *   DECODED, THEN    shown once it is loaded AND decoded (img.decode), with a
 *   A SHORT FADE     short fade on the compositor (SOFT_IN_MS), so it is never
 *                    seen half painted.
 *   ONCE PER TAB     a picture already shown in this tab (SEEN) is there on
 *                    the first frame the next time, with no fade: going back
 *                    to a pill, or a list drawn again, is still.
 *
 * Lazy beyond the first screen unless `eager`; decoding async.
 */
import { useLayoutEffect, useRef, useState } from "react"
import type React from "react"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"

/** The first arrival's fade: short enough to read as the picture being there, long enough not to blink. */
export const SOFT_IN_MS = 180
const SOFT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

/** Pictures shown whole in this tab already. */
const SEEN = new Set<string>()

/** For tests and probes: whether a picture has been shown in this tab. */
export function softSeen(src: string): boolean {
  return SEEN.has(src)
}

/** The file widths worth offering for a slot `width` CSS px wide: 1x, 2x and 3x screens. */
export function slotWidths(width: number): number[] {
  return [width, width * 2, width * 3].map((w) => Math.round(w))
}

/** The files to offer for a slot: the image route's own sizes at or just above 1x, 2x and 3x. */
function routeWidths(width: number): number[] {
  const all = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920]
  const out = new Set<number>()
  for (const want of slotWidths(width)) out.add(all.find((w) => w >= want) ?? all[all.length - 1])
  return [...out]
}

export function SoftImg({
  src,
  width,
  sizes,
  alt = "",
  eager = false,
  className,
  style,
  referrerPolicy,
  ...rest
}: {
  src: string
  /** The CSS width of the slot the picture fills (its largest, when it changes with the screen). */
  width: number
  /** The slot's width rule for the browser's pick, when it is not simply `width`px. */
  sizes?: string
  alt?: string
  eager?: boolean
  className?: string
  style?: React.CSSProperties
  referrerPolicy?: React.HTMLAttributeReferrerPolicy
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes" | "width" | "loading" | "decoding" | "style">) {
  const file = optimizedImageUrl(src, width)
  const srcSet = optimizedSrcSet(src, routeWidths(width))
  const [state, setState] = useState<"seen" | "wait" | "in">(() => (SEEN.has(file) ? "seen" : "wait"))
  const ref = useRef<HTMLImageElement | null>(null)

  /* A new picture in the same element: shown at once if this tab has shown it, else waits for its own arrival. */
  useLayoutEffect(() => {
    const img = ref.current
    if (SEEN.has(file)) {
      setState("seen")
      return
    }
    /* Already in hand before React was listening (the server's page, or the memory cache): there on this frame, no fade. */
    if (img && img.complete && img.naturalWidth > 0) {
      SEEN.add(file)
      setState("seen")
      return
    }
    setState("wait")
  }, [file])

  const arrived = () => {
    const img = ref.current
    if (!img || SEEN.has(file)) {
      setState("seen")
      return
    }
    const show = () => {
      SEEN.add(file)
      setState((s) => (s === "wait" ? "in" : s))
    }
    /* Loaded is not decoded: the fade starts on a picture that paints whole. */
    if (typeof img.decode === "function") img.decode().then(show, show)
    else show()
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={file}
      srcSet={srcSet || undefined}
      sizes={srcSet ? sizes || `${width}px` : undefined}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy={referrerPolicy}
      onLoad={arrived}
      onError={() => setState("seen")}
      data-soft-img={state}
      className={className}
      style={{
        ...style,
        opacity: state === "wait" ? 0 : 1,
        transition: state === "in" ? `opacity ${SOFT_IN_MS}ms ${SOFT_EASE}` : undefined,
      }}
      {...rest}
    />
  )
}
