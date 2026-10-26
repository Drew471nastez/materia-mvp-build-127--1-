/**
 * THE TAB OR ROW YOU ARE ALREADY ON TAKES YOU TO THE TOP (round 24), as a
 * phone's own tab bar does: the phone's nav pill (components/app/sidebar-
 * mobile-nav.tsx) and the computer's sidebar (components/app/sidebar-
 * desktop-nav.tsx), pressed on their own page, glide every scrolled pane of
 * /app back up and navigate nowhere.
 */

/** Whether `href` is the page on screen now (its path, not a page under it). */
export function onPageOf(href: string): boolean {
  if (typeof window === "undefined") return false
  const path = (p: string) => p.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  return path(window.location.pathname) === path(href)
}

/** Every scrolled pane of /app back to its top, gliding: the shell's scroller, a page's own, a layer's, the window. */
export function scrollAppToTop(): void {
  if (typeof window === "undefined") return
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth"
  document.querySelectorAll<HTMLElement>(".app-content-scroll, .page-scroll, [data-page-layer-scroll]").forEach((el) => {
    if (el.scrollTop > 0 && el.getClientRects().length) el.scrollTo({ top: 0, behavior })
  })
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior })
}
