"use client"

import type React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { isOptimizableImage, optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { toOriginalImageUrl } from "@/lib/storage/image-url"

/**
 * ===========================================================================
 *  ONE AVATAR ACROSS /app
 * ===========================================================================
 * "When the user profile avatar loads, it first shows the initials and then
 * the image loads abruptly. That way is cheap."
 *
 * Every avatar in the shell drew the initials underneath and laid the photo
 * over them when it arrived, so a person with a photo saw somebody's
 * initials first, then a swap. Now:
 *
 *   A PHOTO IS COMING    the circle is there at its size from the first
 *                        frame, a quiet tint of the surface it sits on, and
 *                        nothing written in it
 *   IT ARRIVES           it fades in over 150ms
 *   IT WAS ALREADY HERE  (seen earlier in this tab, or decoded from the cache
 *                        before the first paint) it is simply there, with no
 *                        fade to replay
 *   THERE IS NO PHOTO    or it fails: the initials, which are then the
 *                        avatar, not a stand in for one
 *
 * The photo is asked for at the size it is drawn, 1x and 2x, through the
 * image optimizer where the host allows it (lib/images/optimized-url), so the
 * same small file is reused everywhere it appears and a repeat view comes
 * from the cache. Nothing here uses a storage transform.
 */

/** Photos this tab has already shown: a remount draws them at once. */
const shown = new Set<string>()

const GROUND = {
  /** On the dark header. */
  dark: "bg-[#2a2a30] text-white/85",
  /** On a white or grey surface. */
  light: "bg-[#eceef1] text-[#4b5563]",
} as const

export function initialsOf(name: string | null | undefined) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean)
  if (!words.length) return "?"
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase()
}

/**
 * FETCH AND DECODE A PHOTO BEFORE IT IS NEEDED, at the size it will be drawn.
 * The account sheet shows the avatar at 40px, a different file from the
 * header's 24px one, so the first open used to fetch and decode it while the
 * sheet was sliding up, and fade it in half way. Asked for here with the
 * same `srcset` and `sizes` as <AppAvatar> would give it, so the browser picks
 * the same file, and marked shown once it has decoded, so the sheet draws it
 * on its first frame with no fade.
 */
const preloaded = new Set<string>()
export function preloadAvatar(src: string | null | undefined, size: number) {
  if (typeof window === "undefined" || typeof Image === "undefined") return
  const url = src && !src.includes("placeholder.svg") ? toOriginalImageUrl(src) || null : null
  if (!url) return
  const key = `${url} ${size}`
  if (preloaded.has(key)) return
  preloaded.add(key)
  const img = new Image()
  if (isOptimizableImage(url)) {
    const set = optimizedSrcSet(url, [...new Set([sizeStep(size), sizeStep(size * 2)])])
    if (set) { img.sizes = `${size}px`; img.srcset = set }
    img.src = optimizedImageUrl(url, size)
  } else {
    img.src = url
  }
  const done = () => shown.add(url)
  if (typeof img.decode === "function") img.decode().then(done, () => { preloaded.delete(key) })
  else img.onload = done
}

export function AppAvatar({
  src,
  name,
  size,
  tone = "light",
  className,
  style,
  sizedByClass = false,
}: {
  src?: string | null
  /** For the initials and the picture's description. */
  name: string
  /** The size it is drawn at, in CSS pixels: the picture is asked for at this. */
  size: number
  tone?: keyof typeof GROUND
  /** Size classes that differ by breakpoint go here; `size` is the largest. */
  className?: string
  style?: React.CSSProperties
  /** The size comes from `className` (it changes at a breakpoint); `size` is still what the picture is asked for at. */
  sizedByClass?: boolean
}) {
  const url = src && !src.includes("placeholder.svg") ? toOriginalImageUrl(src) || null : null
  const [failed, setFailed] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(() => !!url && shown.has(url))
  /** Whether it arrived after the first paint, which is when it fades. */
  const [fade, setFade] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const [prevUrl, setPrevUrl] = useState(url)
  if (url !== prevUrl) {
    setPrevUrl(url)
    setLoaded(!!url && shown.has(url))
    setFade(false)
  }

  /* Decoded from the cache before this frame is painted: no fade. */
  useLayoutEffect(() => {
    const img = imgRef.current
    if (!url || loaded || !img) return
    if (img.complete && img.naturalWidth > 0) {
      shown.add(url)
      setLoaded(true)
    }
  }, [url, loaded])

  const photo = url && failed !== url
  const optimized = photo && isOptimizableImage(url)
  const widthPx = `${size}px`

  return (
    <span
      data-app-avatar=""
      data-state={photo ? (loaded ? "photo" : "waiting") : "initials"}
      className={cn("relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full", GROUND[tone], className)}
      style={sizedByClass ? style : { width: widthPx, height: widthPx, ...style }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={optimized ? optimizedImageUrl(url, size) : url}
          srcSet={optimized ? optimizedSrcSet(url, [...new Set([sizeStep(size), sizeStep(size * 2)])]) || undefined : undefined}
          sizes={optimized ? widthPx : undefined}
          alt={name}
          width={size}
          height={size}
          decoding="async"
          draggable={false}
          onLoad={() => {
            shown.add(url)
            if (!loaded) { setFade(true); setLoaded(true) }
          }}
          onError={() => setFailed(url)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: fade ? "opacity 150ms ease-out" : undefined }}
        />
      ) : (
        <span aria-hidden="true" className="font-medium leading-none" style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}

/**
 * The very file <AppAvatar> asks for at `size`, for a picture drawn outside
 * it (the switch screen's header, components/app/shell-header-still) that
 * must come from the same cache entry. Null for no photo.
 */
export function avatarSource(src: string | null | undefined, size: number): { src: string; srcSet?: string; sizes?: string } | null {
  const url = src && !src.includes("placeholder.svg") ? toOriginalImageUrl(src) || null : null
  if (!url) return null
  if (!isOptimizableImage(url)) return { src: url }
  return { src: optimizedImageUrl(url, size), srcSet: optimizedSrcSet(url, [...new Set([sizeStep(size), sizeStep(size * 2)])]) || undefined, sizes: `${size}px` }
}

/** The optimizer's width at or above `px`, which is the one it will serve. */
const STEPS = [32, 48, 64, 96, 128, 256, 384]
function sizeStep(px: number) {
  return STEPS.find((w) => w >= px) ?? 384
}
