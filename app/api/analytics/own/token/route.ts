import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { HANDOFF_TTL_MS, MARKER_TTL_MS, OWN_MARKER_DOMAIN_COOKIE, signOwnHandoff, signOwnMarker } from "@/lib/analytics/own-marker"
import { getMainDomain } from "@/lib/url-helpers"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE TOKEN THE APP PUTS ON A LINK TO THE CREATOR'S OWN SITE, so the site's
 * host can tell it is them and leave their visit out of their own analytics
 * (lib/analytics/own-marker explains the whole hand-off).
 *
 * It is minted only for the creator the session belongs to, never for a
 * creator named in the request, so the worst a token can do is stop counting
 * the browser holding it on the pages of the creator who asked for it.
 */
export async function GET(request: Request) {
  /*
    Round 49: this was its own getUser(), with no ceiling of its own, on every
    /app page that links to the creator's site: 41 error lines in a day when
    Supabase Auth was slow, each waiting the full 10s. It changes nothing a
    person chose (the token is derived from who is signed in), so it takes
    the page's answer: Auth, or the token's verified signature while Auth is
    slow (lib/auth/route-user, fresh: false). Could not tell: a 503 the
    browser asks again, never a 401 that reads as signed out.
  */
  const who = await routeUser({ fresh: false })
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user") return NextResponse.json({ token: null }, { status: 401, headers: { "Cache-Control": "no-store" } })
  const user = who.user
  const supabase = await createClient()

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  const token = creator?.id ? signOwnHandoff(creator.id as string) : null
  /*
    EVERY SITE ON STORELIB'S OWN DOMAIN AT ONCE (lib/analytics/own-marker
    OWN_MARKER_DOMAIN_COOKIE): the creator's mark for <name>.storelib.com, so
    the app opens those at their plain address. Only from Storelib's own host,
    never on a local machine. HttpOnly, so no site's script can read it.
  */
  const main = getMainDomain().toLowerCase().replace(/^www\./, "")
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase()
  const mark = creator?.id ? signOwnMarker(creator.id as string) : null
  const sitesMarked = !!mark && !main.includes("localhost") && (host === main || host === `www.${main}`)
  const res = NextResponse.json(
    { token, expiresIn: Math.floor(HANDOFF_TTL_MS / 1000), sitesMarked, sitesDomain: sitesMarked ? main : null },
    { headers: { "Cache-Control": "no-store" } },
  )
  if (sitesMarked) {
    res.headers.append("Set-Cookie", [`${OWN_MARKER_DOMAIN_COOKIE}=${encodeURIComponent(mark!)}`, `Domain=${main}`, `Max-Age=${Math.floor(MARKER_TTL_MS / 1000)}`, "Path=/", "HttpOnly", "SameSite=Lax", "Secure"].join("; "))
  }
  return res
}
