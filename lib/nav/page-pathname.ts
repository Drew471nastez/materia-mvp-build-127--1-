"use client"

import { usePathname, useSelectedLayoutSegments } from "next/navigation"

/**
 * ===========================================================================
 *  THE HOME PAGE'S PATH IS "/", EVEN WHEN THE SERVER CALLS IT "/index"
 * ===========================================================================
 * Wave 14. When Vercel regenerates storelib.com's cached home page (ISR, every
 * few minutes), it renders the route "/" under the name "/index": the page's
 * own payload says so (its canonical URL parts are ["", "index"]), and
 * usePathname() answers "/index" while the server draws it. The browser then
 * hydrates at "/", so every component that asks "is this the home page?"
 * drew one thing on the server and another in the browser. The header drew
 * nothing at all on the server (its rule is pathname === "/"), the live page
 * had no <header> in its HTML, and React threw away the whole server-drawn
 * page and drew it again in the browser ("Hydration failed ... this tree will
 * be regenerated on the client", minified #418): on a phone, a second
 * render of the entire home page right after it loaded.
 *
 * This answers "/" there, and is usePathname() everywhere else. Only a page
 * with no segment of its own below the asking layout but route groups, like
 * "(marketing)", can be the home page; a creator called "index" at
 * storelib.com/index is a segment of its own ("index"), so it keeps its path.
 */
export function usePagePathname(): string {
  const pathname = usePathname()
  const below = useSelectedLayoutSegments()
  return pathname === "/index" && below.every((s) => s.startsWith("(")) ? "/" : pathname
}
