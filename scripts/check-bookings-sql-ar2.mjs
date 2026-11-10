/**
 * SQL part 410 (round AR, bookings) on a real Postgres (16), after parts 372
 * and 375, the way scripts/check-forms-sql.mjs runs those:
 *
 *   FORMS_PG_HOST=127.0.0.1 FORMS_PG_PORT=5499 node scripts/check-bookings-sql-ar2.mjs
 *
 * Checks that 410 runs twice without error, and then:
 *   - native_form_book_capped keeps a booking with its length and where it
 *     happens, refuses the same start (23505) and an overlap (23P01) as
 *     native_form_book does, and refuses a booking past the daily limit
 *     (23514) without keeping its response;
 *   - moving a booking onto another's time is refused by the database
 *     (23P01), whatever the route thought;
 *   - google_calendar_connections is the service role's alone: neither a
 *     signed in owner nor anon reads it, even their own row;
 *   - only the service role can call native_form_book_capped.
 * No database is touched but the throwaway one it creates and drops.
 */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"

const PSQL = ["/usr/bin/psql", "/usr/lib/postgresql/16/bin/psql"].find((p) => existsSync(p))
const HOST = process.env.FORMS_PG_HOST
if (!PSQL || !HOST) {
  console.log(`skipped: ${!PSQL ? "no psql here" : "FORMS_PG_HOST is not set"}`)
  process.exit(0)
}
const base = ["-h", HOST, "-p", process.env.FORMS_PG_PORT || "5432", "-U", process.env.FORMS_PG_USER || "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]
const DB = "ar2_bookings_check"
const psql = (db, args) => execFileSync(PSQL, [...base, "-d", db, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
const A = "a5000000-0000-4000-8000-00000000000a"
const B = "b5000000-0000-4000-8000-00000000000b"
const FA = "a5000000-0000-4000-8000-0000000000f1"
const as = (role, sub, sql) => psql(DB, ["-tA", "-c", `begin; set local role ${role}; set local "request.jwt.claim.sub" = '${sub || ""}'; ${sql}; commit;`]).trim()
const fails = (role, sub, sql) => {
  try {
    as(role, sub, sql)
    return null
  } catch (e) {
    return String(e.stderr || e.message).match(/ERROR:\s+([0-9A-Z]{5})/)?.[1] || "error"
  }
}
const sub = (owner, form, key) =>
  `'${JSON.stringify({ owner_id: owner, form_id: form, form_revision: 1, form_title: "Call", answers: [], contact_email: "v@example.com", score: 0, consent: { accepted: true, text: "ok" }, source_kind: "onepage", dedupe_key: key })}'::jsonb`
const capped = (key, start, { minutes = 30, hold = 10, max = 0, day = "2026-06-01" } = {}) =>
  `select submission_id, duplicate from public.native_form_book_capped(${sub(A, FA, key)}, '${start}'::timestamptz, '${start}'::timestamptz + interval '${minutes} minutes', '${start}'::timestamptz + interval '${minutes + hold} minutes', 'Europe/London', 'confirmed', null, ${max}, '${day}T00:00:00+01'::timestamptz, '${day}T00:00:00+01'::timestamptz + interval '1 day', ${minutes}, '{"kind":"video","value":"https://meet.example.com/x"}'::jsonb)`

let passed = 0
const ok = (name) => (passed++, console.log("ok -", name))

psql("postgres", ["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`])
try {
  for (const f of ["tests/fixtures/forms-supabase.sql", "supabase/sql/run-now/372_native_forms_leads.sql", "supabase/sql/run-now/375_forms_bookings.sql", "supabase/sql/run-now/410_bookings_calendar.sql", "supabase/sql/run-now/410_bookings_calendar.sql"])
    psql(DB, ["-f", f])
  ok("parts 372, 375 and 410 run, and 410 runs a second time without error")
  psql(DB, ["-c", `insert into public.native_forms (id, owner_id, title, draft, published, status, revision) values ('${FA}', '${A}', 'A', '{}', '{}', 'published', 1)`])

  assert.match(as("service_role", "", capped("11111111-1111-4111-8111-111111111111", "2026-06-01T09:00:00Z", { max: 2 })), /\|f$/)
  assert.equal(as("service_role", "", `select duration_minutes || '|' || (location->>'kind') from public.form_bookings`), "30|video")
  ok("a capped booking keeps its length and where it happens")
  assert.equal(fails("service_role", "", capped("22222222-2222-4222-8222-222222222222", "2026-06-01T09:00:00Z", { max: 2 })), "23505")
  assert.equal(fails("service_role", "", capped("33333333-3333-4333-8333-333333333333", "2026-06-01T09:20:00Z", { max: 2 })), "23P01")
  ok("the same start (23505) and an overlap (23P01) are refused through the capped function too")
  assert.match(as("service_role", "", capped("44444444-4444-4444-8444-444444444444", "2026-06-01T11:00:00Z", { max: 2 })), /\|f$/)
  assert.equal(fails("service_role", "", capped("55555555-5555-4555-8555-555555555555", "2026-06-01T14:00:00Z", { max: 2 })), "23514")
  assert.equal(psql(DB, ["-tA", "-c", "select count(*) from public.form_submissions where dedupe_key = '55555555-5555-4555-8555-555555555555'"]).trim(), "0")
  assert.match(as("service_role", "", capped("66666666-6666-4666-8666-666666666666", "2026-06-02T14:00:00Z", { max: 2, day: "2026-06-02" })), /\|f$/)
  ok("the daily limit refuses the third booking of a day (23514) and keeps no response; the next day is open")
  assert.match(as("service_role", "", capped("11111111-1111-4111-8111-111111111111", "2026-06-01T09:00:00Z", { max: 2 })), /\|t$/)
  ok("the same submission sent again returns the first, marked duplicate")

  /* A move onto another booking's time: the database refuses it whatever the route thought. */
  assert.equal(fails("service_role", "", `update public.form_bookings set starts_at = '2026-06-01T11:10:00Z', ends_at = '2026-06-01T11:40:00Z', hold_until = '2026-06-01T11:50:00Z' where starts_at = '2026-06-01T09:00:00Z'`), "23P01")
  assert.equal(as("service_role", "", `with u as (update public.form_bookings set starts_at = '2026-06-01T15:00:00Z', ends_at = '2026-06-01T15:30:00Z', hold_until = '2026-06-01T15:40:00Z', reschedule_count = reschedule_count + 1 where starts_at = '2026-06-01T09:00:00Z' returning 1) select count(*) from u`), "1")
  ok("moving onto a held time is refused (23P01); a free one is taken")

  /* Google tokens: the service role only. */
  psql(DB, ["-c", `insert into public.google_calendar_connections (owner_id, refresh_token_sealed) values ('${A}', 'v1.x.y.z')`])
  assert.equal(fails("authenticated", A, "select count(*) from public.google_calendar_connections"), "42501")
  assert.equal(fails("anon", "", "select count(*) from public.google_calendar_connections"), "42501")
  assert.equal(as("service_role", "", "select count(*) from public.google_calendar_connections"), "1")
  assert.equal(as("service_role", "", "select busy_calendar_ids::text || '|' || write_calendar_id from public.google_calendar_connections"), '["primary"]|primary')
  ok("google_calendar_connections is read by the server alone, not by its own owner or anon, and defaults to the primary calendar")
  assert.equal(fails("authenticated", A, capped("77777777-7777-4777-8777-777777777777", "2026-06-03T09:00:00Z")), "42501")
  assert.equal(fails("anon", "", capped("88888888-8888-4888-8888-888888888888", "2026-06-03T09:00:00Z")), "42501")
  assert.equal(fails("authenticated", B, `select count(*) from public.form_bookings where owner_id = '${A}'`) ?? as("authenticated", B, `select count(*) from public.form_bookings where owner_id = '${A}'`), "0")
  ok("only the server can call the capped function; another owner reads none of A's bookings")
  console.log(`check-bookings-sql-ar2: ${passed} passed`)
} finally {
  psql("postgres", ["-c", `drop database if exists ${DB}`])
}
