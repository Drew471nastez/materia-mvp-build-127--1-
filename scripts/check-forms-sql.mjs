/**
 * SQL parts 372 and 375 on a real Postgres (16), as Supabase runs them:
 *
 *   FORMS_PG_HOST=127.0.0.1 FORMS_PG_PORT=5499 node scripts/check-forms-sql.mjs
 *
 * A fresh database gets tests/fixtures/forms-supabase.sql (roles, auth.uid,
 * storage.buckets), part 372, then part 375 twice (it must be safe to run
 * again). Then, as each role would through PostgREST:
 *
 *   - an owner reads only their own forms, leads, bookings and uploads, and
 *     another owner's ids return nothing;
 *   - an owner can change a lead's status and notes, never its answers or
 *     consent, and cannot insert a lead or a booking;
 *   - anon reads and writes nothing, and cannot call native_form_book;
 *   - native_form_book keeps a response and its booking together; the same
 *     submission token returns the first; the same start twice is refused
 *     (23505), an overlapping booking is refused (23P01) and the response
 *     is not kept either; a declined booking frees its time.
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
const DB = "ak5_forms_check"
const psql = (db, args) => execFileSync(PSQL, [...base, "-d", db, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
const A = "a5000000-0000-4000-8000-00000000000a"
const B = "b5000000-0000-4000-8000-00000000000b"
const FA = "a5000000-0000-4000-8000-0000000000f1"
const FB = "b5000000-0000-4000-8000-0000000000f2"

/** One statement as a role (and a signed-in user), in its own transaction. */
const as = (role, sub, sql) => psql(DB, ["-tA", "-c", `begin; set local role ${role}; set local "request.jwt.claim.sub" = '${sub || ""}'; ${sql}; commit;`]).trim()
const fails = (role, sub, sql) => {
  try {
    as(role, sub, sql)
    return null
  } catch (e) {
    return String(e.stderr || e.message).match(/ERROR:\s+([0-9A-Z]{5})/)?.[1] || "error"
  }
}
const sub = (owner, form, key, slotNote = "") =>
  `'${JSON.stringify({ owner_id: owner, form_id: form, form_revision: 1, form_title: "Call" + slotNote, answers: [{ field_id: "email", label: "Email", value: "v@example.com", type: "email" }], contact_email: "v@example.com", score: 0, consent: { accepted: true, text: "ok" }, source_kind: "onepage", dedupe_key: key })}'::jsonb`
const book = (owner, form, key, start, minutes = 30, hold = 10) =>
  `select submission_id, duplicate from public.native_form_book(${sub(owner, form, key)}, '${start}'::timestamptz, '${start}'::timestamptz + interval '${minutes} minutes', '${start}'::timestamptz + interval '${minutes + hold} minutes', 'Europe/London', 'pending')`

let passed = 0
const ok = (name) => (passed++, console.log("ok -", name))

psql("postgres", ["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`])
try {
  for (const f of ["tests/fixtures/forms-supabase.sql", "supabase/sql/run-now/372_native_forms_leads.sql", "supabase/sql/run-now/375_forms_bookings.sql", "supabase/sql/run-now/375_forms_bookings.sql"]) psql(DB, ["-f", f])
  ok("parts 372 and 375 run, and 375 runs a second time without error")
  assert.equal(psql(DB, ["-tA", "-c", "select count(*) from pg_constraint where conname = 'form_bookings_no_overlap'"]).trim(), "1")
  assert.equal(psql(DB, ["-tA", "-c", "select count(*) from pg_indexes where indexname = 'form_bookings_owner_slot'"]).trim(), "1")
  assert.equal(psql(DB, ["-tA", "-c", "select public from storage.buckets where id = 'form-uploads'"]).trim(), "f")
  ok("the no-overlap constraint, the one-start index and the private bucket exist")

  psql(DB, ["-c", `insert into public.native_forms (id, owner_id, title, draft, published, status, revision) values ('${FA}', '${A}', 'A', '{}', '{}', 'published', 1), ('${FB}', '${B}', 'B', '{}', '{}', 'published', 1)`])

  /* Bookings through the server's function. */
  const first = as("service_role", "", book(A, FA, "11111111-1111-4111-8111-111111111111", "2026-06-01T09:00:00Z"))
  assert.match(first, /\|f$/)
  const again = as("service_role", "", book(A, FA, "11111111-1111-4111-8111-111111111111", "2026-06-01T09:00:00Z"))
  assert.equal(again, first.replace(/f$/, "t"))
  ok("a response and its booking are kept together; the same token returns the first, marked duplicate")
  assert.equal(fails("service_role", "", book(A, FA, "22222222-2222-4222-8222-222222222222", "2026-06-01T09:00:00Z")), "23505")
  assert.equal(fails("service_role", "", book(A, FA, "33333333-3333-4333-8333-333333333333", "2026-06-01T09:20:00Z")), "23P01")
  assert.equal(fails("service_role", "", book(A, FA, "44444444-4444-4444-8444-444444444444", "2026-06-01T09:35:00Z")), "23P01", "the buffer after a booking is held too")
  assert.equal(psql(DB, ["-tA", "-c", `select count(*) from public.form_submissions where dedupe_key in ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444')`]).trim(), "0")
  ok("the same start (23505) and an overlap (23P01) are refused, and their responses are not kept")
  assert.match(as("service_role", "", book(B, FB, "55555555-5555-4555-8555-555555555555", "2026-06-01T09:00:00Z")), /\|f$/)
  assert.match(as("service_role", "", book(A, FA, "66666666-6666-4666-8666-666666666666", "2026-06-01T09:40:00Z")), /\|f$/)
  ok("another owner's calendar is separate, and the first free time after the buffer is accepted")
  assert.equal(fails("service_role", "", `select * from public.native_form_book(${sub(A, FB, "77777777-7777-4777-8777-777777777777")}, now(), now() + interval '30 minutes', now() + interval '30 minutes', null, 'pending')`), "P0002")
  ok("a booking for a form the owner does not own is refused")

  /* Owners, through RLS. */
  assert.equal(as("authenticated", A, "select count(*) from public.form_submissions"), "2")
  assert.equal(as("authenticated", B, "select count(*) from public.form_submissions"), "1")
  assert.equal(as("authenticated", A, `select count(*) from public.form_bookings where form_id = '${FB}'`), "0")
  assert.equal(as("authenticated", A, `select count(*) from public.native_forms where id = '${FB}'`), "0")
  ok("each owner reads only their own forms, leads and bookings; another owner's ids return nothing")
  assert.equal(fails("authenticated", A, `update public.form_submissions set answers = '[]' where owner_id = '${A}'`), "42501")
  assert.equal(fails("authenticated", A, `update public.form_submissions set consent = '{}' where owner_id = '${A}'`), "42501")
  assert.equal(fails("authenticated", A, `update public.form_submissions set owner_id = '${B}'`), "42501")
  assert.equal(as("authenticated", A, `with u as (update public.form_submissions set status = 'contacted', notes = 'Called' returning 1) select count(*) from u`), "2")
  assert.equal(as("authenticated", B, `with u as (update public.form_submissions set notes = 'x' where owner_id = '${A}' returning 1) select count(*) from u`), "0")
  ok("an owner changes status and notes only; answers, consent and ownership cannot be written; another owner's leads are untouched")
  assert.equal(fails("authenticated", A, `insert into public.form_submissions (owner_id, form_id, form_revision, form_title, answers, consent, dedupe_key) values ('${A}', '${FA}', 1, 'x', '[]', '{}', gen_random_uuid())`), "42501")
  assert.equal(fails("authenticated", A, `insert into public.form_bookings (owner_id, form_id, submission_id, starts_at, ends_at, hold_until) select '${A}', '${FA}', id, now(), now() + interval '1 hour', now() + interval '1 hour' from public.form_submissions limit 1`), "42501")
  assert.equal(fails("authenticated", A, `select * from public.native_form_book(${sub(A, FA, "88888888-8888-4888-8888-888888888888")}, now(), now(), now(), null, 'pending')`), "42501")
  ok("an owner cannot insert a lead or a booking, or call the booking function")
  for (const t of ["native_forms", "form_submissions", "form_bookings", "form_uploads", "form_integration_jobs"]) assert.equal(fails("anon", "", `select count(*) from public.${t}`), "42501", t)
  assert.equal(fails("anon", "", `select * from public.native_form_book(${sub(A, FA, "99999999-9999-4999-8999-999999999999")}, now(), now(), now(), null, 'pending')`), "42501")
  ok("anon reads no table and cannot call the booking function")

  /* Deciding frees the time. */
  assert.equal(as("authenticated", A, `with u as (update public.form_bookings set status = 'declined', decided_at = now() where starts_at = '2026-06-01T09:00:00Z' returning 1) select count(*) from u`), "1")
  assert.equal(fails("authenticated", A, `update public.form_bookings set starts_at = now()`), "42501")
  assert.match(as("service_role", "", book(A, FA, "aaaaaaaa-1111-4111-8111-111111111111", "2026-06-01T09:00:00Z")), /\|f$/)
  ok("a declined booking frees its time; an owner cannot move a booking's time")

  /* Jobs: the widened kinds, once per response and kind. */
  const lead = psql(DB, ["-tA", "-c", `select id from public.form_submissions where owner_id = '${A}' limit 1`]).trim()
  psql(DB, ["-c", `insert into public.form_integration_jobs (owner_id, form_id, submission_id, provider, state) values ('${A}', '${FA}', '${lead}', 'owner_email', 'ready')`])
  assert.equal(fails("service_role", "", `insert into public.form_integration_jobs (owner_id, form_id, submission_id, provider, state) values ('${A}', '${FA}', '${lead}', 'owner_email', 'ready')`), "23505")
  assert.equal(fails("service_role", "", `insert into public.form_integration_jobs (owner_id, form_id, submission_id, provider, state) values ('${A}', '${FA}', '${lead}', 'sms', 'ready')`), "23514")
  ok("a response queues each delivery once, and only known kinds")
  assert.equal(fails("service_role", "", `update public.native_forms set retention_days = 3 where id = '${FA}'`), "23514")
  assert.equal(fails("service_role", "", `update public.form_submissions set notes = repeat('x', 5001) where owner_id = '${A}'`), "23514")
  ok("retention and notes are bounded")

  /* A booking paid with a product: held unpaid for 30 minutes, whatever status the route asked for. */
  const state = (key) => `select b.status || '|' || b.payment_status || '|' || coalesce((abs(extract(epoch from (b.payment_due_at - now())) - 1800) < 60)::text, 'none') from public.form_bookings b join public.form_submissions s on s.id = b.submission_id where s.dedupe_key = '${key}'`
  as("service_role", "", `select 1 from public.native_form_book(${sub(A, FA, "cccccccc-1111-4111-8111-111111111111")}, '2026-06-02T09:00:00Z', '2026-06-02T09:30:00Z', '2026-06-02T09:40:00Z', null, 'confirmed', 'a5000000-0000-4000-8000-0000000000aa')`)
  assert.equal(as("service_role", "", state("cccccccc-1111-4111-8111-111111111111")), "pending|unpaid|true")
  as("service_role", "", `select 1 from public.native_form_book(${sub(A, FA, "dddddddd-1111-4111-8111-111111111111")}, '2026-06-03T09:00:00Z', '2026-06-03T09:30:00Z', '2026-06-03T09:40:00Z', null, 'confirmed')`)
  assert.equal(as("service_role", "", state("dddddddd-1111-4111-8111-111111111111")), "confirmed|none|none")
  assert.equal(fails("service_role", "", `update public.form_bookings set payment_status = 'free'`), "23514")
  assert.equal(fails("authenticated", A, `update public.form_bookings set payment_status = 'paid'`), "42501")
  /* The cron's expiry frees the time: the same start can be booked again. */
  psql(DB, ["-c", `update public.form_bookings set status = 'cancelled' where status = 'pending' and payment_status in ('unpaid','failed') and payment_due_at < now() + interval '1 hour'`])
  assert.match(as("service_role", "", book(A, FA, "eeeeeeee-1111-4111-8111-111111111111", "2026-06-02T09:00:00Z")), /\|f$/)
  ok("a paid booking is held unpaid for 30 minutes, only the server sets payment state, and an expired hold frees its time")
  console.log(`check-forms-sql: ${passed} passed`)
} finally {
  psql("postgres", ["-c", `drop database if exists ${DB}`])
}
