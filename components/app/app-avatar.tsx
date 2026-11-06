"use client"

import type React from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useDrawnByServer } from "@/lib/ui/drawn-by-server"
import { cn } from "@/lib/utils"
import { isOptimizableImage, optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { originalAvatarUrl, useAvatarImage } from "@/lib/account/avatar-image"

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
 *   THERE IS NO PHOTO    or it fails: the default face for a person, the
 *                        initials for a mark (DefaultAvatarGlyph below),
 *                        which are then the avatar, not a stand in for one
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
 * The letters for a MARK: a community's logo, a business, a product, which
 * have a name and no face. EMPTY, NOT "?", when there is no name: a
 * question mark is a thing drawn at somebody. <AvatarMark> draws the default
 * face instead.
 */
export function initialsOf(name: string | null | undefined) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ""
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase()
}

/**
 * ===========================================================================
 *  A PERSON WITHOUT A PHOTO: THE DEFAULT FACE, NEVER BARE INITIALS
 * ===========================================================================
 * The owner: "Without a photo, never bare initials: a clean default avatar,
 * consistent everywhere through the one avatar component." Two letters in a
 * grey circle read as a placeholder somebody forgot to fill; a row of them
 * in a comment thread reads as a list of strangers. So a person with no
 * photo is the same quiet face everywhere: the circle in the tint of the
 * surface it sits on (GROUND below, so it is right on the white app, the
 * dark header and a creator's own scheme) and a plain head and shoulders in
 * the circle's own ink at a third of its strength, the shoulders running off
 * the circle's lower edge the way a portrait is cropped. Drawn at the full
 * size of the circle, one path, so it is crisp at 18px and at 134px.
 *
 * A MARK KEEPS ITS LETTERS. A community's logo, a business or a product
 * drawn in the same component has a name and no face, so it still shows its
 * initials (`kind="mark"`). AppAvatar decides from the shape when the caller
 * does not say: a circle is a person, a rounded square is a thing.
 */
export function DefaultAvatarGlyph({ size, fill = false }: { size?: number; fill?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      width={fill ? undefined : size}
      height={fill ? undefined : size}
      fill="currentColor"
      /* `fill`: the whole of a positioned circle, whatever size its classes give it. Otherwise `size` square, for a parent that centres it. */
      className={fill ? "pointer-events-none absolute inset-0 h-full w-full opacity-[0.32]" : "block shrink-0 opacity-[0.32]"}
      data-avatar-default=""
    >
      <circle cx="32" cy="25.5" r="11.5" />
      <path d="M8.5 64c0-13.6 10.5-22.5 23.5-22.5S55.5 50.4 55.5 64z" />
    </svg>
  )
}

/** Who a circle stands for: a person (the default face when there is no photo) or a mark (a community, a business: its initials). */
export type AvatarKind = "person" | "mark"

/**
 * WHAT A CIRCLE WITH NO PHOTO HOLDS: for a person the default face, for a
 * mark its initials (and the face when it has no name). Never a "?" and
 * never nothing.
 */
export function AvatarMark({ name, size, kind = "person" }: { name: string | null | undefined; size: number; kind?: AvatarKind }) {
  const initials = kind === "mark" ? initialsOf(name) : ""
  if (!initials) return <DefaultAvatarGlyph size={size} />
  return (
    <span aria-hidden="true" className="font-medium leading-none" style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}>
      {initials}
    </span>
  )
}

/** A rounded square (rounded-lg, rounded-[10px]...) is a thing with a name; a circle is a person. */
export function avatarKindFromClass(className: string | null | undefined): AvatarKind {
  return /(^|\s)(?:[a-z0-9-]+:)*rounded-(?!full\b)(?:none|sm|md|lg|xl|2xl|3xl|\[)/.test(className || "") ? "mark" : "person"
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
const optimizableAvatar = (url: string) => isOptimizableImage(url) && !/\.svg(?:[?#]|$)/i.test(url)
const preloaded = new Set<string>()
export function preloadAvatar(src: string | null | undefined, size: number) {
  if (typeof window === "undefined" || typeof Image === "undefined") return
  const url = src && !src.includes("placeholder.svg") ? originalAvatarUrl(src) || null : null
  if (!url) return
  const key = `${url} ${size}`
  if (preloaded.has(key)) return
  preloaded.add(key)
  const img = new Image()
  if (optimizableAvatar(url)) {
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
  lazy = false,
  kind,
  waitForPhoto = false,
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
  /** Fetched only as it nears the screen: for a long list of faces (the notifications list). */
  lazy?: boolean
  /** A person (the default face without a photo) or a mark (a community's logo: its initials). Read from the shape when not given. */
  kind?: AvatarKind
  /** OnePage never shows initials while a valid profile photo is still being retried. */
  waitForPhoto?: boolean
}) {
  const who = kind ?? avatarKindFromClass(className)
  const url = src && !src.includes("placeholder.svg") ? originalAvatarUrl(src) || null : null
  const [started, setStarted] = useState(!lazy)
  const imgRef = useRef<HTMLImageElement>(null)
  const image = useAvatarImage(url && optimizableAvatar(url) ? optimizedImageUrl(url, size) : url, !lazy || started)
  useLayoutEffect(() => {
    if (lazy && imgRef.current?.complete) setStarted(true)
  }, [url, lazy])
  const loaded = image.loaded
  const [waitedFor, setWaitedFor] = useState<string | null>(null)
  const waited = !waitForPhoto && waitedFor === url
  useEffect(() => {
    if (!url || loaded || markWhileLoading || waitForPhoto) return
    const timer = window.setTimeout(() => setWaitedFor(url), BLANK_LIMIT_MS)
    return () => window.clearTimeout(timer)
  }, [url, loaded, markWhileLoading, waitForPhoto])
  const photo = !!image.src
  const fromServer = useDrawnByServer()
  const widthPx = `${size}px`
  return (
    <span
      data-app-avatar=""
      data-state={photo ? (loaded ? "photo" : "waiting") : "initials"}
      data-avatar-kind={who}
      className={cn("relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full", GROUND[tone], className)}
      style={sizedByClass ? style : { width: widthPx, height: widthPx, ...style }}
    >
      {!photo || (!loaded && (markWhileLoading || waited || who === "person")) ? (
        who === "person" || !initialsOf(name) ? <DefaultAvatarGlyph fill /> : <AvatarMark name={name} size={size} kind="mark" />
      ) : null}
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={image.src}
          onLoad={() => setStarted(true)}
          onError={() => { setStarted(true); image.onError() }}
          alt={alt ?? name}
          width={size}
          height={size}
          decoding="async"
          loading={lazy ? "lazy" : "eager"}
          fetchPriority={lazy ? "low" : "high"}
          /* A provider's photo (Google's) is loaded from its own host: no referrer, which it can refuse on. */
          referrerPolicy="no-referrer"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: loaded || fromServer ? 1 : 0, transition: "opacity 150ms ease-out" }}
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
  const url = src && !src.includes("placeholder.svg") ? originalAvatarUrl(src) || null : null
  if (!url) return null
  if (!optimizableAvatar(url)) return { src: url }
  return { src: optimizedImageUrl(url, size), srcSet: optimizedSrcSet(url, [...new Set([sizeStep(size), sizeStep(size * 2)])]) || undefined, sizes: `${size}px` }
}

/** The optimizer's width at or above `px`, which is the one it will serve. */
const STEPS = [32, 48, 64, 96, 128, 256, 384]
function sizeStep(px: number) {
  return STEPS.find((w) => w >= px) ?? 384
}
