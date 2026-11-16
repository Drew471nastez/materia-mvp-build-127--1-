"use client"

import { useEffect, type RefObject } from "react"

/*
  ONE OWNER FOR A ROW'S LOOP (landing round 14, the owner: the Unlimited
  possibilities rows "sometimes freeze and block"; the same check for
  Connect your favorite apps).

  WHAT STOPPED THEM. Each row's CSS loop had three hands on it at once:
    - a stylesheet pause (animation-play-state, from data-um-paused and the
      platform sections' data-platform-live);
    - LandingStory, which pauses a section's running animations through the
      Web Animations API when it is far away and plays them when it is back;
    - the hover stop, which eased the loop's playback rate to almost zero
      on pointerenter and back to one on pointerleave.
  Once a script has called pause() or play() on a CSS animation, the
  browser stops following animation-play-state for it (CSS Animations 2), so
  after the first time LandingStory rested a row the stylesheet's pause and
  resume did nothing, and the row ran or stood by whichever script spoke
  last. And the hover stop listened to boundary events, which a browser
  sends when the page scrolls under a resting pointer: Chrome sends an
  enter as a row is wheeled under the pointer (the row glided to a stop in
  the middle of the screen while the page scrolled), and Safari sends the
  leave only when the pointer next moves (a row that had been under the
  pointer stayed stopped, on screen, until the mouse was touched).

  NOW one hook decides, through the same API, from three facts: the row is
  on screen (its own IntersectionObserver), the tab is shown, and a mouse is
  being moved over it. A row the page scrolls under the pointer is not
  stopped (only a pointermove that really moved counts, and none for a
  moment after a scroll), any scroll starts every stopped row again, and a
  row that leaves the screen or a hidden tab is put back to full speed. A
  check every two seconds while the row is on screen plays it again if
  anything else left it paused or slowed: whatever paused it, a row on
  screen never stands still for longer than that.
*/

/** How long after a scroll a pointermove is still taken to come from the scroll, not the hand (ms). */
export const LOOP_SCROLL_QUIET_MS = 220
/** How often a row on screen is checked, and played again if something else paused it (ms). */
export const LOOP_CHECK_MS = 2000

type Options = {
  /** The rows' moving tracks, inside the root. */
  tracks: string
  /** For each track, the element whose hover stops it (default: its parent). */
  hoverOf?: (track: HTMLElement) => HTMLElement | null
  /** How far outside the screen a row keeps running. */
  margin?: string
  /** The glide down and back up under a mouse (ms). */
  stopMs?: number
  goMs?: number
}

/** The track's own CSS loop (not a picture's fade or a tile's turn inside it). */
function loopOf(track: HTMLElement): Animation | undefined {
  if (typeof track.getAnimations !== "function") return undefined
  return track.getAnimations().find((a) => (a.effect as KeyframeEffect | null)?.target === track && !(a.effect as KeyframeEffect | null)?.pseudoElement)
}

function setRate(a: Animation, rate: number) {
  /* Never exactly zero: a zero rate holds the animation's time and is not eased out of on every engine. */
  const r = Math.max(0.0001, rate)
  if (typeof a.updatePlaybackRate === "function") a.updatePlaybackRate(r)
  else a.playbackRate = r
}

const parentOf = (t: HTMLElement) => t.parentElement

export function useLoopGate(root: RefObject<HTMLElement | null>, { tracks: selector, hoverOf = parentOf, margin = "160px 0px", stopMs = 700, goMs = 900 }: Options) {
  useEffect(() => {
    const el = root.current
    if (!el || typeof window === "undefined") return
    const tracks = Array.from(el.querySelectorAll<HTMLElement>(selector))
    if (!tracks.length) return
    const reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null
    const fine = typeof matchMedia === "function" ? matchMedia("(hover: hover) and (pointer: fine)") : null
    let onScreen = typeof IntersectionObserver !== "function"
    let lastScroll = -Infinity
    const hovered = new Set<HTMLElement>()
    const easing = new Map<HTMLElement, number>()
    const shown = () => onScreen && !document.hidden

    const cancelEase = (t: HTMLElement) => {
      const f = easing.get(t)
      if (f) cancelAnimationFrame(f)
      easing.delete(t)
    }
    const ease = (t: HTMLElement, to: number, ms: number) => {
      cancelEase(t)
      const a = loopOf(t)
      if (!a) return
      const from = a.playbackRate
      if (Math.abs(from - to) < 0.001) return
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms)
        setRate(a, from + (to - from) * (1 - Math.pow(1 - p, 3)))
        if (p < 1) easing.set(t, requestAnimationFrame(step))
        else easing.delete(t)
      }
      easing.set(t, requestAnimationFrame(step))
    }
    /* Each track as the three facts say: running at full speed, gliding under a mouse, or paused off screen. */
    const apply = () => {
      const on = shown() && !reduce?.matches
      for (const t of tracks) {
        const a = loopOf(t)
        if (!a) continue
        if (!on) {
          cancelEase(t)
          hovered.delete(t)
          if (a.playbackRate !== 1) setRate(a, 1)
          if (a.playState !== "paused") a.pause()
          continue
        }
        if (a.playState !== "running") a.play()
        if (!hovered.has(t) && !easing.has(t) && a.playbackRate !== 1) setRate(a, 1)
      }
    }
    const release = () => {
      for (const t of hovered) ease(t, 1, goMs)
      hovered.clear()
    }

    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([e]) => {
              onScreen = e.isIntersecting
              apply()
            },
            { rootMargin: margin },
          )
        : null
    io?.observe(el)
    const vis = () => apply()
    document.addEventListener("visibilitychange", vis)
    window.addEventListener("pageshow", vis)
    const check = window.setInterval(() => {
      if (shown()) apply()
    }, LOOP_CHECK_MS)

    /* The page moving under a resting pointer is not a hand on a row: every stopped row goes again. */
    const scrolled = () => {
      lastScroll = performance.now()
      if (hovered.size) release()
    }
    window.addEventListener("scroll", scrolled, { passive: true })

    const offs: Array<() => void> = []
    for (const t of tracks) {
      const zone = hoverOf(t)
      if (!zone) continue
      const move = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || !fine?.matches || reduce?.matches || hovered.has(t) || !shown()) return
        /* A boundary or move event the scroll made carries no movement of its own. */
        if ((e.movementX === 0 && e.movementY === 0) || performance.now() - lastScroll < LOOP_SCROLL_QUIET_MS) return
        hovered.add(t)
        ease(t, 0, stopMs)
      }
      const leave = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || !hovered.has(t)) return
        hovered.delete(t)
        ease(t, 1, goMs)
      }
      zone.addEventListener("pointermove", move, { passive: true })
      zone.addEventListener("pointerleave", leave, { passive: true })
      offs.push(() => {
        zone.removeEventListener("pointermove", move)
        zone.removeEventListener("pointerleave", leave)
      })
    }
    const blur = () => release()
    window.addEventListener("blur", blur)
    reduce?.addEventListener?.("change", apply)

    return () => {
      io?.disconnect()
      window.clearInterval(check)
      document.removeEventListener("visibilitychange", vis)
      window.removeEventListener("pageshow", vis)
      window.removeEventListener("scroll", scrolled)
      window.removeEventListener("blur", blur)
      reduce?.removeEventListener?.("change", apply)
      offs.forEach((off) => off())
      for (const t of tracks) cancelEase(t)
    }
  }, [root, selector, hoverOf, margin, stopMs, goMs])
}
