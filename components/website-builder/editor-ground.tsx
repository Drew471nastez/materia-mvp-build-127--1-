"use client"

import { useEffect } from "react"

/**
 * The document's ground the head script gave the editor before its first
 * frame (app/layout.tsx, the website builder's line): handed back when the
 * editor is left inside the app, so no other page shows the editor's grey
 * where it overscrolls.
 */
export function EditorGround() {
  useEffect(() => () => {
    const h = document.documentElement
    if (h.style.backgroundColor) h.style.removeProperty("background-color")
  }, [])
  return null
}
