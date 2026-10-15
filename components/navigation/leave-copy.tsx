"use client"

/**
 * Inside a page a community is opened from (Explore): a press on a link to a community is noted, and in the commit that
 * takes this page down its view is copied, for the community's frame to fade it off below its own bar
 * (lib/navigation/arrival-still.ts, round 31). Renders nothing.
 */
import { useLayoutEffect } from "react"
import { keepLeavingSurface, noteHeadingIntoCommunity } from "@/lib/navigation/arrival-still"

export function LeaveCopy({ surface }: { surface: string }) {
  useLayoutEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (a && (!a.target || a.target === "_self")) noteHeadingIntoCommunity(a.getAttribute("href"))
    }
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("click", onClick, true)
      /* The commit that takes the page down: it is still in the document. */
      keepLeavingSurface(document.querySelector<HTMLElement>(surface))
    }
  }, [surface])
  return null
}
