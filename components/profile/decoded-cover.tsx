"use client"

/**
 * ===========================================================================
 *  A COVER THAT IS NEVER SEEN ARRIVING HALF DRAWN
 * ===========================================================================
 * Round 15, the owner: switching between a profile and the community "flashes
 * and glitches the cover photo". Three things made a cover flash, and each
 * has its answer here:
 *
 *   THE BAND MOVED     the band's height came from the picture. Here the
 *                      band is a fixed height drawn by the caller before
 *                      anything loads, so nothing under it ever moves.
 *   IT PAINTED RAW     an <img> shown as soon as it had bytes is decoded on
 *                      the paint, so a phone painted it in strips or a frame
 *                      late. Here the picture is fetched and DECODED off
 *                      screen first (HTMLImageElement.decode) and only then
 *                      put in the band, already whole.
 *   IT FADED AGAIN     coming back to a profile already seen replayed the
 *                      fade on a picture the phone already held. A picture
 *                      decoded once in this tab is remembered (DECODED), so
 *                      the next time it is there on the first frame, with no
 *                      fade at all.
 *
 * The first time, the picture comes in over the band's own quiet colour with
 * a short opacity fade (compositor only, 180ms); reduced motion has none.
 * `warmCover` lets a list decode a cover before its profile is opened, so the
 * profile arrives with it in place.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type React from "react"
import { cn } from "@/lib/utils"

/** The first arrival's fade. */
export const COVER_FADE_MS = 180

/** Pictures already decoded in this tab: shown on the first frame, never faded again. */
const DECODED = new Set<string>()
/** Decodes on their way, so two asks for one picture share one download. */
const PENDING = new Map<string, Promise<boolean>>()

/** Whether this picture has been decoded in this tab already. */
export function coverReady(src: string | null | undefined): boolean {
  return !!src && DECODED.has(src)
}

/** Fetch and decode a cover ahead of time; resolves true once it can be drawn whole. Never rejects. */
export function warmCover(src: string | null | undefined): Promise<boolean> {
  if (!src || typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(false)
  if (DECODED.has(src)) return Promise.resolve(true)
  const going = PENDING.get(src)
  if (going) return going
  const img = new Image()
  img.decoding = "async"
  const done = new Promise<boolean>((resolve) => {
    const ok = () => {
      DECODED.add(src)
      PENDING.delete(src)
      resolve(true)
    }
    const fail = () => {
      PENDING.delete(src)
      resolve(false)
    }
    img.onload = () => {
      /* Loaded is not decoded: decode() is the promise that the first paint of it is whole. */
      if (typeof img.decode === "function") img.decode().then(ok, ok)
      else ok()
    }
    img.onerror = fail
  })
  img.src = src
  PENDING.set(src, done)
  return done
}

/** For tests: forget what was decoded. */
export function resetDecodedCovers(): void {
  DECODED.clear()
  PENDING.clear()
}

export function DecodedCover({ src, style, className, alt = "" }: { src: string; style?: React.CSSProperties; className?: string; alt?: string }) {
  /* Already decoded in this tab (or drawn by the server, where it loads with the page): there from the first frame. */
  const [shown, setShown] = useState<"now" | "fade" | null>(() => (DECODED.has(src) ? "now" : null))
  const live = useRef(true)
  useLayoutEffect(() => {
    live.current = true
    if (DECODED.has(src)) {
      setShown("now")
      return
    }
    setShown(null)
    void warmCover(src).then((ok) => {
      if (live.current && ok) setShown("fade")
    })
    return () => {
      live.current = false
    }
  }, [src])
  useEffect(
    () => () => {
      live.current = false
    },
    [],
  )
  const img = useRef<HTMLImageElement | null>(null)
  /* The first arrival fades in on the compositor, set before the first paint of it so no frame shows it whole and then fading. */
  useLayoutEffect(() => {
    const el = img.current
    if (shown !== "fade" || !el || typeof el.animate !== "function") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: COVER_FADE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" })
  }, [shown])
  if (!shown) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={src}
      alt={alt}
      decoding="sync"
      draggable={false}
      style={style}
      data-decoded-cover={shown}
      className={cn("select-none", className)}
    />
  )
}
