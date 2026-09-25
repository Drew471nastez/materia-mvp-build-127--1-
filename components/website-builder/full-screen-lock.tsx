"use client"

import { useLayoutEffect, useSyncExternalStore } from "react"

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
/**
 * ===========================================================================
 *  FROM THE FIRST PAINT, WITHOUT A :has() ON <html>
 * ===========================================================================
 * The lock used to hold before this ran by a second copy of its rules keyed
 * on `html:has(.wb-editor)`. A `:has()` whose subject is <html> is asked
 * again whenever anything under it loses its children or has its text
 * replaced, and each time it is asked the root is restyled, which restyles
 * every element in the document (Tailwind's --spacing is in rem, so the whole
 * page depends on the root). Measured with scripts/check-app-sheets-frames.mjs
 * on /app, where no editor exists: 900 elements restyled when "Copy" became
 * "Copied", when the QR code drew, when a period was picked.
 *
 * So the class is the only lock, and it is there as early as that rule was:
 *
 *   SERVER HTML   `fromFirstPaint` writes a one line script as the first
 *                 thing inside the editor's root. The parser runs it the
 *                 moment it reaches it, before the editor below it can paint,
 *                 which is when `:has(.wb-editor)` began to match.
 *   CLIENT        a layout effect, which runs before the browser paints the
 *                 commit that mounted the editor, and its cleanup in the
 *                 commit that removes it.
 *
 * The script is rendered for the server's HTML and for hydration only. A
 * script React creates on the client never runs, so it is not drawn then.
 */
const noSubscribe = () => () => {}
const LOCK_NOW = `try{document.documentElement.classList.add("wb-fullscreen")}catch(e){}`

export function FullScreenLock({ tone = "dark", fromFirstPaint = false }: { tone?: "dark" | "light"; fromFirstPaint?: boolean }) {
  /* false in the server's HTML and while hydrating it, true for a mount on the client. */
  const onClient = useSyncExternalStore(noSubscribe, () => true, () => false)
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.add("wb-fullscreen")
    /**
     * THE STRIP ABOVE THE BAR IS THE BAR'S COLOUR.
     *
     * In the native shell the page's box can start below the status bar,
     * and what shows in the strip above it is the html element's own
     * background — set to pure black for every native page by
     * `html.capacitor`. The editor's bar is not pure black, so the two met
     * in a visible line under the clock: "cut at the top". A stylesheet rule
     * of the same weight is decided by order, and inline beats them all, so
     * the colour is written on the element for as long as the editor is
     * mounted and handed back after.
     */
    const prevBg = root.style.backgroundColor
    root.style.backgroundColor = tone === "light" ? "#ffffff" : "#171717"
    /**
     * Whatever the document was scrolled to when we arrived. A route that
     * scrolled before pushing the editor would otherwise keep that offset
     * frozen underneath, and hand it back visibly on the way out.
     */
    const scrollY = window.scrollY
    if (scrollY !== 0) window.scrollTo(0, 0)
    return () => {
      root.classList.remove("wb-fullscreen")
      root.style.backgroundColor = prevBg
      if (scrollY !== 0) window.scrollTo(0, scrollY)
    }
  }, [tone])

  return fromFirstPaint && !onClient ? <script dangerouslySetInnerHTML={{ __html: LOCK_NOW }} /> : null
}
