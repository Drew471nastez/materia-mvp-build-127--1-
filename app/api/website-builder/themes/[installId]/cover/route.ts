import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse } from "next/server"
import { isThemeId } from "@/lib/website-builder/theme-registry"
import { newestCover, renderOrigin, takeCover } from "@/lib/website-builder/cover-take"
import { mintCoverPass } from "@/lib/website-builder/cover-pass"
import { isCompatInstall } from "@/lib/website-builder/compat-site"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"

/**
 * ===========================================================================
 *  POST /api/website-builder/themes/[installId]/cover
 * ===========================================================================
 * Take the website's cover: open its saved home page in a real browser on
 * the server, photograph it at a laptop's width and a phone's, and keep the
 * pictures in the install's snapshot folder, where the website page finds
 * them. The editor asks for this a little while after a save has settled,
 * and the website page asks when the cover it has is older than the site.
 *
 * Scope: the signed-in user's creator must own the install, as on every
 * install route. The browser is sent to THIS deployment's own render page
 * with a two-minute pass for this one install; nothing in the request names
 * a URL, so there is nothing here to point it anywhere else.
 *
 * Cost: a browser launch and two page loads, a few seconds on a function.
 * Not repeated within MIN_GAP_MS of the last cover — two tabs, a double
 * save, a page refreshed twice all get the picture that already exists.
 *
 * Failure keeps the last cover. A cover is a convenience; nothing about the
 * website depends on it, and nothing here can change the website.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** A cold browser launch plus two page loads, with room to spare. */
export const maxDuration = 60

type Params = { params: Promise<{ installId: string }> }

/** The signed-in user and their creator, when that creator owns the install; otherwise the answer to send. */
/**
 * The signed-in person and the store, when the store owns the install (the
 * owner, or a team member with Website: lib/team/website); otherwise the
 * answer to send. The cover lives in the store owner's folder.
 */
async function owned(installId: string): Promise<{ userId: string; ownerUserId: string; creatorId: string } | NextResponse> {
  if (!isThemeId(installId)) return NextResponse.json({ error: "Invalid install id" }, { status: 400 })
  const site = await websiteInstallCaller(installId)
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  return { userId: site.userId, ownerUserId: site.ownerUserId, creatorId: site.creatorId }
}

/**
 * GET: the cover as it is, without taking one. One storage listing, so the
 * Website page can ask every couple of seconds while a new website's
 * photograph is being taken after its answer, and swap it in the moment it
 * lands. `{ url: null }` until there is one.
 */
export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const who = await owned(installId)
  if (who instanceof NextResponse) return who
  /*
    ?render=1: WHERE THE PAGE THE COVER IS TAKEN OF CAN BE SEEN, for the
    owner's Website page to show it small while a photograph is on its way
    or could not be taken (app/app/website-builder, LiveMiniature). The same
    two-minute pass for this one install the browser that photographs it
    gets (lib/website-builder/cover-pass.ts), and the same page; `embedded=1`
    is what lets this origin, and only this origin, frame it (proxy.ts, and
    the compat route's own header). Only the owner is ever handed one.
  */
  if (new URL(req.url).searchParams.get("render") === "1") {
    const pass = encodeURIComponent(mintCoverPass(installId))
    const render = (await isCompatInstall(installId)) ? `/api/site-theme/cover/${pass}?embedded=1` : `/cover-render/${pass}?embedded=1`
    return NextResponse.json({ render }, { headers: { "Cache-Control": "no-store" } })
  }
  try {
    const cover = await newestCover({ installId, userId: who.ownerUserId })
    return NextResponse.json(cover ?? { url: null }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ url: null }, { headers: { "Cache-Control": "no-store" } })
  }
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const who = await owned(installId)
  if (who instanceof NextResponse) return who

  /* A browser launch each, so counted per person before one starts: LIMITS.siteCover. */
  const limited = await rateLimit({
    bucket: "site-cover",
    subjects: [`user:${who.userId}`],
    windows: LIMITS.siteCover,
    message: "The cover was asked for too often. The current one stays for now.",
  })
  if (limited) return limited

  /* The photographing is shared with the routes that create a website: lib/website-builder/cover-take.ts */
  try {
    const cover = await takeCover(
      { installId, userId: who.ownerUserId, creatorId: who.creatorId },
      renderOrigin(req.url),
    )
    return NextResponse.json(cover)
  } catch (e) {
    /* Said out loud: a cover that silently never arrives is how this went
       unnoticed for a week the last time. */
    console.error("[cover] could not take the screenshots:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "The cover could not be taken" }, { status: 502 })
  }
}
