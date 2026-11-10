/**
 * Round AR, track 2: OnePage bookings end to end.
 *
 *   availability   weekly hours in the owner's zone across DST, date
 *                  overrides, buffers, notice, the daily limit, lengths
 *   guard          a taken or overlapping time is never offered and never
 *                  accepted on a move; the database's refusal is a plain 409
 *   ownership      every read and write names the owner; another creator's
 *                  booking id is "not found"
 *   fan-out        who hears what for a new, moved and cancelled booking
 *                  (bell and phone, creator email, visitor email with .ics,
 *                  Google event)
 *   Google         OAuth state, token exchange and refresh, freeBusy, events
 *                  with Meet, moves and deletes, all replayed from recorded
 *                  answers (tests/fixtures/google-calendar-ar2.json); Google
 *                  is never called
 *   links          the visitor's signed change-or-cancel link
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "test-only-key-for-bookings-ar2"

import { generateSlots, ownerDay, ownerDayBounds, slotOffered, zonedInstant } from "../lib/forms/slots"
import { bookingDurations, publicDefinition, validateBooking, validateDefinition } from "../lib/forms/definition"
import { bookingManagePath, bookingManageToken, readManageToken } from "../lib/bookings/manage-token"
import { bookingCheckoutToken } from "../lib/forms/booking-payment"
import { bookingIcs, foldLine, googleAddUrl, icsText, locationWords } from "../lib/bookings/calendar-file"
import { ownerChangeMail, visitorBookingMail } from "../lib/bookings/emails"
import { announceBooking, eventFor, type AnnounceDeps } from "../lib/bookings/announce"
import { cancelBooking, moveBooking, readBusy, readOwnedBooking, type BookingRow } from "../lib/bookings/server"
import {
  consentUrl,
  deleteEvent,
  emailOfIdToken,
  exchangeCode,
  freeBusy,
  googleCalendarConfig,
  insertEvent,
  listCalendars,
  makeState,
  moveEvent,
  readState,
  refreshAccess,
  GoogleCalendarError,
  type Fetch,
} from "../lib/google-calendar/api"
import { accessToken, googleBusy, syncBookingEvent, type ConnectionRow } from "../lib/google-calendar/server"
import { sealSecret } from "../lib/physical/secrets"
import { pushPriority } from "../lib/notifications/push-bridge"

let passed = 0
const failures: string[] = []
const tests: [string, () => unknown][] = []
const check = (name: string, fn: () => unknown) => tests.push([name, fn])
const read = (p: string) => readFileSync(p, "utf8")
const H = 3_600_000
const D = 86_400_000

/* ── A small in-memory Supabase: enough of the query builder for these modules ── */

type Row = Record<string, any>
class Query {
  private filters: ((r: Row) => boolean)[] = []
  private op: "select" | "update" | "delete" | "upsert" = "select"
  private patch: Row | null = null
  private rows: Row[] | null = null
  private n = Infinity
  constructor(private db: FakeDb, private table: string) {}
  select() {
    return this
  }
  eq(k: string, v: unknown) {
    this.filters.push((r) => r[k] === v)
    return this
  }
  neq(k: string, v: unknown) {
    this.filters.push((r) => r[k] !== v)
    return this
  }
  in(k: string, v: unknown[]) {
    this.filters.push((r) => v.includes(r[k]))
    return this
  }
  lt(k: string, v: string) {
    this.filters.push((r) => String(r[k]) < v)
    return this
  }
  lte(k: string, v: string) {
    this.filters.push((r) => String(r[k]) <= v)
    return this
  }
  gt(k: string, v: string) {
    this.filters.push((r) => String(r[k]) > v)
    return this
  }
  gte(k: string, v: string) {
    this.filters.push((r) => String(r[k]) >= v)
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.n = n
    return this
  }
  update(p: Row) {
    this.op = "update"
    this.patch = p
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  upsert(rows: Row | Row[]) {
    this.op = "upsert"
    this.rows = Array.isArray(rows) ? rows : [rows]
    return this
  }
  private run(): { data: any; error: any } {
    const t = (this.db.tables[this.table] ||= [])
    const fail = this.db.failNext[`${this.table}:${this.op}`]
    if (fail) {
      delete this.db.failNext[`${this.table}:${this.op}`]
      return { data: null, error: fail }
    }
    const hit = t.filter((r) => this.filters.every((f) => f(r)))
    if (this.op === "select") return { data: hit.slice(0, this.n), error: null }
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.patch)
      this.db.writes.push({ table: this.table, op: "update", patch: this.patch!, count: hit.length })
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    if (this.op === "delete") {
      this.db.tables[this.table] = t.filter((r) => !hit.includes(r))
      return { data: hit, error: null }
    }
    for (const r of this.rows!) {
      const key = r.owner_id
      const at = t.findIndex((x) => x.owner_id === key)
      if (at >= 0) Object.assign(t[at], r)
      else t.push({ ...r })
    }
    return { data: this.rows, error: null }
  }
  maybeSingle() {
    const r = this.run()
    return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error })
  }
  single() {
    return this.maybeSingle()
  }
  then<T>(ok: (v: { data: any; error: any }) => T, bad?: (e: unknown) => T) {
    return Promise.resolve(this.run()).then(ok, bad)
  }
}
class FakeDb {
  tables: Record<string, Row[]> = {}
  writes: { table: string; op: string; patch: Row; count: number }[] = []
  failNext: Record<string, { code: string; message: string }> = {}
  from(table: string) {
    return new Query(this, table)
  }
}

/* ── Recorded Google answers ── */

const REC = JSON.parse(read("tests/fixtures/google-calendar-ar2.json")) as Record<string, { status: number; body: unknown }>
function replay(script: { match: RegExp; method?: string; answer: keyof typeof REC | { status: number; body: unknown } }[]): { fetch: Fetch; calls: { url: string; method: string; body: string }[] } {
  const calls: { url: string; method: string; body: string }[] = []
  const fetch: Fetch = async (url, init) => {
    const method = (init?.method || "GET").toUpperCase()
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : "" })
    const step = script.find((s) => s.match.test(url) && (!s.method || s.method === method))
    if (!step) throw new Error(`No recorded answer for ${method} ${url}`)
    const rec = typeof step.answer === "string" ? REC[step.answer] : step.answer
    return new Response(rec.body === null ? null : JSON.stringify(rec.body), { status: rec.status, headers: { "content-type": "application/json" } })
  }
  return { fetch, calls }
}

/* ── Availability maths ── */

const london = { duration: 60, buffer: 0, timezone: "Europe/London", weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "11:00" })), notice_hours: 0, days_ahead: 365 }

check("09:00 London is 08:00Z in summer and 09:00Z in winter, the day the clocks go back included", () => {
  const before = generateSlots(london, { fromMs: Date.parse("2026-10-24T00:00:00Z"), toMs: Date.parse("2026-10-25T00:00:00Z"), nowMs: Date.parse("2026-10-01T00:00:00Z") })
  const after = generateSlots(london, { fromMs: Date.parse("2026-10-25T00:00:00Z"), toMs: Date.parse("2026-10-26T00:00:00Z"), nowMs: Date.parse("2026-10-01T00:00:00Z") })
  assert.equal(before[0].start, "2026-10-24T08:00:00.000Z")
  assert.equal(after[0].start, "2026-10-25T09:00:00.000Z")
})

check("New York's spring forward: 02:30 is never offered, 03:00 is", () => {
  const ny = { ...london, timezone: "America/New_York", duration: 30, weekly: [{ day: 0, start: "02:00", end: "04:00" }] }
  const slots = generateSlots(ny, { fromMs: Date.parse("2026-03-08T00:00:00Z"), toMs: Date.parse("2026-03-09T12:00:00Z"), nowMs: Date.parse("2026-03-01T00:00:00Z") })
  assert.equal(zonedInstant("America/New_York", 2026, 3, 8, 2, 30), null)
  assert.deepEqual(slots.map((s) => s.start), ["2026-03-08T07:00:00.000Z", "2026-03-08T07:30:00.000Z"])
})

check("a visitor in Tokyo is offered the same instants; their own calendar date can differ from the owner's", () => {
  const s = generateSlots(london, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-02T00:00:00Z"), nowMs: Date.parse("2026-05-01T00:00:00Z") })
  assert.equal(s[0].start, "2026-06-01T08:00:00.000Z")
  assert.equal(ownerDay("Asia/Tokyo", Date.parse(s[0].start)), "2026-06-01")
  assert.equal(ownerDay("Pacific/Honolulu", Date.parse(s[0].start)), "2026-05-31")
})

check("a date override replaces the week: a day off offers nothing, other hours offer theirs", () => {
  const settings = { ...london, overrides: [{ date: "2026-06-01", windows: [] }, { date: "2026-06-02", windows: [{ start: "14:00", end: "15:00" }] }] }
  const now = Date.parse("2026-05-01T00:00:00Z")
  assert.equal(generateSlots(settings, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-02T00:00:00Z"), nowMs: now }).length, 0)
  assert.deepEqual(generateSlots(settings, { fromMs: Date.parse("2026-06-02T00:00:00Z"), toMs: Date.parse("2026-06-03T00:00:00Z"), nowMs: now }).map((s) => s.start), ["2026-06-02T13:00:00.000Z"])
  assert.equal(generateSlots(settings, { fromMs: Date.parse("2026-06-03T00:00:00Z"), toMs: Date.parse("2026-06-04T00:00:00Z"), nowMs: now }).length, 2)
})

check("a weekly window with no week at all still opens on an override date", () => {
  const settings = { ...london, weekly: [], overrides: [{ date: "2026-06-05", windows: [{ start: "10:00", end: "11:00" }] }] }
  assert.equal(generateSlots(settings, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-10T00:00:00Z"), nowMs: Date.parse("2026-05-01T00:00:00Z") }).length, 1)
})

check("the buffer steps slots apart and holds the time after a booking", () => {
  const b = { ...london, duration: 30, buffer: 15, weekly: [{ day: 1, start: "09:00", end: "11:00" }] }
  const now = Date.parse("2026-05-01T00:00:00Z")
  const slots = generateSlots(b, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-02T00:00:00Z"), nowMs: now })
  assert.deepEqual(slots.map((s) => s.start.slice(11, 16)), ["08:00", "08:45", "09:30"])
  /* A booking 08:45 to 09:15 holds until 09:30: 09:30 is still free, 08:00 (ends 08:30 + 15 = 08:45) too. */
  const busy = [{ start: Date.parse("2026-06-01T08:45:00Z"), end: Date.parse("2026-06-01T09:30:00Z") }]
  assert.deepEqual(generateSlots(b, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-02T00:00:00Z"), nowMs: now, busy }).map((s) => s.start.slice(11, 16)), ["08:00", "09:30"])
})

check("notice hours hide times too soon; days ahead hides times too far", () => {
  /* 07:30Z is 08:30 in London: today's 09:00 and 10:00 (08:00Z, 09:00Z) are inside the two hours' notice. */
  const now = Date.parse("2026-06-01T07:30:00Z")
  const s = generateSlots({ ...london, notice_hours: 2, days_ahead: 2 }, { fromMs: now, toMs: now + 5 * D, nowMs: now })
  assert.ok(s.every((x) => Date.parse(x.start) >= now + 2 * H && Date.parse(x.start) < now + 2 * D))
  assert.deepEqual(s.map((x) => x.start), ["2026-06-02T08:00:00.000Z", "2026-06-02T09:00:00.000Z"])
})

check("the daily limit closes a date that is full and leaves the others", () => {
  const settings = { ...london, max_per_day: 1 }
  const now = Date.parse("2026-05-01T00:00:00Z")
  const s = generateSlots(settings, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-03T00:00:00Z"), nowMs: now, perDay: { "2026-06-01": 1 } })
  assert.ok(s.every((x) => ownerDay("Europe/London", Date.parse(x.start)) === "2026-06-02"))
  assert.equal(slotOffered(settings, "2026-06-01T08:00:00.000Z", now, [], { perDay: { "2026-06-01": 1 } }), null)
})

check("a chosen length is one the form offers; slots use it", () => {
  const b = validateBooking({ timezone: "Europe/London", weekly: [{ day: 1, start: "09:00", end: "10:00" }], duration: 30, durations: [60, 30, 15, 999, "x"] })
  assert.deepEqual(bookingDurations(b), [30, 15, 60])
  /* validateBooking's defaults: 12 hours' notice and 30 days ahead, so "now" is a week before. */
  const s = generateSlots(b, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-02T00:00:00Z"), nowMs: Date.parse("2026-05-25T00:00:00Z"), duration: 60 })
  assert.equal(s.length, 1)
  assert.equal(Date.parse(s[0].end) - Date.parse(s[0].start), H)
})

check("an owner day's bounds follow its zone, a short day included", () => {
  const b = ownerDayBounds("Europe/London", "2026-03-29")
  assert.equal(new Date(b.start).toISOString(), "2026-03-29T00:00:00.000Z")
  assert.equal(new Date(b.end).toISOString(), "2026-03-29T23:00:00.000Z")
})

check("the new settings are checked: https meeting links, phone numbers, badge length, override shape", () => {
  const base = { timezone: "Europe/London", weekly: [{ day: 1, start: "09:00", end: "10:00" }] }
  assert.throws(() => validateBooking({ ...base, location: { kind: "video", value: "http://zoom.us/j/1" } }))
  assert.throws(() => validateBooking({ ...base, location: { kind: "phone", value: "12" } }))
  assert.throws(() => validateBooking({ ...base, overrides: [{ date: "2026-02-30", windows: [] }] }))
  assert.throws(() => validateBooking({ ...base, overrides: [{ date: "2026-06-01", windows: [{ start: "12:00", end: "11:00" }] }] }))
  assert.throws(() => validateBooking({ ...base, overrides: [{ date: "2026-06-01", windows: [] }, { date: "2026-06-01", windows: [] }] }))
  const ok = validateBooking({ ...base, location: { kind: "video", value: "https://zoom.us/j/1" }, badge: "Most booked by far, really, honestly", max_per_day: 3 })
  assert.equal(ok.badge!.length, 24)
  assert.equal(ok.max_per_day, 3)
  assert.equal(ok.location?.value, "https://zoom.us/j/1")
})

check("a video link stays on the server until a time is booked", () => {
  const def = validateDefinition({ title: "Call", consent_text: "OK", fields: [], booking: { timezone: "Europe/London", weekly: [{ day: 1, start: "09:00", end: "10:00" }], location: { kind: "video", value: "https://zoom.us/j/123" } } })
  assert.equal(def.booking?.location?.value, "https://zoom.us/j/123")
  assert.equal(publicDefinition(def).booking?.location?.value, undefined)
  assert.equal(publicDefinition(def).booking?.location?.kind, "video")
})

/* ── The guard, ownership and moves (in-memory database) ── */

const OWNER = "a5000000-0000-4000-8000-00000000000a"
const OTHER = "b5000000-0000-4000-8000-00000000000b"
const FORM = "a5000000-0000-4000-8000-0000000000f1"
const formRow = (owner = OWNER, id = FORM) => ({ id, owner_id: owner, title: "Call", published: { title: "Call", consent_text: "OK", fields: [], booking: { timezone: "Europe/London", duration: 30, buffer: 10, weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "17:00" })), notice_hours: 0, days_ahead: 365 } }, draft: null })
const bookingRow = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: "c0000000-0000-4000-8000-000000000001",
  owner_id: OWNER,
  form_id: FORM,
  submission_id: "d0000000-0000-4000-8000-000000000001",
  starts_at: "2030-06-03T08:00:00.000Z",
  ends_at: "2030-06-03T08:30:00.000Z",
  hold_until: "2030-06-03T08:40:00.000Z",
  status: "confirmed",
  visitor_timezone: "America/New_York",
  created_at: "2030-05-01T00:00:00.000Z",
  decided_at: null,
  payment_status: "none",
  reschedule_count: 0,
  ...over,
})
const world = () => {
  const db = new FakeDb()
  db.tables.native_forms = [formRow()]
  db.tables.form_bookings = [bookingRow(), bookingRow({ id: "c0000000-0000-4000-8000-000000000002", submission_id: "d0000000-0000-4000-8000-000000000002", starts_at: "2030-06-03T09:00:00.000Z", ends_at: "2030-06-03T09:30:00.000Z", hold_until: "2030-06-03T09:40:00.000Z" })]
  db.tables.form_submissions = [{ id: "d0000000-0000-4000-8000-000000000001", owner_id: OWNER, contact_name: "Mara", contact_email: "mara@example.com", contact_phone: null, answers: [{ field_id: "goal", label: "Goal", type: "text", value: "Launch" }], form_title: "Call" }]
  return db
}
const NOW = Date.parse("2030-06-01T00:00:00Z")

check("another creator's booking id is not found: read, move and cancel all name the owner", async () => {
  const db = world()
  assert.equal(await readOwnedBooking(db, OTHER, "c0000000-0000-4000-8000-000000000001"), null)
  const moved = await moveBooking(db, { ownerId: OTHER, bookingId: "c0000000-0000-4000-8000-000000000001", start: "2030-06-03T12:00:00.000Z", by: "owner", nowMs: NOW })
  const cancelled = await cancelBooking(db, { ownerId: OTHER, bookingId: "c0000000-0000-4000-8000-000000000001", by: "owner", nowMs: NOW })
  assert.equal(moved.ok, false)
  assert.equal(cancelled.ok, false)
  assert.equal((moved as { status: number }).status, 404)
  assert.equal(db.writes.length, 0, "nothing was written")
})

check("a move onto another booking's time (or its buffer) is refused before the database is asked", async () => {
  const db = world()
  const r = await moveBooking(db, { ownerId: OWNER, bookingId: "c0000000-0000-4000-8000-000000000001", start: "2030-06-03T09:30:00.000Z", by: "owner", nowMs: NOW })
  assert.equal(r.ok, false)
  assert.equal((r as { taken?: boolean }).taken, true)
  assert.equal(db.writes.length, 0)
})

check("a move to a free time writes the new time, the old start named so two moves cannot both land", async () => {
  const db = world()
  const r = await moveBooking(db, { ownerId: OWNER, bookingId: "c0000000-0000-4000-8000-000000000001", start: "2030-06-03T12:00:00.000Z", by: "owner", nowMs: NOW })
  assert.equal(r.ok, true)
  const row = db.tables.form_bookings[0]
  assert.equal(row.starts_at, "2030-06-03T12:00:00.000Z")
  assert.equal(row.hold_until, "2030-06-03T12:40:00.000Z")
  assert.equal(row.reschedule_count, 1)
  /* Its own old time is not in its way: moving 30 minutes later, overlapping itself, is fine. */
  const db2 = world()
  db2.tables.form_bookings.pop()
  assert.equal((await moveBooking(db2, { ownerId: OWNER, bookingId: "c0000000-0000-4000-8000-000000000001", start: "2030-06-03T08:40:00.000Z", by: "owner", nowMs: NOW })).ok, true)
})

check("the database's own refusal (23P01, someone was quicker) is a 409 with 'taken'", async () => {
  const db = world()
  db.failNext["form_bookings:update"] = { code: "23P01", message: "conflicting key value violates exclusion constraint" }
  const r = await moveBooking(db, { ownerId: OWNER, bookingId: "c0000000-0000-4000-8000-000000000001", start: "2030-06-03T12:00:00.000Z", by: "visitor", nowMs: NOW })
  assert.deepEqual([r.ok, (r as { status: number }).status, (r as { taken?: boolean }).taken], [false, 409, true])
})

check("a visitor cannot move or cancel a booking that has started; a cancelled one cannot be moved", async () => {
  const db = world()
  const late = Date.parse("2030-06-03T08:10:00Z")
  assert.equal((await moveBooking(db, { ownerId: OWNER, bookingId: "c0000000-0000-4000-8000-000000000001", start: "2030-06-04T12:00:00.000Z", by: "visitor", nowMs: late })).ok, false)
  assert.equal((await cancelBooking(db, { ownerId: OWNER, bookingId: "c0000000-0000-4000-8000-000000000001", by: "visitor", nowMs: late })).ok, false)
  assert.equal((await cancelBooking(db, { ownerId: OWNER, bookingId: "c0000000-0000-4000-8000-000000000001", by: "owner", reason: "Ill\u0000 today", nowMs: NOW })).ok, true)
  assert.equal(db.tables.form_bookings[0].cancel_reason, "Ill  today")
  assert.equal(db.tables.form_bookings[0].cancelled_by, "owner")
  assert.equal((await moveBooking(db, { ownerId: OWNER, bookingId: "c0000000-0000-4000-8000-000000000001", start: "2030-06-04T12:00:00.000Z", by: "owner", nowMs: NOW })).ok, false)
})

check("busy times are every active booking of the owner; the daily count is this form's alone", async () => {
  const db = world()
  db.tables.form_bookings.push(bookingRow({ id: "c0000000-0000-4000-8000-000000000003", form_id: "f0000000-0000-4000-8000-0000000000ff", starts_at: "2030-06-03T14:00:00.000Z", ends_at: "2030-06-03T14:30:00.000Z", hold_until: "2030-06-03T14:30:00.000Z" }))
  db.tables.form_bookings.push(bookingRow({ id: "c0000000-0000-4000-8000-000000000004", status: "cancelled", starts_at: "2030-06-03T15:00:00.000Z", ends_at: "2030-06-03T15:30:00.000Z", hold_until: "2030-06-03T15:30:00.000Z" }))
  const r = await readBusy(db, { ownerId: OWNER, formId: FORM, settings: { timezone: "Europe/London", buffer: 0, max_per_day: 5 }, fromMs: Date.parse("2030-06-03T00:00:00Z"), toMs: Date.parse("2030-06-04T00:00:00Z"), google: false })
  assert.equal(r.busy.length, 3)
  assert.deepEqual(r.perDay, { "2030-06-03": 2 })
})

check("the submit route asks the capped function, falls back before part 410, and turns 23505, 23P01 and 23514 into 409s", () => {
  const src = read("app/api/forms/[id]/submit/route.ts")
  assert.match(src, /db\.rpc\("native_form_book_capped"/)
  assert.match(src, /isMissingSchema\(error\)\) \(\{ data, error \} = await db\.rpc\("native_form_book", args\)\)/)
  assert.match(src, /error\.code === "23505" \|\| error\.code === "23P01"/)
  assert.match(src, /error\.code === "23514"/)
  assert.match(src, /readBusy\(db, \{ ownerId: form\.owner_id/)
  const sql = read("supabase/sql/run-now/410_bookings_calendar.sql")
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.ok(!/\bdrop table\b|\bdelete from\b|\btruncate\b/i.test(sql), "nothing destructive")
  assert.equal(sql, read("supabase/migrations/20271410_bookings_calendar.sql"))
})

check("every booking route names the signed in owner, and the visitor's routes are rate limited", () => {
  const list = read("app/api/bookings/route.ts")
  assert.match(list, /\.eq\("owner_id", actor\.user\.id\)/)
  const one = read("app/api/bookings/[id]/route.ts")
  assert.match(one, /readOwnedBooking\(actor\.db, actor\.user\.id, id\)/)
  assert.match(one, /ownerId: actor\.user\.id, bookingId: id/)
  assert.ok(!/body\.owner_id|body\.ownerId/.test(one), "the owner never comes from the body")
  const slots = read("app/api/bookings/[id]/slots/route.ts")
  assert.match(slots, /readOwnedBooking\(actor\.db, actor\.user\.id, id\)/)
  const manage = read("app/api/bookings/manage/[token]/route.ts")
  assert.match(manage, /rateLimit\(/)
  assert.match(manage, /readManageToken\(token\)/)
  for (const f of ["app/api/google-calendar/route.ts", "app/api/google-calendar/connect/route.ts", "app/api/google-calendar/callback/route.ts"]) assert.match(read(f), /formActor\(\)/, f)
  assert.match(read("app/api/forms/[id]/slots/route.ts"), /rateLimit\(\{ bucket: "native-form-slots"/)
})

/* ── Fan-out ── */

const fake = () => {
  const sent: { kind: string; to?: string; subject?: string; attachments?: number; key?: string; title?: string }[] = []
  const deps: AnnounceDeps = {
    origin: "https://storelib.com",
    notify: async (n) => void sent.push({ kind: "bell", key: n.dedupeKey, title: n.title }),
    email: async (m) => (sent.push({ kind: "email", to: m.to, subject: m.subject, attachments: m.attachments.length }), { success: true }),
    sync: async (i) => void sent.push({ kind: "calendar", title: i.booking.status }),
    identity: async () => ({ fromName: "Andrew Studio", sellerEmail: "andrew@example.com", replyTo: null }),
    manageUrl: (id) => `https://storelib.com${bookingManagePath(id)}`,
  }
  return { sent, deps }
}
const ctx = (over: Partial<BookingRow> = {}) => ({
  booking: bookingRow(over),
  formTitle: "Intro call",
  settings: validateBooking({ timezone: "Europe/London", weekly: [{ day: 1, start: "09:00", end: "10:00" }] }),
  contact: { name: "Mara", email: "mara@example.com", phone: null },
  answers: [{ field_id: "goal", label: "Goal", type: "text" as const, value: "Launch" }],
})

check("a new confirmed booking: the bell (and so the phone) and the Google event; the emails are retried jobs", async () => {
  const { sent, deps } = fake()
  const out = await announceBooking(deps, ctx(), "new", "visitor")
  assert.deepEqual(sent.map((s) => s.kind), ["bell", "calendar"])
  assert.equal(sent[0].title, "New booking")
  assert.equal(sent[0].key, "booking:new:c0000000-0000-4000-8000-000000000001")
  assert.deepEqual(out, { bell: true, ownerEmail: false, visitorEmail: false, calendar: true })
  assert.equal(pushPriority("system", sent[0].key), "now", "a booking reaches the phone at once")
  assert.equal(pushPriority("system", "followed:x"), "coalesce")
})

check("a new request waiting for the creator: the bell only, no Google event yet", async () => {
  const { sent, deps } = fake()
  await announceBooking(deps, ctx({ status: "pending" }), "new", "visitor")
  assert.deepEqual(sent.map((s) => s.kind), ["bell"])
  assert.equal(sent[0].title, "New booking request")
})

check("moved by the visitor: bell, the creator's email, the visitor's email with a new .ics, the Google event", async () => {
  const { sent, deps } = fake()
  await announceBooking(deps, ctx({ reschedule_count: 2 }), "moved", "visitor", { previousStart: "2030-06-02T08:00:00.000Z" })
  assert.deepEqual(sent.map((s) => s.kind), ["bell", "email", "email", "calendar"])
  assert.equal(sent[0].key, "booking:moved:c0000000-0000-4000-8000-000000000001:2")
  assert.equal(sent[1].to, "andrew@example.com")
  assert.equal(sent[2].to, "mara@example.com")
  assert.equal(sent[2].attachments, 1)
})

check("cancelled by the creator: no bell or email to themselves, the visitor's cancel .ics, the event removed", async () => {
  const { sent, deps } = fake()
  await announceBooking(deps, ctx({ status: "cancelled", cancel_reason: "Away that week" }), "cancelled", "owner")
  assert.deepEqual(sent.map((s) => s.kind), ["email", "calendar"])
  assert.equal(sent[0].to, "mara@example.com")
  assert.match(sent[0].subject!, /^Cancelled: Intro call/)
})

check("one channel failing never stops the others", async () => {
  const { sent, deps } = fake()
  deps.notify = async () => {
    throw new Error("bell down")
  }
  const out = await announceBooking(deps, ctx(), "cancelled", "visitor")
  assert.equal(out.bell, false)
  assert.equal(out.visitorEmail, true)
  assert.equal(out.calendar, true)
  assert.ok(sent.some((s) => s.kind === "calendar"))
})

check("the visitor's emails: confirmed carries the .ics, Add to Google Calendar and the change link; cancelled carries the cancel file", () => {
  const b = { id: "c0000000-0000-4000-8000-000000000001", startsAt: "2030-06-03T08:00:00.000Z", endsAt: "2030-06-03T08:30:00.000Z", visitorTimezone: "America/New_York", ownerTimezone: "Europe/London", location: { kind: "google_meet" as const, meet_url: "https://meet.google.com/abc-defg-hij" }, sequence: 0 }
  const m = visitorBookingMail({ kind: "confirmed", title: "Intro call", booking: b, hostName: "Andrew", visitorEmail: "mara@example.com", manageUrl: "https://storelib.com/booking/x" })
  /* In the visitor's own zone (New York, 04:00), never a raw UTC string: dateStyle with timeZoneName threw and fell back to one before round AR. */
  assert.match(m.subject, /^Confirmed: Intro call, Monday, 3 June 2030 at 04:00 GMT-4$/)
  assert.equal(m.attachments[0].filename, "booking.ics")
  assert.match(new TextDecoder().decode(m.attachments[0].content), /METHOD:PUBLISH/)
  assert.match(m.html, /meet\.google\.com\/abc-defg-hij/)
  assert.match(m.html, /calendar\.google\.com\/calendar\/render/)
  assert.match(m.html, /storelib\.com\/booking\/x/)
  const c = visitorBookingMail({ kind: "cancelled", title: "Intro call", booking: b, hostName: "Andrew", visitorEmail: "mara@example.com", manageUrl: null, by: "owner" })
  assert.match(new TextDecoder().decode(c.attachments[0].content), /METHOD:CANCEL[\s\S]*STATUS:CANCELLED/)
  assert.ok(!/meet\.google\.com/.test(c.html), "a cancelled booking does not show the call link")
  const o = ownerChangeMail({ kind: "moved", title: "Intro call", who: "Mara", booking: b, previousStart: "2030-06-02T08:00:00.000Z", link: "https://storelib.com/app/bookings?booking=x" })
  assert.match(o.text, /Was:/)
  for (const mail of [m, c, o]) assert.ok(!/—|unlock|seamless|effortless|elevate|supercharge/i.test(mail.text), "plain copy")
})

check("the .ics is valid RFC 5545: escaped, folded at 75 octets, one UID, a sequence per move", () => {
  assert.equal(icsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne")
  const long = "DESCRIPTION:" + "é".repeat(80)
  assert.ok(foldLine(long).split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75))
  const ics = bookingIcs({ bookingId: "c0000000-0000-4000-8000-000000000001", title: "Call, with you", startsAt: "2030-06-03T08:00:00.000Z", endsAt: "2030-06-03T08:30:00.000Z", sequence: 3, location: { kind: "phone", value: "+44 20 7946 0000" } }, "2030-06-01T00:00:00.000Z")
  assert.match(ics, /UID:booking-c0000000-0000-4000-8000-000000000001@storelib\.com\r\n/)
  assert.match(ics, /SEQUENCE:3\r\n/)
  assert.match(ics, /DTSTART:20300603T080000Z\r\nDTEND:20300603T083000Z/)
  assert.match(ics, /SUMMARY:Call\\, with you/)
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"))
  assert.match(googleAddUrl({ bookingId: "x", title: "Call", startsAt: "2030-06-03T08:00:00.000Z", endsAt: "2030-06-03T08:30:00.000Z" }), /dates=20300603T080000Z%2F20300603T083000Z/)
  assert.equal(locationWords({ kind: "phone" })?.text, "You will be called on the number you gave.")
})

/* ── Google Calendar, replayed ── */

const config = { clientId: "client-id.apps.googleusercontent.com", clientSecret: "test-secret" }

check("no Google env: not set up, and nothing is asked", async () => {
  const before = { id: process.env.GOOGLE_CALENDAR_CLIENT_ID, secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET }
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  assert.equal(googleCalendarConfig(), null)
  const db = new FakeDb()
  const { fetch, calls } = replay([])
  assert.deepEqual(await googleBusy(db, OWNER, 0, D, 0, fetch), [])
  assert.deepEqual(await syncBookingEvent(db, { ownerId: OWNER, booking: { id: "x", status: "confirmed", google_event_id: null, google_calendar_id: null }, event: eventFor(ctx(), "https://storelib.com") }, fetch), { kind: "skipped" })
  assert.equal(calls.length, 0)
  if (before.id) process.env.GOOGLE_CALENDAR_CLIENT_ID = before.id
  if (before.secret) process.env.GOOGLE_CALENDAR_CLIENT_SECRET = before.secret
  assert.equal(googleCalendarConfig({ GOOGLE_CALENDAR_CLIENT_ID: "a", GOOGLE_CALENDAR_CLIENT_SECRET: "b" })?.clientId, "a")
})

check("the consent address asks for offline calendar access with a signed state; the state is refused for anyone else, another browser or late", () => {
  const { state, nonce } = makeState(OWNER, 1_000)
  const url = new URL(consentUrl(config, "https://storelib.com/api/google-calendar/callback", state))
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth")
  assert.equal(url.searchParams.get("access_type"), "offline")
  assert.equal(url.searchParams.get("prompt"), "consent")
  assert.match(url.searchParams.get("scope")!, /calendar\.events/)
  assert.equal(readState(state, nonce, OWNER, 2_000), true)
  assert.equal(readState(state, nonce, OTHER, 2_000), false)
  assert.equal(readState(state, "other-nonce", OWNER, 2_000), false)
  assert.equal(readState(state, nonce, OWNER, 1_000 + 11 * 60_000), false)
  assert.equal(readState(state.replace(/.$/, (c) => (c === "A" ? "B" : "A")), nonce, OWNER, 2_000), false)
})

check("the code is traded for tokens; the address comes from the id token", async () => {
  const { fetch, calls } = replay([{ match: /oauth2\.googleapis\.com\/token/, method: "POST", answer: "token_exchange" }])
  const t = await exchangeCode(fetch, config, "4/code", "https://storelib.com/api/google-calendar/callback", 0)
  assert.equal(t.refreshToken, "1//test-refresh-token")
  assert.equal(t.email, "creator@example.com")
  assert.equal(t.expiresAt, 3_599_000)
  assert.match(calls[0].body, /grant_type=authorization_code/)
  assert.match(calls[0].body, /client_secret=test-secret/)
  assert.equal(emailOfIdToken("not.a.token"), null)
})

check("a revoked grant asks the creator to connect again", async () => {
  const { fetch } = replay([{ match: /token/, answer: "token_revoked" }])
  await assert.rejects(refreshAccess(fetch, config, "1//old", 0), (e: unknown) => e instanceof GoogleCalendarError && e.reconnect === true)
})

check("calendars are listed primary first, with which can take new bookings", async () => {
  const { fetch } = replay([{ match: /calendarList/, answer: "calendar_list" }])
  const list = await listCalendars(fetch, "ya29.x")
  assert.deepEqual(list.map((c) => [c.id, c.primary, c.canWrite]), [["creator@example.com", true, true], ["team@group.calendar.google.com", false, false]])
})

check("freeBusy busy times block slots, a calendar Google could not read adds none", async () => {
  const { fetch, calls } = replay([{ match: /freeBusy/, method: "POST", answer: "free_busy" }])
  const busy = await freeBusy(fetch, "ya29.x", ["creator@example.com", "team@group.calendar.google.com"], Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-06-02T00:00:00Z"))
  assert.deepEqual(busy, [{ start: Date.parse("2026-06-01T10:00:00Z"), end: Date.parse("2026-06-01T11:00:00Z") }])
  assert.deepEqual(JSON.parse(calls[0].body).items, [{ id: "creator@example.com" }, { id: "team@group.calendar.google.com" }])
  const slots = generateSlots({ ...london, timezone: "UTC", weekly: [{ day: 1, start: "09:00", end: "12:00" }] }, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-02T00:00:00Z"), nowMs: Date.parse("2026-05-01T00:00:00Z"), busy })
  assert.deepEqual(slots.map((s) => s.start.slice(11, 16)), ["09:00", "11:00"])
})

check("a stored connection: a stale access token is refreshed and resealed; busy times come back padded by the buffer", async () => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = config.clientId
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = config.clientSecret
  const db = new FakeDb()
  db.tables.google_calendar_connections = [{ owner_id: OWNER, google_email: "creator@example.com", refresh_token_sealed: sealSecret("1//test-refresh-token"), access_token_sealed: sealSecret("ya29.old"), access_expires_at: "2000-01-01T00:00:00.000Z", busy_calendar_ids: ["creator@example.com"], write_calendar_id: "primary", status: "connected", last_error: null, updated_at: "" }]
  const { fetch, calls } = replay([
    { match: /oauth2\.googleapis\.com\/token/, answer: "token_refresh" },
    { match: /freeBusy/, answer: "free_busy" },
  ])
  const busy = await googleBusy(db, OWNER, Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-06-02T00:00:00Z"), 15, fetch)
  assert.deepEqual(busy, [{ start: Date.parse("2026-06-01T09:45:00Z"), end: Date.parse("2026-06-01T11:15:00Z") }])
  assert.match(calls[0].body, /grant_type=refresh_token/)
  assert.ok(!JSON.stringify(db.tables.google_calendar_connections).includes("ya29.test-access-2"), "the new access token is stored sealed")
  assert.deepEqual(await googleBusy(db, OTHER, 0, D, 0, fetch), [], "another creator has no connection")
})

check("a revoked connection is marked to connect again and adds no busy times", async () => {
  const db = new FakeDb()
  const row: ConnectionRow = { owner_id: OWNER, google_email: null, refresh_token_sealed: sealSecret("1//old"), access_token_sealed: null, access_expires_at: null, busy_calendar_ids: ["primary"], write_calendar_id: "primary", status: "connected", last_error: null, updated_at: "" }
  db.tables.google_calendar_connections = [row as never]
  const { fetch } = replay([{ match: /token/, answer: "token_revoked" }])
  assert.equal(await accessToken(db, row, fetch), null)
  assert.equal(db.tables.google_calendar_connections[0].status, "needs_reconnect")
})

check("a confirmed booking is written with a Meet, moved by PATCH, and removed when cancelled (410 is fine)", async () => {
  const db = new FakeDb()
  db.tables.google_calendar_connections = [{ owner_id: OWNER, google_email: "creator@example.com", refresh_token_sealed: sealSecret("1//r"), access_token_sealed: sealSecret("ya29.live"), access_expires_at: "2999-01-01T00:00:00.000Z", busy_calendar_ids: ["primary"], write_calendar_id: "creator@example.com", status: "connected", last_error: null, updated_at: "" }]
  db.tables.form_bookings = [{ ...bookingRow(), location: { kind: "google_meet" } }]
  const c = ctx({ location: { kind: "google_meet" } })
  const insert = replay([{ match: /calendars\/creator%40example\.com\/events\?conferenceDataVersion=1&sendUpdates=none$/, method: "POST", answer: "event_insert_meet" }])
  const w = await syncBookingEvent(db, { ownerId: OWNER, booking: { id: c.booking.id, status: "confirmed", google_event_id: null, google_calendar_id: null }, event: eventFor(c, "https://storelib.com") }, insert.fetch)
  assert.equal(w.kind, "written")
  const sentBody = JSON.parse(insert.calls[0].body)
  assert.equal(sentBody.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet")
  assert.equal(sentBody.attendees[0].email, "mara@example.com")
  assert.match(sentBody.description, /Goal: Launch/)
  assert.equal(insert.calls[0].url.includes("ya29"), false, "the token is a header, never in the address")
  assert.equal(db.tables.form_bookings[0].google_event_id, "evt123abc")
  assert.equal(db.tables.form_bookings[0].location.meet_url, "https://meet.google.com/abc-defg-hij")

  const patch = replay([{ match: /events\/evt123abc/, method: "PATCH", answer: "event_patch" }])
  assert.equal((await syncBookingEvent(db, { ownerId: OWNER, booking: { id: c.booking.id, status: "confirmed", google_event_id: "evt123abc", google_calendar_id: "creator@example.com" }, event: { ...eventFor(c, "https://storelib.com"), startsAt: "2030-06-04T08:00:00.000Z", endsAt: "2030-06-04T08:30:00.000Z" } }, patch.fetch)).kind, "written")
  assert.deepEqual(JSON.parse(patch.calls[0].body).start, { dateTime: "2030-06-04T08:00:00.000Z", timeZone: "Europe/London" })

  const gone = replay([{ match: /events\/evt123abc/, method: "DELETE", answer: "event_gone" }])
  assert.equal((await syncBookingEvent(db, { ownerId: OWNER, booking: { id: c.booking.id, status: "cancelled", google_event_id: "evt123abc", google_calendar_id: "creator@example.com" }, event: eventFor(c, "https://storelib.com") }, gone.fetch)).kind, "deleted")
  assert.equal(db.tables.form_bookings[0].google_event_id, null)
  const del = replay([{ match: /events\/e1/, method: "DELETE", answer: "event_delete" }])
  await deleteEvent(del.fetch, "t", "primary", "e1")
  const bad = replay([{ match: /events/, answer: "unauthorized" }])
  await assert.rejects(moveEvent(bad.fetch, "t", "primary", "e1", { startsAt: "x", endsAt: "y", timeZone: "UTC" }), (e: unknown) => e instanceof GoogleCalendarError && e.reconnect)
  await assert.rejects(insertEvent(bad.fetch, "t", "primary", eventFor(c, "o")))
})

check("Google failing never stops a booking: the sync reports it and the slots fall back to Storelib's own", async () => {
  const db = new FakeDb()
  db.tables.google_calendar_connections = [{ owner_id: OWNER, google_email: null, refresh_token_sealed: sealSecret("1//r"), access_token_sealed: sealSecret("ya29.live"), access_expires_at: "2999-01-01T00:00:00.000Z", busy_calendar_ids: ["primary"], write_calendar_id: "primary", status: "connected", last_error: null, updated_at: "" }]
  const down: Fetch = async () => {
    throw new Error("network down")
  }
  assert.deepEqual(await googleBusy(db, OWNER, 0, D, 0, down), [])
  const r = await syncBookingEvent(db, { ownerId: OWNER, booking: { id: "x", status: "confirmed", google_event_id: null, google_calendar_id: null }, event: eventFor(ctx(), "o") }, down)
  assert.equal(r.kind, "failed")
})

/* ── Signed links ── */

check("the change-or-cancel link: signed, tamper-proof, never a payment token", () => {
  const id = "c0000000-0000-4000-8000-000000000001"
  const token = bookingManageToken(id)
  assert.equal(readManageToken(token), id)
  assert.equal(readManageToken(token.replace("c0000000", "c0000001")), null, "another id fails the signature")
  assert.equal(readManageToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")), null)
  assert.equal(readManageToken(bookingCheckoutToken(id, "a5000000-0000-4000-8000-0000000000aa")), null)
  assert.equal(readManageToken(`${id}.${"x".repeat(27)}`), null)
  assert.equal(readManageToken(42), null)
  assert.equal(bookingManagePath(id), `/booking/${token}`)
  const key = process.env.COMMERCE_SECRETS_KEY
  process.env.COMMERCE_SECRETS_KEY = "another-deployment"
  assert.equal(readManageToken(token), null, "a link made with another key is refused")
  process.env.COMMERCE_SECRETS_KEY = key
})

check("the visitor's page is a 404 for a bad token, never indexed; booking and bookings are reserved", () => {
  const page = read("app/(storelib)/booking/[token]/page.tsx")
  assert.match(page, /if \(!valid\) notFound\(\)/)
  assert.match(page, /index: false/)
  assert.match(read("proxy.ts"), /"blog", "booking", "c",/)
  assert.match(read("lib/reserved-words.ts"), /"booking",\n  "bookings",/)
})

/* ── The booking sheet and the editor, as written ── */

check("the booking sheet: a month with open and closed dates, then times; Back is internal state, never history", () => {
  const picker = read("components/forms/booking-picker.tsx")
  assert.match(picker, /data-booking-view="day"/)
  assert.match(picker, /data-booking-view="time"/)
  assert.match(picker, /disabled=\{!open\}/)
  assert.ok(!/history\.(push|replace)State|router\.(push|replace)|location\.(href|assign)/.test(picker), "no address change")
  const form = read("components/forms/public-form.tsx")
  assert.match(form, /duration: minutes/)
  assert.match(form, /setSlotDay/)
  const editor = read("components/forms/forms-manager.tsx")
  for (const mark of ["data-booking-lengths", "data-booking-dates", "data-booking-where", "Badge (optional)", "Most per day"]) assert.ok(editor.includes(mark), mark)
  assert.ok(!editor.includes("Payment does not confirm the booking by itself"), "the old, wrong payment hint is gone")
})

;(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn()
      passed++
      console.log("ok -", name)
    } catch (e) {
      failures.push(name)
      console.log("FAIL -", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n    ") : e)
    }
  }
  console.log(`\nonepage-bookings-ar2: ${passed} passed, ${failures.length} failed`)
  if (failures.length) process.exit(1)
})()
