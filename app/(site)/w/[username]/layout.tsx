import type React from "react"
import { creatorByName } from "@/lib/website-builder/published-site"
import { liveSiteFor } from "@/lib/website-builder/live-release"
import { FRESH_REDIRECT_SCRIPT, liveReleaseScript } from "@/lib/website-builder/live-release-script"
import { splitSiteName } from "@/lib/markets/site-name"

/**
 * EVERY PAGE OF THE WEBSITE SAYS WHICH PUBLISH IT WAS DRAWN FROM, and asks
 * again when it may be showing an older one: restored by Back from a
 * checkout, shown again in a tab, or about to open a page Next's router
 * fetched ahead (lib/website-builder/live-release.ts and
 * live-release-script.ts). A layout, so it is written once per document and
 * the in-place navigations below it keep the marker of the page that was
 * loaded, which is the one the browser is holding.
 *
 * Reads nothing from the request (the routes below are held at the edge),
 * and only held reads: the name lookup the page makes too, and what is live,
 * under the site's tag. A read that fails leaves the script out, and the
 * page is served as it was.
 */
export default async function SiteNameLayout({ children, params }: { children: React.ReactNode; params: Promise<{ username: string }> }) {
  const { username } = await params
  return (
    <>
      {children}
      {/* A promise React draws beside the page, so the page is not drawn after these reads. */}
      {releaseScript(splitSiteName(username).name)}
    </>
  )
}

async function releaseScript(name: string): Promise<React.ReactElement | null> {
  const live = await creatorByName(name)
    .then((c) => (c ? liveSiteFor(c.creatorId) : null))
    .catch(() => null)
  if (!live) return null
  /*
    THE WEBSITE'S THEME IS AN IMPORTED ONE NOW: this visitor was routed here
    by a server that had not seen the switch yet (live-release-script.ts,
    SITE_FRESH_PARAM). Sent on once, to the address the proxy asks again for.
  */
  if (live.compat) return <script data-storelib-release dangerouslySetInnerHTML={{ __html: FRESH_REDIRECT_SCRIPT }} />
  const script = liveReleaseScript(name, live.marker)
  return script ? <script data-storelib-release dangerouslySetInnerHTML={{ __html: script }} /> : null
}
