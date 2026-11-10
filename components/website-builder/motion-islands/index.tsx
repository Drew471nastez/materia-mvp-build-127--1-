"use client"

/**
 * ===========================================================================
 *  MOTION ISLANDS IN A .storelib SECTION (round P, P3)
 * ===========================================================================
 * Mounted by components/website-builder/sections/StorelibSection.tsx for
 * every section, on the live site and on the builder's canvas. It costs a
 * section without a `data-storelib-motion` mark one string search: the
 * runtime (./runtime.ts) is loaded only when the markup asks for an island,
 * and three.js only when an island that can run is a 3d-object.
 *
 * TIMING AGAINST THE SECTION'S OWN EDITS. When the creator changes the
 * section, StorelibSection applies the new markup as a change (morphInto,
 * in its layout effect). The islands are stopped first, in this layout
 * effect's cleanup, which React runs before any layout effect of the new
 * render, so the markup is put back exactly as it was drawn (marquee copies
 * out, scrambled text restored, inline styles cleared) before the morph
 * compares it. They start again after the commit, on the new markup.
 */
import { useLayoutEffect } from "react"
import { MOTION_ATTR } from "@/lib/storelib-theme/motion-islands-base"

export function MotionIslands({ root, html, inCanvas }: { root: HTMLElement | null; html: string; inCanvas: boolean }) {
  useLayoutEffect(() => {
    if (!root || !html.includes(MOTION_ATTR)) return
    let alive = true
    let stop: (() => void) | null = null
    /* After this commit (and the section's own morph) is done. */
    queueMicrotask(() => {
      if (!alive) return
      void import("./runtime").then(({ mountMotionIslands }) => {
        if (alive) stop = mountMotionIslands(root, { inCanvas })
      })
    })
    return () => {
      alive = false
      stop?.()
      stop = null
    }
  }, [root, html, inCanvas])
  return null
}

export default MotionIslands
