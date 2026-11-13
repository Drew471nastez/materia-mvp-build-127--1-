"use client"

import type React from "react"
import { useContext } from "react"
import { useSelectedLayoutSegment } from "next/navigation"
// usePathname() is useContext(PathnameContext) and nothing more; this is the
// module Next reads it from, on the server and in the browser alike.
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime"

/**
 * THE HOMEPAGE IS "/" ON THE SERVER TOO.
 *
 * storelib.com's homepage is cached and regenerated in the background. That
 * regeneration reaches Next as /index, the name of the prerendered file, and
 * Next takes the page's pathname from the request it was handed: the HTML it
 * cached carried "c":["","index"] in its flight data. So every
 * usePathname() under this layout said "/index" on the server and "/" in the
 * browser. ConditionalHeader drew nothing for "/index" and the header for
 * "/", which is React error #418 on every load, the whole document thrown
 * away and drawn again on the client, and the header missing from the HTML.
 * The build's own prerender is "/", which is why a local build never showed
 * it.
 *
 * The route knows better than the URL: the page of the marketing layout whose
 * segment is its own page.tsx is the homepage. So when that is the page and
 * the server was handed "/index", everything under the layout is told "/",
 * the same answer the browser gives. The segment is what makes that safe,
 * not the address: a creator whose handle is "index" is drawn by
 * [sellername], whose segment is "index", never null, so their page keeps
 * its own pathname. In the browser, and on every other page, this passes the
 * pathname on unchanged.
 */
export function HomePathname({ children }: { children: React.ReactNode }) {
  const pathname = useContext(PathnameContext)
  const segmentBelow = useSelectedLayoutSegment()
  const value = segmentBelow === null && pathname === "/index" ? "/" : pathname
  return <PathnameContext.Provider value={value}>{children}</PathnameContext.Provider>
}
