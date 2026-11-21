import { NextResponse } from "next/server"
import { formActor, formError, NO_STORE, isMissingSchema, isMissingTable } from "@/lib/forms/server"
import { googleCalendarConfig } from "@/lib/google-calendar/api"
import { externalBookingsPage, mergeBookingPages } from "@/lib/bookings/external/list"

/*
  GET /api/bookings?when=upcoming|past&before=<ISO>

  The signed in creator's bookings for /app/bookings (round AR): upcoming
  (soonest first) or past (latest first), 50 at a time, read as that user
  (RLS, form_bookings_owner_read) and filtered to their id as well, so
  another creator's rows can never come back. Each row carries who booked
  and which form; the answers are read one booking at a time
  (/api/bookings/<id>).

  With run-now part 475, bookings made on Calendly or Cal.com (lib/bookings/
  external) are read the same way, as the same user (external_bookings_owner_read),
  and merged in by time; each says its `source`. Before it runs they are
  simply not there.
*/

const PAGE = 50
const LIST = "id,form_id,submission_id,starts_at,ends_at,status,visitor_timezone,payment_status,created_at"

export async function GET(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const url = new URL(request.url)
  const past = url.searchParams.get("when") === "past"
  const cursor = Date.parse(url.searchParams.get("before") || url.searchParams.get("after") || "")
  const now = new Date().toISOString()
  let q = actor.db.from("form_bookings").select(LIST).eq("owner_id", actor.user.id)
  if (past) {
    q = q.lt("starts_at", now).order("starts_at", { ascending: false })
    if (Number.isFinite(cursor)) q = q.lt("starts_at", new Date(cursor).toISOString())
  } else {
    q = q.gte("ends_at", now).order("starts_at", { ascending: true })
    if (Number.isFinite(cursor)) q = q.gt("starts_at", new Date(cursor).toISOString())
  }
  const [{ data, error }, external] = await Promise.all([q.limit(PAGE + 1), externalBookingsPage(actor.db, actor.user.id, { past, cursor, now, limit: PAGE + 1 })])
  if (error) {
    if (isMissingTable(error) || isMissingSchema(error)) return NextResponse.json({ bookings: [], missing: true, google: { configured: !!googleCalendarConfig() } }, { headers: NO_STORE })
    return formError(new Error("Bookings could not be loaded. Try again."), 503)
  }
  const rows = (data || []) as { id: string; form_id: string; submission_id: string; starts_at: string; ends_at: string; status: string; visitor_timezone: string | null; payment_status: string | null; created_at: string }[]
  /* The native rows of this page, and the external ones that fall inside it (lib/bookings/external/list mergeBookingPages). */
  const merged = mergeBookingPages(rows, external, { past, limit: PAGE })
  const page = merged.native
  const subs = [...new Set(page.map((r) => r.submission_id))]
  const forms = [...new Set(page.map((r) => r.form_id))]
  const [{ data: people }, { data: formRows }] = await Promise.all([
    subs.length ? actor.db.from("form_submissions").select("id,contact_name,contact_email").eq("owner_id", actor.user.id).in("id", subs) : Promise.resolve({ data: [] }),
    forms.length ? actor.db.from("native_forms").select("id,title").eq("owner_id", actor.user.id).in("id", forms) : Promise.resolve({ data: [] }),
  ])
  const who = new Map(((people || []) as { id: string; contact_name: string | null; contact_email: string | null }[]).map((p) => [p.id, p]))
  const title = new Map(((formRows || []) as { id: string; title: string }[]).map((f) => [f.id, f.title]))
  return NextResponse.json(
    {
      bookings: merged.order((r) => ({
        ...r,
        source: "storelib",
        name: who.get(r.submission_id)?.contact_name || null,
        email: who.get(r.submission_id)?.contact_email || null,
        form_title: title.get(r.form_id) || "Booking",
      })),
      next: merged.next,
      google: { configured: !!googleCalendarConfig() },
    },
    { headers: NO_STORE },
  )
}
