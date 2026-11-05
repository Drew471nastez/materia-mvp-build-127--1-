import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
/* Round 52: the token's verified signature, with no Supabase Auth round trip (lib/auth/route-user). */
import { readerForRequest } from "@/lib/auth/route-user"
import { missingSchema } from "@/lib/account/preferences"
import { TIME_ZONE_KEY, validTimeZone } from "@/lib/account/time-zone"
import { TIME_ZONE_COOKIE } from "@/lib/orders/time-zone"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE ACCOUNT'S TIME ZONE, SAVED (Settings, General)
 * ===========================================================================
 * POST { timeZone }   an IANA name ("Europe/Bucharest"), checked against
 *                     the zones this server's Intl knows; anything else is
 *                     a 400. Also sent once by /app's first run, with the
 *                     browser's own zone, when the account has none yet.
 *
 * Saved to profiles.timezone with the person's own client, and kept on the
 * account's metadata, which is what pages holding the user read. A database
 * without the column yet (supabase/sql/run-now/22 not run) keeps it on the
 * account alone, and every reader falls back to it (lib/account/time-zone).
 * The cookie the server renders Orders and Home in is set here too, so the
 * next page is already in the new zone.
 */

const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: NextRequest) {
  let body: { timeZone?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE })
  }
  const zone = validTimeZone(body.timeZone)
  if (!zone) return NextResponse.json({ error: "That is not a time zone Storelib knows." }, { status: 400, headers: NO_STORE })

  const supabase = await createClient()
  const current = await readerForRequest()
  if (current.state === "indeterminate") {
    return NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503, headers: NO_STORE })
  }
  if (!current.user) return NextResponse.json({ error: "Your session ended. Sign in again to change this." }, { status: 401, headers: NO_STORE })
  const user = current.user

  let column: "saved" | "missing" = "saved"
  const { error } = await supabase.from("profiles").update({ timezone: zone }).eq("id", user.id)
  if (missingSchema(error)) {
    console.warn("[time-zone] profiles.timezone is not in the database yet (supabase/sql/run-now/22); kept on the account")
    column = "missing"
  } else if (error) {
    console.error(`[time-zone] not saved (${error.code ?? "unknown"})`)
    return NextResponse.json({ error: "The time zone did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }

  if (user.user_metadata?.[TIME_ZONE_KEY] !== zone) {
    const { error: metaError } = await supabase.auth.updateUser({ data: { [TIME_ZONE_KEY]: zone } })
    if (metaError) {
      console.error(`[time-zone] not kept on the account (${metaError.code ?? metaError.status ?? "unknown"})`)
      if (column === "missing") return NextResponse.json({ error: "The time zone did not save. Try again in a moment." }, { status: 500, headers: NO_STORE })
    }
  }

  const res = NextResponse.json({ ok: true, timeZone: zone }, { headers: NO_STORE })
  res.cookies.set(TIME_ZONE_COOKIE, zone, { path: "/", maxAge: 31536000, sameSite: "lax" })
  return res
}
