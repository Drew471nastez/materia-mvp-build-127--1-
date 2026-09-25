"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { forwardRef, type ComponentPropsWithoutRef } from "react"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { prefetchAppPage } from "@/lib/ui/app-navigation"

/**
 * ===========================================================================
 *  A LINK INSIDE A PAGE THAT MOVES THE WAY THE SIDEBAR DOES
 * ===========================================================================
 * "When I'm clicking on something from the getting started... it should not
 * be a direct animation randomly taking me to that page. It should be the
 * same as when I'm navigating throughout the app in the sidebar or the
 * mobile navigation pill."
 *
 * The rail's rows and the pill's slots are ordinary router links with two
 * things around them (components/app/sidebar-desktop-nav, sidebar-mobile-nav):
 *
 *   THE PAGE IS FETCHED WHOLE BEFORE THE PRESS. Under a mouse on hover and
 *   focus, under a finger the moment it lands (the length of a tap is a head
 *   start for the server), with prefetchAppPage, which asks the router for
 *   the page itself and not only its frame. A dynamic page with no loading
 *   boundary (all of /app) brings back almost nothing from an ordinary
 *   prefetch, so a plain link waited for the server after the click, and the
 *   page arrived when it arrived: the "direct" jump.
 *
 *   THE SHELL IS TOLD WHERE IT IS GOING, on the press (startNavigationLoading),
 *   so the bar, the spinner and the landing (components/app/app-stage) run
 *   off the same record as a press in the rail.
 *
 * This is that, for a link anywhere inside a page. The landing itself is the
 * stage's, the same for every way in. A link to something outside /app is
 * left alone: nothing is fetched ahead for it.
 */
type Props = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & { href: string }

function inApp(href: string): boolean {
  const path = href.split(/[?#]/)[0]
  return path === "/app" || path.startsWith("/app/")
}

export const AppLink = forwardRef<HTMLAnchorElement, Props>(function AppLink(
  { href, onClick, onMouseEnter, onFocus, onPointerDown, ...rest },
  ref,
) {
  const router = useRouter()
  const warm = () => {
    if (inApp(href)) prefetchAppPage(router, href)
  }
  return (
    <Link
      ref={ref}
      href={href}
      {...rest}
      onMouseEnter={(e) => {
        warm()
        onMouseEnter?.(e)
      }}
      onFocus={(e) => {
        warm()
        onFocus?.(e)
      }}
      onPointerDown={(e) => {
        /* A mouse has hovered already; a finger has not. */
        if (e.pointerType !== "mouse") warm()
        onPointerDown?.(e)
      }}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (inApp(href)) startNavigationLoading(href)
      }}
    />
  )
})
