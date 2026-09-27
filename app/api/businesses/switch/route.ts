import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { businessGroup, maySwitch, recordSwitch, requestUser, sessionFor } from "@/lib/businesses/server"
import { cleanSwitchName, cleanSwitchPhoto, SWITCH_COOKIE, SWITCH_COOKIE_MAX_AGE_S } from "@/lib/businesses/switch-screen"
import { parseCookieHeader, SESSION_COOKIE_MAX_AGE, sessionCookieChunks, storedSessionJson, storedSessionKey } from "@/lib/supabase/session-jar"

/**
 * Switch the browser to the signed in person's other business.
 *
 * The caller has to be signed in, and the business they ask for has to be in
 * the same group as their own account (maySwitch): the first business and
 * the ones it made can reach each other, and nobody can reach any other
 * account from here, whatever id they send. Only then is a session made for it (lib/businesses/server
 * sessionFor), answered never cached, and the switch written to the log.
 *
 * THE ANSWER CARRIES THE SESSION IN ITS OWN COOKIES. It used to hand the
 * tokens to the page, and the page put them in its cookies through the
 * Supabase client (`auth.setSession`), which waits on the client's lock, its
 * start up, a network call and its listeners, none of them with a limit: on
 * a phone that is where "Switching to ..." stayed for ever. Now the cookies
 * are set here, in the same chunks and format the server and the client use
 * (lib/supabase/session-jar), so the browser holds the new business the
 * moment this answer lands, before any script of the page has run, and a web
 * view that writes `document.cookie` to its network process a moment late
 * (WKWebView does) cannot open the new page with the old session. The
 * session is still in the body, for the app's own device store and for a
 * web view that drops a fetch's cookies (lib/businesses/switch-flow).
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
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https"
  const key = storedSessionKey()
  if (key) {
    const existing = parseCookieHeader(request.headers.get("cookie") || "").keys()
    const { set, expire } = sessionCookieChunks(key, storedSessionJson(session), existing)
    for (const c of set) res.cookies.set({ name: c.name, value: c.value, path: "/", maxAge: SESSION_COOKIE_MAX_AGE, sameSite: "lax", secure, httpOnly: false })
    for (const name of expire) res.cookies.set({ name, value: "", path: "/", maxAge: 0, sameSite: "lax", secure, httpOnly: false })
  }
  const name = arrival ? cleanSwitchName(arrival.name) : null
  if (name) {
    const photo = cleanSwitchPhoto(arrival?.photo)
    res.cookies.set({ name: SWITCH_COOKIE, value: photo ? `${name}\n${photo}` : name, path: "/app", maxAge: SWITCH_COOKIE_MAX_AGE_S, sameSite: "lax", secure, httpOnly: false })
  }
  return res
}
