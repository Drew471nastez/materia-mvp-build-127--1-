"use client"

/**
 * ===========================================================================
 *  THE PHONE BAR'S TWO MENUS, FINISHED
 * ===========================================================================
 * The page list and "On this page" are <details> elements, so they open and
 * close with no script at all and a crawler reads every link in them. What
 * HTML does not do on its own is what somebody expects of a menu:
 *
 *   a link inside it closes it          following "#assets" with the menu
 *                                        still open lands the heading under
 *                                        a sheet of links
 *   a tap outside it closes it
 *   Escape closes it                    and puts focus back on its button
 *   one open at a time                  `name` does this in new browsers;
 *                                        this does it in the rest
 *   a new page starts with both shut    a client navigation keeps the DOM
 *
 * It also measures the site header once and hands its height to the hub as
 * `--hub-top`, so the bar sits under the header by the header's own number
 * rather than by a guess written into the CSS. It renders nothing.
 */
import { useEffect } from "react"
import { usePathname } from "next/navigation"

const MENU = "details[data-hub-menu]"

export function HubMenus() {
  const pathname = usePathname()

  useEffect(() => {
    const menus = () => Array.from(document.querySelectorAll<HTMLDetailsElement>(MENU))
    const closeAll = (except?: Element) => {
      for (const d of menus()) if (d !== except && d.open) d.open = false
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (!target) return
      const menu = target.closest<HTMLDetailsElement>(MENU)
      if (menu && target.closest("a")) {
        menu.open = false
        return
      }
      if (!menu) closeAll()
    }
    /* `toggle` does not bubble; the capture phase still sees it. */
    const onToggle = (e: Event) => {
      const d = e.target
      if (d instanceof HTMLDetailsElement && d.matches(MENU) && d.open) closeAll(d)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const open = menus().find((d) => d.open)
      if (!open) return
      open.open = false
      open.querySelector("summary")?.focus()
    }

    document.addEventListener("click", onClick)
    document.addEventListener("toggle", onToggle, true)
    document.addEventListener("keydown", onKey)

    /* The site header's height, measured, for the bar's `top` and the headings' scroll margin. */
    const header = document.getElementById("platform-header-root")
    const root = document.querySelector<HTMLElement>("[data-hub-root]")
    let observer: ResizeObserver | undefined
    if (header && root) {
      const set = () => root.style.setProperty("--hub-top", `${Math.round(header.getBoundingClientRect().height)}px`)
      set()
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(set)
        observer.observe(header)
      }
    }

    return () => {
      document.removeEventListener("click", onClick)
      document.removeEventListener("toggle", onToggle, true)
      document.removeEventListener("keydown", onKey)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>(MENU)) d.open = false
  }, [pathname])

  return null
}
