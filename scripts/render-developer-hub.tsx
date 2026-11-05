/**
 * A page of the Developer Hub (components/developers/hub-page.tsx) inside a
 * stand-in for the marketing layout: a sticky black bar the height of the
 * site header, and the page under it in a <main>, as app/(storelib)/(marketing)/layout
 * draws it. scripts/check-developer-hub.mjs renders this on the server and
 * measures it in Chromium.
 */
import React from "react"
import { HubPage } from "@/components/developers/hub-page"

export function App({ slug }: { slug: string }) {
  return (
    <div className="flex min-h-svh flex-col">
      {/* The site header's box: sticky, black, 65px on a phone and 70px wider (see the probe's CSS). */}
      <div id="platform-header-root" className="sticky top-0 z-40 w-full bg-black" />
      <main className="flex-1">
        <HubPage slug={slug} />
      </main>
    </div>
  )
}
