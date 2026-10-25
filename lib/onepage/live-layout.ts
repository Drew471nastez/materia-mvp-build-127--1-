"use client"

/**
 * ===========================================================================
 *  ONE LAYOUT OF THE LIVE PAGE IN THE BROWSER, NOT TWO
 * ===========================================================================
 * The published OnePage (components/onepage/public-onepage.tsx) has a layout
 * for a computer (the page as a card, from 768px) and one for a phone, and
 * it used to build both and hide one with CSS (`hidden md:block`,
 * `md:hidden`). Hidden is not gone: every block was made twice, every player,
 * map, embed and photo in the hidden copy loaded anyway, and a video
 * wallpaper played three times over (round 12, the owner's "Aw, Snap" on
 * storelib.com/app/onepage, whose preview is this page, and on storelib.me).
 *
 * The server still sends both (it cannot know the screen, and the page must
 * be whole without script for search engines and a first paint); from the
 * first render in the browser after that, only the one the screen shows is
 * kept. The editor's preview frame is drawn in the browser only, so it never
 * builds the other at all. The breakpoint is Tailwind's md, the one the CSS
 * classes use, so the kept layout is always the one the CSS shows.
 */

import { useSyncExternalStore } from "react"

/** Tailwind's `md` (48rem): the computer's layout from here up. */
export const LIVE_DESKTOP_QUERY = "(min-width: 48rem)"

/** Which layout the page builds: both on the server, then the one on screen. */
export type LiveLayout = "both" | "desktop" | "phone"

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const mq = window.matchMedia(LIVE_DESKTOP_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

export function liveLayoutNow(): LiveLayout {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "both"
  return window.matchMedia(LIVE_DESKTOP_QUERY).matches ? "desktop" : "phone"
}

const onServer = (): LiveLayout => "both"

/** The layout to build: "both" while the server's HTML is hydrated, then only the one the screen shows. */
export function useLiveLayout(): LiveLayout {
  return useSyncExternalStore(subscribe, liveLayoutNow, onServer)
}
