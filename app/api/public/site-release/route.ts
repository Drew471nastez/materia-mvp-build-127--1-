/**
 * What is live on a website now, as the marker its pages carry
 * (lib/website-builder/live-release.ts). Asked by a page that may be from
 * before a Publish: one restored by Back, or a tab shown again
 * (lib/website-builder/live-release-script.ts).
 *
 * Public, like the page itself: a name in, a 16 character hash out, read
 * through the same held reads the page is drawn from, so it costs no round
 * trip once warm. Never held by a browser (no-store): the answer is only worth
 * asking because it is the current one (the CDN holds it 30 s, cleared by Publish). No session is read
 * (lib/auth/no-session-paths.ts, /api/public/).
 */
import { NextResponse } from "next/server"
import { creatorByName, creatorSiteTag } from "@/lib/website-builder/published-site"
import { liveSiteFor } from "@/lib/website-builder/live-release"
import { splitSiteName } from "@/lib/markets/site-name"

const NAME = /^[a-z0-9_-]{1,64}$/i
const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("name") ?? ""
  const { name } = splitSiteName(raw)
  if (!NAME.test(name)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE })
  try {
    const creator = await creatorByName(name)
    /* No such site: nothing is live, which a page drawn from something is told as a change. */
    if (!creator) return NextResponse.json({ marker: null }, { headers: NO_STORE })
    /*
      HELD BY THE CDN FOR HALF A MINUTE, UNDER THE SITE'S TAG (round 54, Vercel
      cost). Every page of a website served from a copy asks this, one to three
      times a view, and each was a function call. Publish expires the site's tag
      (revalidateTag(creatorSiteTag), which on Vercel takes the CDN's copies
      with it), so a new marker is seen at once; browsers still keep nothing.
    */
    return NextResponse.json({ marker: (await liveSiteFor(creator.creatorId))?.marker ?? null }, { headers: { ...NO_STORE, "Vercel-CDN-Cache-Control": "max-age=30", "Vercel-Cache-Tag": creatorSiteTag(creator.creatorId) } })
  } catch {
    /* Not known: the page keeps what it shows rather than reloading on a database that blinked. */
    return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: { ...NO_STORE, "Retry-After": "5" } })
  }
}
