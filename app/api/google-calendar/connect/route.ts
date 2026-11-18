import { NextResponse } from "next/server"
import { formActor } from "@/lib/forms/server"
import { platformOrigin } from "@/lib/onepage/return-address"
import { CALLBACK_PATH, consentUrl, googleCalendarConfig, makeState } from "@/lib/google-calendar/api"

/*
  GET /api/google-calendar/connect: the signed in creator is sent to
  Google's consent screen (round AR). The state is signed and names them;
  its nonce also goes in an http only cookie scoped to these routes, so the
  callback only accepts an answer that started in this browser for this
  account. With no Google client set, back to Bookings, which says so.
*/
const NONCE_COOKIE = "slb_gcal_nonce"

export async function GET() {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const back = `${platformOrigin()}/app/bookings`
  const config = googleCalendarConfig()
  if (!config) return NextResponse.redirect(`${back}?google=not_set_up`, 303)
  const { state, nonce } = makeState(actor.user.id)
  const res = NextResponse.redirect(consentUrl(config, `${platformOrigin()}${CALLBACK_PATH}`, state), 303)
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google-calendar", maxAge: 600 })
  res.headers.set("Cache-Control", "no-store")
  return res
}
