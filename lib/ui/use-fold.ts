"use client"

/**
 * A FOLDED TEXT WITH A FADE AND A MORE BUTTON, MEASURED (round 58).
 *
 * The creator story's fold (components/store-builder/unified-section-renderer
 * StoryText), for the other places that fold a description: the community's
 * card summary and a membership's description. Both used to cut with
 * `line-clamp` or a fixed max height and opened in one frame, the page under
 * them jumping by the whole difference.
 *
 *   FOLD   ends at the bottom of a real line (snapClamp), `lines` lines down
 *   FADE   a mask on the text itself (data-clamp-fade in app/globals.css), so
 *          it fades into whatever is behind it, light, dark or a picture
 *   OPEN   max-height eases from the fold to the text's own height and back
 *          (240ms, nothing with reduced motion: globals.css)
 *
 * Before the text is measured (the server's HTML) the fold is `lines` line
 * heights (the `lh` unit), so a long text is already folded on first paint.
 */
import * as React from "react"
import { fadeFor, lineBottoms, snapClamp } from "./clamp-lines"

interface FoldBox {
  collapsed: number
  full: number
  fade: number
  cut: boolean
}

/** `guess`: whether the text is taken to be cut before it is measured (a long text), so the button is already in the server's HTML. */
export function useFold<T extends HTMLElement = HTMLDivElement>(lines: number, open: boolean, key: unknown, guess = true) {
  const ref = React.useRef<T | null>(null)
  const [box, setBox] = React.useState<FoldBox | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const line = parseFloat(getComputedStyle(el).lineHeight) || 20
      const full = Math.ceil(el.scrollHeight)
      const collapsed = snapClamp(lineBottoms(el), line * lines, line)
      const next = { collapsed, full, fade: fadeFor(collapsed, line), cut: full > collapsed + line * 0.5 }
      setBox((b) => (b && b.collapsed === next.collapsed && b.full === next.full && b.cut === next.cut ? b : next))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [lines, key])
  const cut = box ? box.cut : guess
  const style: React.CSSProperties = !cut
    ? {}
    : {
        overflow: "hidden",
        maxHeight: box ? `${open ? box.full : box.collapsed}px` : `${lines}lh`,
        ["--sl-fade-to" as string]: box ? `${box.fade}px` : `${Math.min(2.5, lines / 2)}lh`,
      }
  return { ref, cut, measured: box !== null, style, fold: cut ? (open ? "open" : "closed") : undefined } as const
}
