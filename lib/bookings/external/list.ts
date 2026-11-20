/**
 * Bookings made on Calendly or Cal.com in the Bookings list (app/api/bookings), beside the store's own: read the
 * same way (upcoming soonest first, past latest first, from the same cursor), merged by time, one page of the two.
 * Read as the signed in user (external_bookings_owner_read, run-now part 475) and filtered to their id as well; a
 * read that fails, or a database before part 475, adds nothing.
 */
import { EXTERNAL_PROVIDER_NAME, isExternalProvider } from "./providers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface ExternalListRow {
  id: string
  source: "calendly" | "calcom"
  starts_at: string
  ends_at: string
  status: "confirmed" | "cancelled" | "rescheduled"
  timezone: string | null
  invitee_name: string | null
  invitee_email: string | null
  event_name: string | null
  created_at: string
}

const COLUMNS = "id, source, starts_at, ends_at, status, timezone, invitee_name, invitee_email, event_name, created_at"

export async function externalBookingsPage(db: Db, ownerId: string, q: { past: boolean; cursor: number; now: string; limit: number }): Promise<ExternalListRow[]> {
  try {
    let read = db.from("external_bookings").select(COLUMNS).eq("owner_id", ownerId)
    if (q.past) {
      read = read.lt("starts_at", q.now).order("starts_at", { ascending: false })
      if (Number.isFinite(q.cursor)) read = read.lt("starts_at", new Date(q.cursor).toISOString())
    } else {
      read = read.gte("ends_at", q.now).order("starts_at", { ascending: true })
      if (Number.isFinite(q.cursor)) read = read.gt("starts_at", new Date(q.cursor).toISOString())
    }
    const { data, error } = await read.limit(q.limit)
    if (error) return []
    return ((data ?? []) as ExternalListRow[]).filter((r) => isExternalProvider(r.source))
  } catch {
    return []
  }
}

/** What the list draws for an external booking: the native row's fields, with where it came from. */
export function externalListItem(r: ExternalListRow) {
  return {
    id: r.id,
    form_id: null,
    submission_id: null,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    status: r.status,
    visitor_timezone: r.timezone,
    payment_status: null,
    created_at: r.created_at,
    source: r.source,
    name: r.invitee_name,
    email: r.invitee_email,
    form_title: r.event_name || EXTERNAL_PROVIDER_NAME[r.source],
  }
}

/**
 * One page of both, in the list's order: the first `limit` of the two together. `native` is the native rows on
 * that page (the route reads their names and forms for those only), `order` the whole page with the native rows
 * drawn by the route's own mapper, and `next` the cursor after it.
 */
export function mergeBookingPages<N extends { id: string; starts_at: string }>(native: N[], external: ExternalListRow[], opts: { past: boolean; limit: number }) {
  type Entry = { at: number; native?: N; external?: ExternalListRow }
  const all: Entry[] = [...native.map((n) => ({ at: Date.parse(n.starts_at), native: n })), ...external.map((e) => ({ at: Date.parse(e.starts_at), external: e }))]
  all.sort((a, b) => (opts.past ? b.at - a.at : a.at - b.at))
  const page = all.slice(0, opts.limit)
  const last = page[page.length - 1]
  return {
    native: page.filter((e) => e.native).map((e) => e.native!),
    next: all.length > opts.limit && last ? (last.native ?? last.external)!.starts_at : null,
    order: <M>(draw: (n: N) => M) => page.map((e) => (e.native ? draw(e.native) : externalListItem(e.external!))),
  }
}

/** One external booking of this owner, as the booking sheet reads it (app/api/bookings/<id>), or null. */
export async function readExternalBooking(db: Db, ownerId: string, id: string) {
  try {
    const { data, error } = await db
      .from("external_bookings")
      .select("id, source, starts_at, ends_at, status, timezone, invitee_name, invitee_email, event_name, location, cancel_reason, cancelled_by, created_at")
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle()
    if (error || !data) return null
    const r = data as ExternalListRow & { location: string | null; cancel_reason: string | null; cancelled_by: string | null }
    if (!isExternalProvider(r.source)) return null
    const url = r.location && /^https:\/\//.test(r.location) ? r.location : null
    return {
      ...externalListItem(r),
      owner_timezone: null,
      where: r.location ? { label: url ? "Link" : "Where", text: r.location, url } : null,
      contact: { name: r.invitee_name, email: r.invitee_email, phone: null },
      answers: [],
      cancel_reason: r.cancel_reason,
      cancelled_by_name: r.cancelled_by,
    }
  } catch {
    return null
  }
}
