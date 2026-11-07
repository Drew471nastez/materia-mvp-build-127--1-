/** Exercise actual public/owner routes at the DB/auth boundary. SQL isolation is
 * separately executed by check-native-forms-rls.mjs against Postgres. */
import assert from "node:assert/strict"
import { build } from "esbuild"
const mocks = {
  "server-only": "",
  "next/server": `export class NextResponse extends Response{static json(body,init={}){return new NextResponse(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init.headers}})}};export const after=fn=>globalThis.afterWork.push(fn())`,
  "@/lib/supabase/admin": `export const createAdminClient=()=>globalThis.formDb`,
  "@/lib/supabase/server": `export const createClient=async()=>globalThis.formDb`,
  "@/lib/auth/route-user": `import {NextResponse} from "next/server";export const routeUser=async()=>globalThis.formAuth;export const authUnavailableResponse=()=>new NextResponse('',{status:503})`,
  "@/lib/api/rate-limit": `export const addressSubject=()=>"test-ip";export const rateLimit=async()=>globalThis.blocked?new Response('',{status:429}):null`,
  "@/lib/notifications/user-inbox": `export const notifyUser=async(...args)=>{globalThis.notified.push(args[1]);return 'ok'}`,
  "@/lib/forms/delivery-server": `export const jobsFor=(s)=>s&&s.notify_email===false?[]:[{provider:'owner_email',state:'ready'}];export const queueJobs=async(db,i)=>{globalThis.queued.push(i);return ['job-'+globalThis.queued.length]};export const runFormJobs=async(db,o)=>{globalThis.ran.push(o.ids);return {}}`,
  "@/lib/forms/uploads-server": `export const filesForSubmission=async(db,i)=>i.files.length?{ok:false,error:'Upload your file again.'}:{ok:true,rows:[]}`,
}
const load = async (path) => {
  const b = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "warning",
    plugins: [
      {
        name: "boundaries",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) =>
            Object.hasOwn(mocks, a.path)
              ? { path: a.path, namespace: "mock" }
              : undefined,
          )
          b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            contents: mocks[a.path],
            loader: "js",
          }))
        },
      },
    ],
  })
  return import(
    "data:text/javascript;base64," +
      Buffer.from(b.outputFiles[0].text).toString("base64")
  )
}
const id = "11111111-1111-4111-8111-111111111111",
  nonce = "22222222-2222-4222-8222-222222222222"
const def = {
  title: "Fitness quiz",
  description: "",
  mode: "quiz",
  button_text: "Send",
  consent_text: "Contact me about my request.",
  marketing_opt_in: true,
  fields: [
    { id: "email", type: "email", required: true, label: "Your email" },
    {
      id: "goal",
      type: "single",
      required: true,
      label: "Goal",
      options: [{ id: "fit", label: "Get fit", score: 2 }],
    },
  ],
  completion: {
    message: "Thanks!",
    action: {
      type: "whatsapp",
      phone: "+40 712 345 678",
      message: "New request",
    },
    include_answers: true,
  },
}
let form = {
    id,
    owner_id: "owner",
    status: "published",
    revision: 2,
    published: def,
    draft: { ...def, title: "SECRET DRAFT" },
    integration_settings: { webhook: { prepared: true } },
    updated_at: "version-1",
  },
  lead = null,
  dbError = false,
  filters = [],
  writes = [],
  rpcError = null,
  rpcCalls = [],
  bookings = []
globalThis.afterWork = []
globalThis.notified = []
globalThis.queued = []
globalThis.ran = []
globalThis.formAuth = { kind: "anonymous" }
globalThis.formDb = {
  async rpc(name, args) {
    rpcCalls.push({ name, args })
    if (rpcError) return { data: null, error: rpcError }
    lead = { id: nonce, ...args.p_submission }
    bookings.push({ starts_at: args.p_starts_at, hold_until: args.p_hold_until, status: args.p_status })
    return { data: [{ submission_id: nonce, booking_id: "b1", duplicate: false }], error: null }
  },
  from(table) {
    let op = "read",
      single = false,
      payload = null,
      where = []
    const q = new Proxy(
      {},
      {
        get(_, k) {
          if (k === "then")
            return (resolve) => {
              filters.push({ table, where })
              if (dbError)
                return resolve({ data: null, error: { code: "08006" } })
              if (table === "native_forms") {
                let row =
                  form && where.every(([key, value]) => form[key] === value)
                    ? form
                    : null
                if (op === "update" && row) {
                  writes.push(payload)
                  form = { ...form, ...payload }
                  row = form
                }
                return resolve({ data: row, error: null })
              }
              if (table === "form_submissions" && op === "insert") {
                if (lead)
                  return resolve({ data: null, error: { code: "23505" } })
                writes.push(payload)
                lead = { id: nonce, ...payload }
                return resolve({ data: { id: nonce }, error: null })
              }
              if (table === "form_submissions")
                return resolve({ data: lead, error: null })
              if (table === "form_bookings")
                return resolve(single ? { data: null, error: null } : { data: bookings, error: null })
              return resolve({ data: single ? null : [], error: null })
            }
          return (...args) => {
            if (k === "maybeSingle" || k === "single") single = true
            if (k === "eq") where.push(args)
            if (k === "insert" || k === "update") {
              op = k
              payload = args[0]
            }
            return q
          }
        },
      },
    )
    return q
  },
}
const request = (body, method = "POST") =>
  new Request("https://storelib.com/api/forms/" + id + "/submit", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
const params = { params: Promise.resolve({ id }) },
  valid = {
    revision: 2,
    submission_id: nonce,
    started_at: Date.now() - 5000,
    consent: true,
    marketing: false,
    answers: { email: "jordan@example.com", goal: "fit" },
    source: "onepage",
    source_url: "https://storelib.me/coach?private=secret#hidden",
  }
try {
  const publicRoute = await load("app/api/forms/[id]/public/route.ts"),
    submit = await load("app/api/forms/[id]/submit/route.ts"),
    owner = await load("app/api/forms/[id]/route.ts")
  let r = await publicRoute.GET(
    new Request("https://storelib.com/api/forms/" + id + "/public"),
    params,
  )
  assert.equal(r.status, 200)
  let body = await r.json()
  assert.equal(body.form.definition.title, "Fitness quiz")
  assert.ok(!JSON.stringify(body).includes("SECRET"))
  assert.ok(!JSON.stringify(body).includes("owner"))
  assert.ok(!JSON.stringify(body).includes("webhook"))
  assert.equal(r.headers.get("cache-control"), "no-store")
  assert.equal(r.headers.get("access-control-allow-origin"), "*")
  form.status = "draft"
  assert.equal(
    (await publicRoute.GET(new Request("https://storelib.com"), params)).status,
    404,
  )
  form.status = "published"
  assert.equal(
    (
      await owner.PATCH(
        request({ definition: def, updated_at: form.updated_at }, "PATCH"),
        params,
      )
    ).status,
    401,
  )
  globalThis.formAuth = { kind: "unavailable" }
  assert.equal((await owner.PATCH(request({}, "PATCH"), params)).status, 503)
  globalThis.formAuth = { kind: "user", user: { id: "owner" } }
  assert.equal(
    (
      await owner.PATCH(
        request({ definition: def, updated_at: "stale" }, "PATCH"),
        params,
      )
    ).status,
    409,
  )
  for (const patch of [
    { consent: false },
    { started_at: Date.now() + 1000 },
    { revision: 1 },
    { answers: { email: "invalid", goal: "fit" } },
    { answers: { email: "a@b.com", goal: "forged" } },
  ]) {
    assert.ok(
      (await submit.POST(request({ ...valid, ...patch }), params)).status >=
        400,
    )
    assert.equal(lead, null)
  }
  globalThis.blocked = true
  assert.equal((await submit.POST(request(valid), params)).status, 429)
  globalThis.blocked = false
  dbError = true
  assert.equal((await submit.POST(request(valid), params)).status, 503)
  dbError = false
  r = await submit.POST(request(valid), params)
  assert.equal(r.status, 201)
  body = await r.json()
  assert.equal(lead.owner_id, "owner")
  assert.equal(lead.score, 2)
  assert.equal(lead.source_url, "https://storelib.me/coach")
  assert.equal(lead.consent.marketing, false)
  assert.equal(lead.answers[1].value, "Get fit")
  assert.equal(new URL(body.href).pathname, "/40712345678")
  assert.ok(
    new URL(body.href).searchParams.get("text").includes("Goal: Get fit"),
  )
  await Promise.all(globalThis.afterWork)
  assert.equal(globalThis.notified.length, 1)
  assert.equal((await submit.POST(request(valid), params)).status, 200)
  assert.equal(
    globalThis.notified.length,
    1,
    "Idempotent retry never notifies twice",
  )
  assert.equal(
    (
      await submit.POST(
        request({
          ...valid,
          answers: { email: "different@example.com", goal: "fit" },
        }),
        params,
      )
    ).status,
    409,
  )
  assert.equal(
    (
      await submit.POST(
        request({ ...valid, padding: "x".repeat(100000) }),
        params,
      )
    ).status,
    400,
  )
  assert.ok(
    filters
      .filter((q) => q.table === "native_forms")
      .every((q) => q.where.some(([k, v]) => k === "id" && v === id)),
  )
  assert.equal(globalThis.queued.length, 1, "One response queues its deliveries once")
  assert.deepEqual(globalThis.ran, [["job-1"]])

  /* Round AK5: the honeypot is thanked and nothing is kept. */
  lead = null
  writes.length = 0
  r = await submit.POST(request({ ...valid, submission_id: "33333333-3333-4333-8333-333333333333", website: "http://spam.example" }), params)
  assert.equal(r.status, 201)
  assert.equal(lead, null)
  assert.equal(writes.length, 0)

  /* A hidden question's answer is dropped, a required hidden one is not asked. */
  form.published = {
    ...def,
    mode: "form",
    completion: { kind: "gated", message: "Here it is", gated: { url: "https://files.example.com/guide.pdf", label: "Get the guide" } },
    fields: [
      def.fields[0],
      { id: "kind", type: "single", required: true, label: "Kind", options: [{ id: "biz", label: "Business" }, { id: "me", label: "Personal" }] },
      { id: "company", type: "text", required: true, label: "Company", show_if: [{ field: "kind", op: "is", value: "biz" }] },
    ],
  }
  form.revision = 3
  r = await publicRoute.GET(new Request("https://storelib.com/api/forms/" + id + "/public"), params)
  assert.ok(!JSON.stringify(await r.json()).includes("files.example.com"), "The gated link is not in the public form")
  r = await submit.POST(request({ ...valid, revision: 3, submission_id: "44444444-4444-4444-8444-444444444444", answers: { email: "a@b.co", kind: "me", company: "smuggled" } }), params)
  assert.equal(r.status, 201)
  body = await r.json()
  assert.deepEqual(lead.answers.map((a) => a.field_id), ["email", "kind"])
  assert.equal(body.gated.url, "https://files.example.com/guide.pdf", "The gated link is revealed after the response is kept")
  lead = null
  assert.equal((await submit.POST(request({ ...valid, revision: 3, submission_id: "55555555-5555-4555-8555-555555555555", answers: { email: "a@b.co", kind: "biz" } }), params)).status, 400)
  assert.equal(lead, null)

  /* Bookings: an offered slot is kept with its response in one call; a taken slot is a 409. */
  const slots = await load("lib/forms/slots.ts")
  const booking = { duration: 30, buffer: 10, timezone: "Europe/London", weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "00:00", end: "23:30" })), notice_hours: 0, days_ahead: 30, approval: true }
  form.published = { ...def, mode: "form", completion: { message: "Requested" }, fields: [def.fields[0]], booking }
  form.revision = 4
  const offered = slots.generateSlots(booking, { fromMs: Date.now() + 86_400_000, toMs: Date.now() + 2 * 86_400_000, nowMs: Date.now() })
  const bookingBody = { ...valid, revision: 4, answers: { email: "a@b.co" }, timezone: "America/New_York" }
  assert.equal((await submit.POST(request({ ...bookingBody, submission_id: "66666666-6666-4666-8666-666666666666", slot: "2020-01-01T10:00:00.000Z" }), params)).status, 409, "A time in the past was never offered")
  assert.equal((await submit.POST(request({ ...bookingBody, submission_id: "66666666-6666-4666-8666-666666666666" }), params)).status, 400, "A booking needs a time")
  r = await submit.POST(request({ ...bookingBody, submission_id: "66666666-6666-4666-8666-666666666666", slot: offered[0].start }), params)
  assert.equal(r.status, 201)
  body = await r.json()
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, "native_form_book")
  assert.equal(rpcCalls[0].args.p_status, "pending")
  assert.equal(rpcCalls[0].args.p_submission.owner_id, "owner")
  assert.equal(rpcCalls[0].args.p_visitor_timezone, "America/New_York")
  assert.equal(Date.parse(rpcCalls[0].args.p_hold_until) - Date.parse(rpcCalls[0].args.p_ends_at), 10 * 60_000)
  assert.equal(body.booking.status, "pending")
  lead = null
  /* The slot the first booking holds is no longer offered to a second visitor. */
  r = await submit.POST(request({ ...bookingBody, submission_id: "77777777-7777-4777-8777-777777777777", slot: offered[0].start }), params)
  assert.equal(r.status, 409)
  assert.equal((await r.json()).slot_taken, true)
  assert.equal(rpcCalls.length, 1, "The route refuses before writing")
  /* Two visitors at once: both pass the check, the database refuses the second (exclusion or unique violation). */
  bookings.length = 0
  for (const code of ["23P01", "23505"]) {
    rpcError = { code, message: "conflicting key value violates exclusion constraint" }
    r = await submit.POST(request({ ...bookingBody, submission_id: "88888888-8888-4888-8888-88888888888" + (code === "23505" ? "9" : "8"), slot: offered[1].start }), params)
    assert.equal(r.status, 409, code)
    assert.equal((await r.json()).slot_taken, true)
  }
  rpcError = null
  console.log(
    "Native form routes passed: owner auth, private draft isolation, CORS, consent, antispam, honeypot, strict answers with hidden questions dropped, gated link only after sending, outage, idempotent retries, one queued delivery, notifications, encoded completion, bookings kept in one call and slot conflicts as 409",
  )
} finally {
  for (const k of ["formDb", "formAuth", "afterWork", "notified", "blocked", "queued", "ran"])
    delete globalThis[k]
}
