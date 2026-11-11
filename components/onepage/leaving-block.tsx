"use client"

/**
 * ===========================================================================
 *  A BLOCK TAKEN OFF THE PAGE FOLDS AWAY (round AR)
 * ===========================================================================
 * The owner: "when I'm deleting a block, make sure it's smooth, clean,
 * disappearing". In the editor's preview a removed (or archived, or hidden)
 * block vanished in one frame and everything under it jumped up by its
 * height.
 *
 * Now the preview keeps the block a moment longer, at its old place, marked
 * data-op-leaving (lib/onepage/feel withLeaving), and folds it away: its
 * height and the gap after it close and it fades, in LEAVE_MS, so the blocks
 * under it glide up. It cannot be pressed while it goes. The live page never
 * loses a block while it is open, so this runs in the preview only.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { LEAVE_MS, withLeaving } from "@/lib/onepage/feel"

type Entry<T> = { id: string; item: T; leaving: boolean }

/* Eased at both ends: the cards under it start gently and settle, never a first frame that jumps. */
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)"

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/** Fold one element away: its height, the gap beside it and its opacity, together. */
export function foldAway(el: HTMLElement, ms = LEAVE_MS, gaps = 1): Animation | null {
  if (typeof el.animate !== "function") return null
  const parent = el.parentElement
  /* `gaps`: how many of the list's gaps go with it (a card and the empty divider after it take two). */
  const gap = (parent ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0) * gaps
  const last = !el.nextElementSibling
  const h = el.getBoundingClientRect().height
  el.style.overflow = "hidden"
  el.style.pointerEvents = "none"
  const side = last ? "marginTop" : "marginBottom"
  return el.animate(
    [
      { height: `${h}px`, opacity: 1, [side]: "0px" },
      { height: "0px", opacity: 0, [side]: `${-gap}px` },
    ],
    { duration: reducedMotion() ? 0 : ms, easing: EASE, fill: "forwards" },
  )
}

/**
 * The page's items with the ones just taken off kept a moment, marked
 * leaving. `keyOf` names an item (a block's id, a pair's key). Off, it hands
 * the items back as they are.
 */
export function useLeavingBlocks<T>(items: readonly T[], keyOf: (item: T) => string, enabled: boolean, blocksOf?: (item: T) => readonly string[]): Entry<T>[] {
  type Keyed = { id: string; item: T }
  const drawn = useRef<{ id: string; item: Keyed; leaving: boolean }[]>([])
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const list = useMemo<Entry<T>[]>(() => {
    const keyed: Keyed[] = items.map((item) => ({ id: keyOf(item), item }))
    if (!enabled) return keyed.map((k) => ({ ...k, leaving: false }))
    /*
      REGROUPED IS NOT REMOVED. A theme or a layout that pairs links differently (Grid to List) drops a pair's key
      and draws its blocks as rows: none of them left the page, so the old pair is not kept to fold away beside
      them (it showed every block twice for a moment, and shifted every row after it once it went: on a skin
      that alternates its bars by position, each one turned colour a second time). `blocksOf` names the blocks
      an item draws; an item whose blocks are all still on the page simply goes.
    */
    let skip = gone
    if (blocksOf) {
      const here = new Set(items.flatMap((i) => blocksOf(i)))
      const regrouped = drawn.current.filter((d) => !d.leaving && !keyed.some((k) => k.id === d.id) && blocksOf(d.item.item).every((b) => here.has(b))).map((d) => d.id)
      if (regrouped.length) skip = new Set([...gone, ...regrouped])
    }
    return withLeaving(drawn.current, keyed, skip).map((e) => ({ id: e.id, item: e.item.item, leaving: e.leaving }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled, gone])
  useLayoutEffect(() => {
    drawn.current = list.map((e) => ({ id: e.id, item: { id: e.id, item: e.item }, leaving: e.leaving }))
    /* A block that came back is no longer gone. */
    const here = new Set(items.map(keyOf))
    if ([...gone].some((id) => here.has(id))) setGone((g) => new Set([...g].filter((id) => !here.has(id))))
    const leaving = list.filter((e) => e.leaving).map((e) => e.id)
    if (!leaving.length) return
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-op-leaving]:not([data-op-leaving-run])"))) {
      el.setAttribute("data-op-leaving-run", "")
      foldAway(el)
    }
    const t = window.setTimeout(() => setGone((g) => new Set([...g, ...leaving])), LEAVE_MS + 20)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])
  return list
}

/** The attributes a leaving block's box carries. */
export function leavingProps(leaving: boolean): Record<string, string | boolean | undefined> {
  return leaving ? { "data-op-leaving": "", "aria-hidden": "true", inert: true } : {}
}
