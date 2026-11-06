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
  writes = []
globalThis.afterWork = []
globalThis.notified = []
globalThis.formAuth = { kind: "anonymous" }
globalThis.formDb = {
  from(table) {
    let op = "read",
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
              return resolve({ data: [], error: null })
            }
          return (...args) => {
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
    { website: "spam" },
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
        request({ ...valid, padding: "x".repeat(70000) }),
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
  console.log(
    "Native form routes passed: owner auth, private draft isolation, CORS, consent, antispam, strict answers, outage, idempotent retries, notifications and encoded completion",
  )
} finally {
  for (const k of ["formDb", "formAuth", "afterWork", "notified", "blocked"])
    delete globalThis[k]
}
