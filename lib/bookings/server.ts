import "server-only"
import { validateDefinition, type BookingSettings, type Answer } from "@/lib/forms/definition"
import { ownerDay, slotOffered, type Interval } from "@/lib/forms/slots"
import { googleBusy } from "@/lib/google-calendar/server"
import type { Fetch } from "@/lib/google-calendar/api"
import type { StoredLocation } from "./calendar-file"

/*
  A BOOKING'S LIFE AFTER IT IS MADE (round AR): moved or cancelled, by the
  creator from /app or by the visitor from the signed link in their email.

  The same rules as a new booking: a new time must be one the form offers
  and nothing holds (Storelib's own bookings, and Google busy times when
  Google Calendar is connected), the database refuses an overlap
  (form_bookings_no_overlap, part 375) whatever the route thought, and
  every write names the owner, so an id from another creator changes
  nothing. Who may call: the creator's routes pass the signed in user's id;
  the visitor's route passes the owner id read from the booking a valid
  signed link names.
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any; rpc?: (...args: any[]) => any }

export const ACTIVE = ["pending", "confirmed"] as const

export interface BookingRow {
  id: string
  owner_id: string
  form_id: string
  submission_id: string
  starts_at: string
  ends_at: string
  hold_until: string
  status: "pending" | "confirmed" | "declined" | "cancelled"
  visitor_timezone: string | null
  created_at: string
  decided_at: string | null
  payment_status?: string | null
  duration_minutes?: number | null
  location?: StoredLocation | null
  cancelled_by?: string | null
  cancel_reason?: string | null
  rescheduled_at?: string | null
  reschedule_count?: number | null
  google_event_id?: string | null
  google_calendar_id?: string | null
}

const BASE = "id,owner_id,form_id,submission_id,starts_at,ends_at,hold_until,status,visitor_timezone,created_at,decided_at,payment_status"
export const BOOKING_COLUMNS = `${BASE},duration_minutes,location,cancelled_by,cancel_reason,rescheduled_at,reschedule_count,google_event_id,google_calendar_id`

const missingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(e.message || ""))

/** One booking of this owner, or null. Before part 410 the newer columns are left out. */
export async function readOwnedBooking(db: Db, ownerId: string, bookingId: string): Promise<BookingRow | null> {
  let { data, error } = await db.from("form_bookings").select(BOOKING_COLUMNS).eq("id", bookingId).eq("owner_id", ownerId).maybeSingle()
  if (missingColumn(error)) ({ data, error } = await db.from("form_bookings").select(BASE).eq("id", bookingId).eq("owner_id", ownerId).maybeSingle())
  if (error) throw new Error("The booking could not be read.")
  return (data as BookingRow | null) || null
}

/** The booking settings of a form this owner published, or null. */
export async function readFormSettings(db: Db, ownerId: string, formId: string): Promise<{ title: string; settings: BookingSettings } | null> {
  const { data } = await db.from("native_forms").select("published,draft,title").eq("id", formId).eq("owner_id", ownerId).maybeSingle()
  const raw = data?.published || data?.draft
  if (!raw) return null
  try {
    const def = validateDefinition(raw, false)
    return def.booking ? { title: def.title || data.title || "Booking", settings: def.booking } : null
  } catch {
    return null
  }
}

export function lengthOf(b: Pick<BookingRow, "starts_at" | "ends_at" | "duration_minutes">): number {
  return b.duration_minutes || Math.round((Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60_000)
}

/**
 * What blocks a time: every active booking of this owner (whatever its
 * form, each to its hold_until), the owner's Google busy times padded by
 * the buffer, and how many active bookings of this form fall on each of
 * the owner's dates (for the daily limit). `excludeId` leaves out the
 * booking being moved.
 */
export async function readBusy(
  db: Db,
  input: { ownerId: string; formId: string; settings: Pick<BookingSettings, "timezone" | "buffer" | "max_per_day">; fromMs: number; toMs: number; excludeId?: string; google?: boolean; fetcher?: Fetch },
): Promise<{ busy: Interval[]; perDay: Record<string, number>; error?: boolean }> {
  const { data, error } = await db
    .from("form_bookings")
    .select("id,form_id,starts_at,hold_until")
    .eq("owner_id", input.ownerId)
    .in("status", [...ACTIVE])
    .lt("starts_at", new Date(input.toMs + 2 * 86_400_000).toISOString())
    .gt("hold_until", new Date(input.fromMs - 2 * 86_400_000).toISOString())
    .limit(3000)
  if (error) return { busy: [], perDay: {}, error: true }
  const rows = ((data || []) as { id: string; form_id: string; starts_at: string; hold_until: string }[]).filter((r) => r.id !== input.excludeId)
  const busy: Interval[] = rows.map((b) => ({ start: Date.parse(b.starts_at), end: Date.parse(b.hold_until) }))
  const perDay: Record<string, number> = {}
  if (input.settings.max_per_day)
    for (const r of rows) if (r.form_id === input.formId) {
      const k = ownerDay(input.settings.timezone, Date.parse(r.starts_at))
      perDay[k] = (perDay[k] || 0) + 1
    }
  if (input.google !== false) busy.push(...(await googleBusy(db as never, input.ownerId, input.fromMs - 86_400_000, input.toMs + 86_400_000, input.settings.buffer, input.fetcher)))
  return { busy, perDay }
}

export type ChangeResult = { ok: true; booking: BookingRow; before: BookingRow } | { ok: false; status: number; error: string; taken?: boolean }

/**
 * Moves an active booking to a new start. The creator may ignore the
 * notice period (they know their own day); the visitor may not. The update
 * names the old start too, so two moves at once cannot both land.
 */
export async function moveBooking(
  db: Db,
  input: { ownerId: string; bookingId: string; start: string; by: "owner" | "visitor"; nowMs?: number; fetcher?: Fetch },
): Promise<ChangeResult> {
  const now = input.nowMs ?? Date.now()
  const before = await readOwnedBooking(db, input.ownerId, input.bookingId)
  if (!before) return { ok: false, status: 404, error: "Booking not found." }
  if (!(ACTIVE as readonly string[]).includes(before.status)) return { ok: false, status: 409, error: "This booking was cancelled, so it cannot be moved." }
  if (input.by === "visitor" && Date.parse(before.starts_at) <= now) return { ok: false, status: 409, error: "This booking has already started." }
  const form = await readFormSettings(db, input.ownerId, before.form_id)
  if (!form) return { ok: false, status: 409, error: "This booking form is no longer taking bookings." }
  const settings = input.by === "owner" ? { ...form.settings, notice_hours: 0, max_per_day: undefined } : form.settings
  const length = lengthOf(before)
  const start = Date.parse(input.start)
  if (!Number.isFinite(start)) return { ok: false, status: 400, error: "Choose a time." }
  const read = await readBusy(db, { ownerId: input.ownerId, formId: before.form_id, settings, fromMs: start, toMs: start + 1, excludeId: before.id, fetcher: input.fetcher })
  if (read.error) return { ok: false, status: 503, error: "Times could not be checked. Try again." }
  const offered = slotOffered(settings, input.start, now, read.busy, { perDay: read.perDay, duration: length })
  if (!offered) return { ok: false, status: 409, error: "That time is no longer available. Choose another.", taken: true }
  const hold = new Date(Date.parse(offered.end) + settings.buffer * 60_000).toISOString()
  const at = new Date(now).toISOString()
  const patch = { starts_at: offered.start, ends_at: offered.end, hold_until: hold, rescheduled_at: at, reschedule_count: (before.reschedule_count || 0) + 1, updated_at: at }
  const write = (p: Record<string, unknown>) =>
    db.from("form_bookings").update(p).eq("id", before.id).eq("owner_id", input.ownerId).eq("starts_at", before.starts_at).in("status", [...ACTIVE]).select(BASE).maybeSingle()
  let { data, error } = await write(patch)
  if (missingColumn(error)) ({ data, error } = await write({ starts_at: offered.start, ends_at: offered.end, hold_until: hold }))
  if (error?.code === "23505" || error?.code === "23P01") return { ok: false, status: 409, error: "That time was just taken. Choose another.", taken: true }
  if (error) return { ok: false, status: 503, error: "The booking did not move. Try again." }
  if (!data) return { ok: false, status: 409, error: "This booking changed a moment ago. Reload and try again." }
  return { ok: true, before, booking: { ...before, ...(data as BookingRow), reschedule_count: patch.reschedule_count, rescheduled_at: at } }
}

/** Cancels an active booking, freeing its time. */
export async function cancelBooking(db: Db, input: { ownerId: string; bookingId: string; by: "owner" | "visitor"; reason?: string; nowMs?: number }): Promise<ChangeResult> {
  const now = input.nowMs ?? Date.now()
  const before = await readOwnedBooking(db, input.ownerId, input.bookingId)
  if (!before) return { ok: false, status: 404, error: "Booking not found." }
  if (!(ACTIVE as readonly string[]).includes(before.status)) return { ok: false, status: 409, error: "This booking is already cancelled." }
  if (input.by === "visitor" && Date.parse(before.starts_at) <= now) return { ok: false, status: 409, error: "This booking has already started." }
  const at = new Date(now).toISOString()
  const reason = (input.reason || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 500) || null
  const write = (p: Record<string, unknown>) => db.from("form_bookings").update(p).eq("id", before.id).eq("owner_id", input.ownerId).in("status", [...ACTIVE]).select(BASE).maybeSingle()
  let { data, error } = await write({ status: "cancelled", decided_at: at, cancelled_by: input.by, cancel_reason: reason, updated_at: at })
  if (missingColumn(error)) ({ data, error } = await write({ status: "cancelled", decided_at: at }))
  if (error) return { ok: false, status: 503, error: "The booking was not cancelled. Try again." }
  if (!data) return { ok: false, status: 409, error: "This booking changed a moment ago. Reload and try again." }
  return { ok: true, before, booking: { ...before, ...(data as BookingRow), cancelled_by: input.by, cancel_reason: reason } }
}

/* ── What the notices and the calendar need about a booking ─────────────── */

export interface BookingContext {
  booking: BookingRow
  formTitle: string
  settings: BookingSettings | null
  contact: { name: string | null; email: string | null; phone: string | null }
  answers: Answer[]
}

export async function readContext(db: Db, booking: BookingRow): Promise<BookingContext> {
  const [{ data: sub }, form] = await Promise.all([
    db.from("form_submissions").select("contact_name,contact_email,contact_phone,answers,form_title").eq("id", booking.submission_id).eq("owner_id", booking.owner_id).maybeSingle(),
    readFormSettings(db, booking.owner_id, booking.form_id),
  ])
  return {
    booking,
    formTitle: form?.title || sub?.form_title || "Booking",
    settings: form?.settings || null,
    contact: { name: sub?.contact_name ?? null, email: sub?.contact_email ?? null, phone: sub?.contact_phone ?? null },
    answers: Array.isArray(sub?.answers) ? (sub!.answers as Answer[]) : [],
  }
}
