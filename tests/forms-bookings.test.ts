/**
 * Appointment slots across daylight saving changes, and the double booking
 * guard: the SQL constraint is in the migration and the submit route turns
 * a conflict into a plain 409.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { generateSlots, slotOffered, zonedInstant } from "../lib/forms/slots"
import { validateBooking, validateDefinition } from "../lib/forms/definition"
import { formTemplate } from "../lib/forms/templates"

let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed++
  console.log("ok -", name)
}

const london = {
  duration: 60,
  buffer: 0,
  timezone: "Europe/London",
  weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "11:00" })),
  notice_hours: 0,
  days_ahead: 365,
}
const iso = (s: string) => new Date(s).toISOString()

check("09:00 London is 09:00Z before the spring change and 08:00Z after it", () => {
  const slots = generateSlots(london, { fromMs: Date.parse("2026-03-28T00:00:00Z"), toMs: Date.parse("2026-03-30T00:00:00Z"), nowMs: Date.parse("2026-03-01T00:00:00Z") })
  assert.deepEqual(
    slots.map((s) => s.start),
    [iso("2026-03-28T09:00:00Z"), iso("2026-03-28T10:00:00Z"), iso("2026-03-29T08:00:00Z"), iso("2026-03-29T09:00:00Z")],
  )
})

check("09:00 New York moves from 14:00Z to 13:00Z across the March change", () => {
  assert.equal(new Date(zonedInstant("America/New_York", 2026, 3, 7, 9, 0)!).toISOString(), iso("2026-03-07T14:00:00Z"))
  assert.equal(new Date(zonedInstant("America/New_York", 2026, 3, 8, 9, 0)!).toISOString(), iso("2026-03-08T13:00:00Z"))
})

check("a wall time the clocks skip is not offered, a repeated one takes the first", () => {
  assert.equal(zonedInstant("Europe/London", 2026, 3, 29, 1, 30), null)
  assert.equal(new Date(zonedInstant("Europe/London", 2026, 10, 25, 1, 30)!).toISOString(), iso("2026-10-25T00:30:00Z"))
  const night = { ...london, weekly: [{ day: 0, start: "01:00", end: "03:00" }] }
  const slots = generateSlots(night, { fromMs: Date.parse("2026-03-29T00:00:00Z"), toMs: Date.parse("2026-03-30T00:00:00Z"), nowMs: Date.parse("2026-03-01T00:00:00Z") })
  /* 01:00 does not exist that night; 02:00 local is 01:00Z. */
  assert.deepEqual(slots.map((s) => s.start), [iso("2026-03-29T01:00:00Z")])
  /* A 60 minute slot over the change still lasts 60 real minutes. */
  assert.equal(Date.parse(slots[0].end) - Date.parse(slots[0].start), 3_600_000)
})

check("the autumn change keeps 09:00 local in Sydney's April change too", () => {
  const sydney = { ...london, timezone: "Australia/Sydney", weekly: [{ day: 0, start: "09:00", end: "10:00" }] }
  const slots = generateSlots(sydney, { fromMs: Date.parse("2026-03-28T00:00:00Z"), toMs: Date.parse("2026-04-13T00:00:00Z"), nowMs: Date.parse("2026-03-01T00:00:00Z") })
  /* Sunday 29 March is AEDT (+11), Sunday 5 April is the change day (AEST +10), 12 April AEST. */
  assert.deepEqual(slots.map((s) => s.start), [iso("2026-03-28T22:00:00Z"), iso("2026-04-04T23:00:00Z"), iso("2026-04-11T23:00:00Z")])
})

check("notice, horizon, buffer and busy intervals are honoured", () => {
  const now = Date.parse("2026-06-01T08:30:00Z") // 09:30 London
  const s = { ...london, duration: 30, buffer: 15, notice_hours: 1 }
  const day = generateSlots(s, { fromMs: Date.parse("2026-06-01T00:00:00Z"), toMs: Date.parse("2026-06-02T00:00:00Z"), nowMs: now })
  /* 09:00, 09:45, 10:30 local; 09:00 and 09:45 fall inside the hour's notice. */
  assert.deepEqual(day.map((x) => x.start), [iso("2026-06-01T09:30:00Z")])
  const busy = [{ start: Date.parse("2026-06-02T08:40:00Z"), end: Date.parse("2026-06-02T08:50:00Z") }]
  const next = generateSlots(s, { fromMs: Date.parse("2026-06-02T00:00:00Z"), toMs: Date.parse("2026-06-03T00:00:00Z"), nowMs: now, busy })
  /* 09:45 local is 08:45Z and overlaps; 09:00 local + 30 min + 15 buffer reaches 08:45Z and also overlaps. */
  assert.deepEqual(next.map((x) => x.start), [iso("2026-06-02T09:30:00Z")])
  const far = generateSlots({ ...s, days_ahead: 1 }, { fromMs: now, toMs: now + 10 * 86_400_000, nowMs: now })
  assert.ok(far.every((x) => Date.parse(x.start) <= now + 86_400_000))
})

check("the submit check accepts an offered slot only, exactly", () => {
  const now = Date.parse("2026-03-01T00:00:00Z")
  assert.ok(slotOffered(london, iso("2026-03-29T08:00:00Z"), now))
  assert.equal(slotOffered(london, iso("2026-03-29T08:15:00Z"), now), null)
  assert.equal(slotOffered(london, "2026-03-29T08:00:00Z", now), null)
  assert.equal(slotOffered(london, iso("2026-03-29T08:00:00Z"), now, [{ start: Date.parse("2026-03-29T08:30:00Z"), end: Date.parse("2026-03-29T09:00:00Z") }]), null)
})

check("booking settings are validated", () => {
  assert.throws(() => validateBooking({ ...london, timezone: "Mars/Olympus" }))
  assert.throws(() => validateBooking({ ...london, weekly: [{ day: 1, start: "10:00", end: "09:00" }] }))
  assert.throws(() => validateBooking({ ...london, weekly: [{ day: 9, start: "09:00", end: "10:00" }] }))
  assert.throws(() => validateBooking({ ...london, payment_product_id: "not-a-uuid" }))
  const def = validateDefinition(formTemplate("appointment"))
  assert.equal(def.booking?.approval, true)
  assert.equal(def.booking?.duration, 30)
})

check("the migration holds the double booking guard: a unique slot per owner and a no-overlap constraint", () => {
  const sql = readFileSync("supabase/migrations/20271130_forms_bookings.sql", "utf8")
  assert.match(sql, /create table if not exists public\.form_bookings/)
  assert.match(sql, /create unique index if not exists form_bookings_owner_slot[\s\S]*?on public\.form_bookings\s*\(owner_id,\s*starts_at\)\s*where status in \('pending',\s*'confirmed'\)/)
  assert.match(sql, /exclude using gist\s*\(owner_id with =,\s*tstzrange\(starts_at,\s*hold_until\) with &&\)/)
  assert.match(sql, /create or replace function public\.native_form_book/)
  /* One function, one transaction: the response and the booking are kept together or not at all. */
  assert.match(sql, /insert into public\.form_submissions[\s\S]*insert into public\.form_bookings/)
  assert.equal(readFileSync("supabase/sql/run-now/375_forms_bookings.sql", "utf8"), sql)
})

check("the submit route turns a slot conflict into a 409 and offers new times", () => {
  const route = readFileSync("app/api/forms/[id]/submit/route.ts", "utf8")
  assert.match(route, /native_form_book/)
  assert.match(route, /23P01/)
  assert.match(route, /slotOffered\(/)
  assert.match(route, /slot_taken: true \}, 409\)/)
})

console.log(`forms-bookings: ${passed} passed`)
