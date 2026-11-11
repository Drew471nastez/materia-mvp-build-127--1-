"use client"

/**
 * ===========================================================================
 *  A OnePage HOLDS STILL WHILE IT TAKES ON A LOOK
 * ===========================================================================
 * The owner: buttons that "flash, glitch and change colours on their own".
 * Part of it was the page's own transitions running on things that were not
 * a visitor's doing: a block that transitions its colours (a link's hover, a
 * card's ring) animated from the old theme's colour to the new one when the
 * editor sent a theme to the preview, and from the server's markup to the
 * first client render. Two hundred milliseconds of the old words crossing
 * over the new fill read as a flash.
 *
 * The page's roots carry `data-op-still` (app/globals.css: no transition
 * inside) in the same commit as a new look, and it is taken off two frames
 * later, straight on the DOM, with nothing re-rendered. Its value is the
 * look's fingerprint, so React writes it again only when the look changes:
 * on the first paint, at hydration (the server's markup already has it) and
 * when the theme does. Taking it off changes no colour, so it starts no
 * transition either. A hover is the only colour change that animates.
 */
import { useEffect } from "react"

/** A short fingerprint of the theme, so the attribute changes exactly when the look does. */
export function lookFingerprint(theme: unknown): string {
  let s = ""
  try {
    s = JSON.stringify(theme) ?? ""
  } catch {
    s = String(theme)
  }
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/** The value for `data-op-still` on the page's roots; the hook lifts it two frames after each new look lands. */
export function useLookStill(theme: unknown): string {
  const key = lookFingerprint(theme)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        for (const el of document.querySelectorAll(`.onepage-live[data-op-still="${key}"]`)) el.removeAttribute("data-op-still")
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [key])
  return key
}
