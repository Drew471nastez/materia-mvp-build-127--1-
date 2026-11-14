import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { HOST_PREFIX, plantedExpiries } from "@/lib/supabase/host-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  LOG OUT, ON THIS DEVICE, WHATEVER SUPABASE AUTH ANSWERS (round 53)
 * ===========================================================================
 * Settings' Log out called `auth.signOut()` in the browser and went to the
 * front page. Two ways it left the session in place
 * (scripts/check-auth-flows-r52.mjs, "the cookie stayed"):
 *
 *   1  a press before the page's script had run did nothing at all: the
 *      button was a plain button with an onClick;
 *   2  @supabase/auth-js (2.87.3, GoTrueClient._signOut) keeps the session
 *      when the logout request fails with anything but a 401, 403 or 404
 *      (a dropped connection, a timeout, a 5xx): it answers { error } and
 *      never clears the cookie, and the page went to "/" signed in.
 *
 * This route ends it on the server: Supabase Auth is asked to end the
 * session (the scope asked for), and every session cookie of this browser
 * is expired in the answer, whether Auth answered or not ("everywhere" is
 * the exception: only Auth can end the other sessions, so when it did not,
 * nothing is ended and the answer is a 503). A form post (the
 * button pressed before the script ran) is sent on to the front page; a
 * fetch gets { ok, auth } back, auth false when Supabase Auth did not end
 * the session (for "everywhere", which only Auth can do).
 *
 * Same origin only. Nothing here signs anybody in or reads anybody's data.
 */

const SESSION_COOKIE = /^(?:__Host-)?sb-[^=;]+-auth-token(?:\.\d+)?$|^(?:__Host-)?sb-[^=;]+-auth-token-code-verifier$/

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return (request.headers.get("sec-fetch-site") ?? "same-origin") === "same-origin"
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") || request.headers.get("host"))
  } catch {
    return false
  }
}

async function scopeOf(request: NextRequest): Promise<"local" | "global"> {
  try {
    const type = request.headers.get("content-type") || ""
    if (type.includes("application/json")) return (await request.json())?.scope === "global" ? "global" : "local"
    if (type.includes("form")) return (await request.formData()).get("scope") === "global" ? "global" : "local"
  } catch {
    /* no body: this device */
  }
  return "local"
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const form = !(request.headers.get("content-type") || "").includes("application/json")
  const scope = await scopeOf(request)

  let auth = true
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut({ scope })
    if (error) auth = false
  } catch {
    auth = false
  }

  /* "Everywhere" is all or nothing: only Supabase Auth can end the other sessions, so when it did not, this one stays too and the person can ask again. */
  if (scope === "global" && !auth) {
    return NextResponse.json({ error: "Your other devices could not be reached. Try again in a moment.", auth: false }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }

  /* Whatever Auth said, this browser's session ends here. */
  const jar = await cookies()
  const legacy: string[] = []
  for (const c of jar.getAll()) {
    if (!SESSION_COOKIE.test(c.name)) continue
    /* A `__Host-` cookie (round AX, lib/supabase/host-session.ts) is only expired by a Secure Set-Cookie. */
    if (c.name.startsWith(HOST_PREFIX)) jar.set(c.name, "", { path: "/", maxAge: 0, secure: true })
    else {
      jar.set(c.name, "", { path: "/", maxAge: 0 })
      legacy.push(c.name)
    }
  }

  const headers = { "Cache-Control": "no-store" }
  const res = form ? NextResponse.redirect(new URL("/", request.url), { status: 303, headers }) : NextResponse.json({ ok: true, auth }, { headers })
  /*
    AN OLD-NAME COPY A PUBLISHED SITE PLANTED (Domain=storelib.com) GOES TOO. While the `__Host-` session stood it
    was never read; with it gone, it would be the only session left and the browser would be signed in to the
    planter's account. Expired at the domain only: a copy this host set itself is not touched by it.
  */
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  if (!mainDomain.includes("localhost")) for (const line of plantedExpiries(legacy, mainDomain, "/")) res.headers.append("Set-Cookie", line)
  return res
}
