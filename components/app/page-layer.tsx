"use client"

import type React from "react"
import { useLayoutEffect } from "react"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  A PAGE DRAWN OVER THE WHOLE SHELL
 * ===========================================================================
 * The plans page and the product editor are pages of their own: no dark
 * header over them, no avatar, no bell. They are still routes under /app, so
 * the session checks, the router and the landing are the same as everywhere
 * else, but what they draw is a layer over the whole window.
 *
 * WHY THE HEADER STILL SHOWED ON AN IPHONE. The layer is rendered inside the
 * shell's scroller, `.app-content-scroll`, which carries
 * `-webkit-overflow-scrolling: touch`. On iOS that property no longer changes
 * how anything scrolls, but WebKit still makes the element a stacking
 * context for it. A fixed layer at z 60 inside it is then at layer 0 as far
 * as the header (z 50, outside it) is concerned: the header painted over the
 * layer's own bar, and the Back row sat underneath it. Chrome and Android
 * have no such rule, which is why a desktop probe passed.
 *
 * So three things hold while a layer is up, in app/globals.css:
 *
 *   the scroller stops being a stacking context on iOS (the property goes
 *   back to `auto`), so the layer's z-index means what it says;
 *
 *   the shell's header and rail are not painted at all, so even an engine
 *   with some other reason to trap the layer has nothing of them to show;
 *
 *   the black strip the native app paints under the status bar stands down,
 *   and this layer paints that strip itself, in its own colour, by padding
 *   its top by env(safe-area-inset-top). A browser has no inset and the
 *   padding is 0.
 *
 * The html class is the same statement as `:has([data-page-layer])`, for an
 * engine without `:has()`: either alone is enough.
 *
 * `pill` keeps the phone's nav pill over the page (the product editor, where
 * the owner asked for it). The layer sits between the header (50) and the
 * pill (55); a page without it hides the pill instead (the plans page), and
 * every sheet and dialog (60 and up) is over both.
 *
 * The page inside scrolls in `[data-page-layer-scroll]`, or in a scroller of
 * its own that fills it (the editor's `.page-scroll`). The room the pill
 * needs at the foot goes on whichever one moves, in app/globals.css.
 */
export function PageLayer({
  children,
  pill = false,
  inset = "page",
  className,
}: {
  children: React.ReactNode
  /** Keep the phone's nav pill over this page. */
  pill?: boolean
  /**
   * Who clears the status bar. "page" and "white": the layer pads its top by
   * the inset and paints that strip in the page's colour or in white. "bar":
   * the page's own sticky bar pads itself (the product editor's does, inside
   * any [data-page-layer]), so the layer adds nothing and the bar's colour
   * runs up under the clock as the page scrolls beneath it.
   */
  inset?: "page" | "white" | "bar"
  className?: string
}) {
  useLayoutEffect(() => {
    const html = document.documentElement
    html.classList.add("has-page-layer")
    return () => html.classList.remove("has-page-layer")
  }, [])

  return (
    <div
      data-page-layer={pill ? "pill" : ""}
      className={cn(
        "fixed inset-0 z-[52] flex flex-col bg-[#f8f9fa]",
        inset !== "bar" && "pt-[env(safe-area-inset-top,0px)]",
        inset === "white" && "bg-white",
        className,
      )}
    >
      <div data-page-layer-scroll="" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-[#f8f9fa]">
        {children}
      </div>
    </div>
  )
}
