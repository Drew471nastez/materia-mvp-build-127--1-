"use client"

import { useEffect } from "react"

/**
 * ===========================================================================
 *  THE DOCUMENT DOES NOT SCROLL BEHIND THE EDITOR
 * ===========================================================================
 * The editor is a full-screen surface: a bar of its own at the top, a canvas
 * that scrolls inside itself, a sheet pinned to the bottom. Nothing about it
 * is a document you scroll — and yet on a phone you could drag the top bar
 * and the whole thing moved.
 *
 * The reason is one rule in globals.css, which is correct for every ordinary
 * page and wrong for this one:
 *
 *     body { min-height: 100svh; padding-bottom: env(safe-area-inset-bottom) }
 *
 * `box-sizing: border-box` makes `min-height` include the padding, so an
 * empty body is exactly one screen. But the editor's own root is `100svh`
 * TALL CONTENT, and content plus padding is 100svh + 34px. Measured in
 * Chromium at 390×844 with a 34px inset: document 791, viewport 757,
 * scrollable by exactly 34.
 *
 * Those 34 pixels are every symptom at once. Drag anywhere and the editor
 * slides up by them, which clips the top bar under the status bar again.
 * What appears underneath is the html canvas, painted black for Capacitor —
 * the black band above the sections sheet, which is pinned to the viewport
 * and so does not move with the rest. "Not full screen", exactly.
 *
 * Two things fix it, and both are needed:
 *
 *   1. The editor's root is `position: fixed`, so it is laid out against the
 *      viewport instead of the body's content box. It cannot be pushed by
 *      the padding and it contributes no height to the document.
 *   2. This lock, which zeroes that padding and pins html and body to the
 *      viewport for as long as the editor is mounted, so nothing else can
 *      reintroduce a scrollable document either.
 *
 * Restored on unmount, because every other page in the app wants that
 * padding: it is what keeps a footer above the home indicator.
 */
export function FullScreenLock() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add("wb-fullscreen")
    /**
     * Whatever the document was scrolled to when we arrived. A route that
     * scrolled before pushing the editor would otherwise keep that offset
     * frozen underneath, and hand it back visibly on the way out.
     */
    const scrollY = window.scrollY
    if (scrollY !== 0) window.scrollTo(0, 0)
    return () => {
      root.classList.remove("wb-fullscreen")
      if (scrollY !== 0) window.scrollTo(0, scrollY)
    }
  }, [])

  return null
}
