import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { formActor } from "@/lib/forms/server"
import { platformOrigin } from "@/lib/onepage/return-address"
import { CALLBACK_PATH, exchangeCode, googleCalendarConfig, readState } from "@/lib/google-calendar/api"
import { saveTokens } from "@/lib/google-calendar/server"

/*
  GET /api/google-calendar/callback?code=&state= (round AR)

  Google's answer to the consent screen. Taken only when the state is one
  this server signed for the signed in user, under ten minutes old, with
  the nonce this browser was given. The code is traded for tokens on the
  server, the refresh token sealed and saved, and the creator sent back to
  Bookings with a word on how it went. No token is ever put in a URL or
  sent to the browser.
*/
const NONCE_COOKIE = "slb_gcal_nonce"

export async function GET(request: Request) {
  const back = (word: string) => {
    const res = NextResponse.redirect(`${platformOrigin()}/app/bookings?google=${word}`, 303)
    res.cookies.set(NONCE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google-calendar", maxAge: 0 })
    res.headers.set("Cache-Control", "no-store")
    return res
  }
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const config = googleCalendarConfig()
  if (!config) return back("not_set_up")
  const url = new URL(request.url)
  if (url.searchParams.get("error")) return back("declined")
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value
  if (!readState(url.searchParams.get("state"), nonce, actor.user.id)) return back("expired")
  const code = url.searchParams.get("code")
  if (!code || code.length > 2000) return back("error")
  try {
    const tokens = await exchangeCode(fetch, config, code, `${platformOrigin()}${CALLBACK_PATH}`)
    if (!tokens.scope.includes("calendar")) return back("no_calendar")
    const saved = await saveTokens(createAdminClient(), actor.user.id, tokens)
    if (!saved.ok) return back(saved.missing ? "needs_sql" : "error")
    return back("connected")
  } catch {
    return back("error")
  }
}
