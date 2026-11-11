import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { boundedJson, formActor, formError, NO_STORE } from "@/lib/forms/server"
import { googleCalendarConfig, listCalendars, revokeToken } from "@/lib/google-calendar/api"
import { accessToken, readConnection } from "@/lib/google-calendar/server"
import { openSecret } from "@/lib/physical/secrets"

/*
  The signed in creator's Google Calendar connection (round AR).

  GET     whether Google is set up on this server, whether they are
          connected (and as which address), their calendars, and which
          block bookings and which takes new ones
  PATCH   { busy_calendar_ids: string[], write_calendar_id: string }
          only ids Google lists for them are kept
  DELETE  disconnect: the grant is revoked at Google and the row removed

  Every read and write is the signed in user's own row. No token leaves
  the server.
*/

export async function GET() {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  if (!googleCalendarConfig()) return NextResponse.json({ configured: false, connected: false }, { headers: NO_STORE })
  const db = createAdminClient()
  const conn = await readConnection(db, actor.user.id)
  if (conn.kind === "unavailable") return NextResponse.json({ configured: true, connected: false, needs_sql: true }, { headers: NO_STORE })
  if (conn.kind === "none") return NextResponse.json({ configured: true, connected: false }, { headers: NO_STORE })
  const token = await accessToken(db, conn.row)
  const calendars = token ? await listCalendars(fetch, token).catch(() => null) : null
  return NextResponse.json(
    {
      configured: true,
      connected: true,
      email: conn.row.google_email,
      needs_reconnect: !token,
      calendars,
      busy_calendar_ids: conn.row.busy_calendar_ids,
      write_calendar_id: conn.row.write_calendar_id,
    },
    { headers: NO_STORE },
  )
}

export async function PATCH(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  if (!googleCalendarConfig()) return formError(new Error("Google Calendar is not set up on Storelib yet."), 503)
  try {
    const body = await boundedJson(request, 8000)
    const db = createAdminClient()
    const conn = await readConnection(db, actor.user.id)
    if (conn.kind !== "connected") return formError(new Error("Connect Google Calendar first."), 409)
    const token = await accessToken(db, conn.row)
    if (!token) return formError(new Error("Connect Google Calendar again."), 409)
    const calendars = await listCalendars(fetch, token)
    const known = new Set(calendars.map((c) => c.id))
    const busy = Array.isArray(body.busy_calendar_ids) ? [...new Set((body.busy_calendar_ids as unknown[]).filter((x): x is string => typeof x === "string" && known.has(x)))].slice(0, 20) : conn.row.busy_calendar_ids
    const writable = calendars.find((c) => c.id === body.write_calendar_id && c.canWrite)
    const { error } = await db
      .from("google_calendar_connections")
      .update({ busy_calendar_ids: busy, write_calendar_id: writable ? writable.id : conn.row.write_calendar_id, updated_at: new Date().toISOString() })
      .eq("owner_id", actor.user.id)
    if (error) return formError(new Error("That was not saved. Try again."), 503)
    return NextResponse.json({ ok: true, busy_calendar_ids: busy, write_calendar_id: writable ? writable.id : conn.row.write_calendar_id }, { headers: NO_STORE })
  } catch (error) {
    return formError(error)
  }
}

export async function DELETE() {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const db = createAdminClient()
  const conn = await readConnection(db, actor.user.id)
  if (conn.kind === "connected") {
    const refresh = openSecret(conn.row.refresh_token_sealed)
    if (refresh) await revokeToken(fetch, refresh)
    const { error } = await db.from("google_calendar_connections").delete().eq("owner_id", actor.user.id)
    if (error) return formError(new Error("Google Calendar was not disconnected. Try again."), 503)
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
