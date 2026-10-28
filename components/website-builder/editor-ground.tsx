"use client"

import { useLayoutEffect } from "react"

/** The editor's surround, the colour #wb-frame paints (editor-frame.tsx). */
export const EDITOR_GROUND = "#eef1f5"

/**
 * The document's ground under the editor, and handed back when the editor is
 * left inside the app, so no other page shows the editor's grey where it
 * overscrolls.
 *
 * SET HERE TOO, NOT ONLY BY THE HEAD SCRIPT. The head script (app/layout.tsx,
 * the website builder's line) gives <html> this grey only on a document load
 * of the editor's address. Opened from /app with a press, the editor had
 * <html> at `--native-band`, which `.wb-fullscreen` makes #171717 in the
 * native app: whenever the editor's own layers were not painted yet (the
 * web view brought back from the background, the editor mounting again),
 * that near black was what showed, over the whole canvas, before the page
 * appeared. Now the ground is the editor's grey however it was opened.
 */
export function EditorGround() {
  useLayoutEffect(() => {
    const h = document.documentElement
    if (!h.style.backgroundColor) h.style.backgroundColor = EDITOR_GROUND
    return () => {
      if (h.style.backgroundColor) h.style.removeProperty("background-color")
    }
  }, [])
  return null
}
