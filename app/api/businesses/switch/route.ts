import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { businessGroup, maySwitch, recordSwitch, requestUser, sessionFor } from "@/lib/businesses/server"
import { setSessionCookies } from "@/lib/businesses/session-cookies"

/**
 * Switch the browser to the signed in person's other business.
 *
 * The caller has to be signed in, and the business they ask for has to be in
 * the same group as their own account (maySwitch): the first business and
 * the ones it made can reach each other, and nobody can reach any other
 * account from here, whatever id they send. Only then is a session made for it (lib/businesses/server
 * sessionFor), answered never cached, and the switch written to the log.
 *
 * THE ANSWER CARRIES THE SESSION IN ITS OWN COOKIES (lib/businesses/
 * session-cookies), so the browser holds the new business the moment this
 * answer lands, and nothing on the page has to be waited on for it: on a
 * phone the page's own way of storing it is where "Switching to ..." stayed
 * for ever. The session is still in the body, for the app's own device store
 * and for a web view that drops a fetch's cookies (lib/businesses/switch-
 * flow).
 *
 * The switch screen's cookie (lib/businesses/switch-screen SWITCH_COOKIE)
 * comes back the same way when the menu sent the name and photo to draw: it
 * is what the new /app's HTML draws the screen from, and a cookie the page
 * wrote a moment before asking for that HTML is the one most likely to miss
 * it.
 *
 * Twenty a minute is far past anybody switching by hand and far short of
 * anything scripted.
 */

export const dynamic = "force-dynamic"
const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: Request) {
  const user = await requestUser(request)
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE })

  let to: unknown = null
  let arrival: { name?: unknown; photo?: unknown } | null = null
  try {
    const body = (await request.json()) as { to?: unknown; arrival?: unknown }
    to = body?.to
    if (body?.arrival && typeof body.arrival === "object") arrival = body.arrival as { name?: unknown; photo?: unknown }
  } catch {
    /* a body that is not JSON is simply no business */
  }
  if (typeof to !== "string" || to.length > 64) {
    return NextResponse.json({ error: "Say which business to open." }, { status: 400, headers: NO_STORE })
  }

  const limited = await rateLimit({
    bucket: "business-switch",
    subjects: [`user:${user.id}`],
    windows: [
      { limit: 20, seconds: 60 },
      { limit: 300, seconds: 3600 },
    ],
    message: "Too many switches just now. Try again in a minute.",
  })
  if (limited) return limited

  const group = await businessGroup(user.id)
  if (!maySwitch(group, user.id, to)) {
    return NextResponse.json({ error: "That business is not yours to open." }, { status: 403, headers: NO_STORE })
  }

  const session = await sessionFor(to)
  if (!session) {
    return NextResponse.json({ error: "That business could not be opened. Try again." }, { status: 502, headers: NO_STORE })
  }
  await recordSwitch(user.id, to, request)

  const res = NextResponse.json({ session }, { headers: NO_STORE })
  setSessionCookies(res, request, session, arrival)
  return res
}
