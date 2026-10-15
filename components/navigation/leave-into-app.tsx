"use client"

/**
 * In a buyer layout (the marketing pages, the account and the library): a press on a link to /app is noted, and when
 * the layout is taken down for the dashboard, what the window showed of it fades off the dashboard rather than
 * being cut away (lib/navigation/into-app-still.ts, round 31).
 */
import { useLayoutEffect } from "react"
import { holdPageIntoApp, noteHeadingIntoApp } from "@/lib/navigation/into-app-still"

export function LeaveIntoApp() {
  useLayoutEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (a && (!a.target || a.target === "_self")) noteHeadingIntoApp(a.getAttribute("href"))
    }
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("click", onClick, true)
      /* The commit that takes this layout down: its nodes are still in the document. */
      holdPageIntoApp()
    }
  }, [])
  return null
}
