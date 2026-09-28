"use client"

import type React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
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

/**
 * HOW LONG A CIRCLE MAY STAY BLANK WAITING FOR A PHOTO.
 *
 * Nothing is drawn while a photo is on its way, on purpose: "when the user
 * profile avatar loads, it first shows the initials and then the image loads
 * abruptly". A cached photo lands in a frame or two and the initials are
 * never seen, which is the whole point.
 *
 * But a host that is slow, or one that never answers at all, left the circle
 * a bare tint for as long as the request hung, and that is the other half of
 * the same report: "sometimes the avatar is empty". So the wait has an end.
 * Past it the mark is drawn under the photo, and the photo still fades over
 * it when it finally arrives.
 *
 * 600ms, the same number components/ui/avatar.tsx waits for the same reason,
 * so the two cannot drift apart.
 */
const BLANK_LIMIT_MS = 600

const GROUND = {
  /** On the dark header. */
  dark: "bg-[#2a2a30] text-white/85",
  /** On a white or grey surface. */
  light: "bg-[#eceef1] text-[#4b5563]",
  /**
   * On a surface whose colours belong to somebody else's theme: a creator
   * page or a storefront, which may be dark. A tenth of the theme's own text
   * colour for the circle and the whole of it for the letters, so the circle
   * sits a step off whatever surface it lands on and the letters carry, on a
   * white page and on a near black one, with neither side guessing. Not
   * `bg-muted`: that is mixed from the page background, and a card of its own
   * colour left the circle invisible on it.
   */
  theme: "bg-foreground/[0.10] text-foreground",
} as const

/**
 * The letters in the circle. EMPTY, NOT "?", when there is no name: a
 * question mark is a thing drawn at somebody, and a review written by a guest
 * who never typed a name is not a mystery to be flagged. <AvatarMark> draws
 * the person glyph instead.
 */
export function initialsOf(name: string | null | undefined) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ""
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase()
}

/**
 * WHAT A CIRCLE WITH NO PHOTO HOLDS: the initials of whoever it stands for,
 * and when there is no name at all a plain person, at the weight of the
 * letters it replaces. Never a "?" and never nothing.
 */
export function AvatarMark({ name, size }: { name: string | null | undefined; size: number }) {
  const initials = initialsOf(name)
  if (!initials) {
    const px = Math.max(12, Math.round(size * 0.56))
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width={px} height={px} fill="currentColor" className="opacity-80">
        <path d="M12 12.4a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z" />
        <path d="M12 14.1c-3.5 0-6.6 1.8-6.6 4.1V20h13.2v-1.8c0-2.3-3.1-4.1-6.6-4.1Z" />
      </svg>
    )
  }
  return (
    <span aria-hidden="true" className="font-medium leading-none" style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}>
      {initials}
    </span>
  )
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
  alt,
  markWhileLoading = false,
}: {
  src?: string | null
  /** For the initials and the picture's description. */
  name: string
  /** The picture's description when it is not the name: "" where the name is already written beside it. */
  alt?: string
  /** The size it is drawn at, in CSS pixels: the picture is asked for at this. */
  size: number
  tone?: keyof typeof GROUND
  /** Size classes that differ by breakpoint go here; `size` is the largest. */
  className?: string
  style?: React.CSSProperties
  /** The size comes from `className` (it changes at a breakpoint); `size` is still what the picture is asked for at. */
  sizedByClass?: boolean
  /**
   * DRAW THE MARK UNDER THE PHOTO TOO, so the circle is never blank.
   *
   * The /app shell deliberately shows nothing while a photo is on its way:
   * "when the user profile avatar loads, it first shows the initials and then
   * the image loads abruptly", and the person there always has a photo a
   * moment later. A review card is the other case. Its photo is somebody
   * else's, from a host that may be slow or may refuse, and the card has one
   * avatar in it: an empty ring is the whole card looking broken. So the
   * review surfaces pass this and get the initials at once, with the photo
   * fading over them when it arrives.
   *
   * Everywhere else the mark still appears once BLANK_LIMIT_MS has gone by
   * with nothing drawn, so a slow or dead host is never a hole either; this
   * is only about showing it from the first frame.
   */
  markWhileLoading?: boolean
}) {
  const url = src && !src.includes("placeholder.svg") ? toOriginalImageUrl(src) || null : null
  const [failed, setFailed] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(() => !!url && shown.has(url))
  /** Whether it arrived after the first paint, which is when it fades. */
  const [fade, setFade] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  /** Whether a photo has kept the circle blank past BLANK_LIMIT_MS. */
  const [waited, setWaited] = useState(false)
  const [prevUrl, setPrevUrl] = useState(url)
  if (url !== prevUrl) {
    setPrevUrl(url)
    setLoaded(!!url && shown.has(url))
    setFade(false)
    setWaited(false)
  }

  /* A photo that is taking too long: draw the mark under it rather than a hole. */
  useEffect(() => {
    if (!url || loaded || markWhileLoading) return
    const id = window.setTimeout(() => setWaited(true), BLANK_LIMIT_MS)
    return () => window.clearTimeout(id)
  }, [url, loaded, markWhileLoading])

  /* Decoded from the cache before this frame is painted: no fade. */
  useLayoutEffect(() => {
    const img = imgRef.current
    if (!url || loaded || !img) return
    if (img.complete && img.naturalWidth > 0) {
      shown.add(url)
      setLoaded(true)
    } else if (img.complete) {
      /*
        FAILED BEFORE REACT WAS LISTENING. A page drawn on the server (the
        checkout) has the <img> in its HTML, so a photo that 404s can fail
        before hydration attaches onError, and React never hears of it: the
        circle stayed an empty tint instead of the initials. A finished
        image with no width is either broken or an SVG with no size of its
        own, and decode() tells them apart.
      */
      let current = true
      img.decode().then(
        () => {
          shown.add(url)
          if (current) setLoaded(true)
        },
        () => {
          if (current) setFailed(url)
        },
      )
      return () => {
        current = false
      }
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
      {!photo || (!loaded && (markWhileLoading || waited)) ? <AvatarMark name={name} size={size} /> : null}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={optimized ? optimizedImageUrl(url, size) : url}
          srcSet={optimized ? optimizedSrcSet(url, [...new Set([sizeStep(size), sizeStep(size * 2)])]) || undefined : undefined}
          sizes={optimized ? widthPx : undefined}
          alt={alt ?? name}
          width={size}
          height={size}
          decoding="async"
          /* A provider's photo (Google's) is loaded from its own host: no referrer, which it can refuse on. */
          referrerPolicy={optimized ? undefined : "no-referrer"}
          draggable={false}
          onLoad={() => {
            shown.add(url)
            if (!loaded) { setFade(true); setLoaded(true) }
          }}
          onError={() => setFailed(url)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: fade ? "opacity 150ms ease-out" : undefined }}
        />
      ) : null}
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
