/**
 * ===========================================================================
 *  ROUND 50: "STORELIB DIDN'T ANSWER", "YOUR WEBSITE DIDN'T LOAD", ON A
 *  CONNECTION THAT WORKS
 * ===========================================================================
 * The owner: random servers not responding across Storelib, the website
 * builder saying "Your website didn't load. Check your connection and try
 * again." with the internet working, saves answered "Storelib didn't answer".
 *
 * A harness, driven through the real code: the real GET /api/website-
 * builder/themes/[installId], GET and PUT .../sections and PUT .../settings
 * route handlers, @supabase/ssr and supabase-js over the real cookies
 * (next/headers held by the suite), lib/auth, lib/team, lib/api/rate-limit,
 * lib/storage/media-url mediaFetch, lib/net/deadline deadlineFetch, the
 * breaker, lib/net/request requestJson, lib/website-builder/load-guard and
 * save-request. Under them a stand-in Supabase that can be slow (1 to 8s),
 * drop a connection, answer 503, 504 or 429, or be slow on its first call.
 *
 * Every scenario prints one line: R50 <name>: <what the person got>. The
 * same file run against the code before this round prints the "before"
 * numbers in the report; the checks below hold for the code after it.
 */
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { forgetSigningKeys } from "@/lib/auth/verify-token"
import { CircuitBreaker } from "@/lib/net/breaker"
import { deadlineFetch } from "@/lib/net/deadline"
import { supabaseRetryBudget } from "@/lib/net/retry-budget"
import { FAIL_COPY, failMessage, requestJson } from "@/lib/net/request"
import { fetchWithin, retrying } from "@/lib/website-builder/load-guard"
import { putJsonWithRetry } from "@/lib/website-builder/save-request"
import { explainSaveProblem } from "@/lib/website-builder/save-problem"
import { LOAD_AUTO_RETRY_MS, explainLoadProblem } from "@/lib/website-builder/load-problem"
import { GET as installGet } from "@/app/api/website-builder/themes/[installId]/route"
import { GET as sectionsGet, PUT as sectionsPut } from "@/app/api/website-builder/themes/[installId]/sections/route"
import { PUT as settingsPut } from "@/app/api/website-builder/themes/[installId]/settings/route"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)?.slice(0, 400)}` : ""}`) }
}
const report = (name: string, line: string) => out(`  R50 ${name}: ${line}`)
console.warn = () => {}
console.error = () => {}
console.info = () => {}

/* ── The stand-in Supabase ─────────────────────────────────────────────── */
const URL_ = "https://abcd.supabase.co"
const SECRET = "test-secret-only-for-this-suite-0123456789abcdef"
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service"
process.env.SUPABASE_JWT_SECRET = SECRET
const nowS = () => Math.floor(Date.now() / 1000)
const b64url = (s: string) => Buffer.from(s).toString("base64url")
const hs256 = (p: Record<string, unknown>) => {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const b = b64url(JSON.stringify(p))
  return `${h}.${b}.${createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url")}`
}
const person = { id: "u1", aud: "authenticated", role: "authenticated", email: "a@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }
const token = hs256({ sub: "u1", aud: "authenticated", role: "authenticated", iss: `${URL_}/auth/v1`, exp: nowS() + 3600, iat: nowS(), email: "a@example.test", session_id: "s1" })
const COOKIE = "sb-abcd-auth-token"
const cookie = "base64-" + Buffer.from(JSON.stringify({ access_token: token, refresh_token: "rt", token_type: "bearer", expires_in: 3600, expires_at: nowS() + 3600, user: person })).toString("base64url")
const INSTALL = "11111111-1111-4111-8111-111111111111"

type Fault = "reset" | "503html" | "504pool" | "429" | null
const world = {
  /** Supabase Auth's answer time for /auth/v1/user, ms. */
  authMs: 40,
  /** PostgREST's answer time for a request, by its number and what it is. */
  restMs: (_n: number, _table: string, _method: string) => 15,
  /** A fault for this request, or null. */
  fault: (_n: number, _table: string, _method: string): Fault => null,
  rest: 0,
  restByTable: new Map<string, number>(),
  pages: [] as { id: string; install_id: string; page_key: string; sections: unknown[]; draft_sections: unknown[] | null }[],
  settings: [] as { id: string; install_id: string; settings: Record<string, unknown>; draft_settings: Record<string, unknown> | null }[],
}
function resetWorld() {
  world.authMs = 40
  world.restMs = () => 15
  world.fault = () => null
  world.rest = 0
  world.restByTable.clear()
  world.pages = ["home", "refund-policy", "privacy-policy", "terms-of-service"].map((k, i) => ({ id: `p${i}`, install_id: INSTALL, page_key: k, sections: [], draft_sections: null }))
  world.settings = [{ id: "s1", install_id: INSTALL, settings: {}, draft_settings: null }]
  supabaseRetryBudget.reset()
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
const later = <T>(ms: number, f: () => T, signal?: AbortSignal | null) =>
  new Promise<T>((res, rej) => {
    const t = setTimeout(() => {
      try { res(f()) } catch (e) { rej(e) }
    }, ms)
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(signal.reason) }, { once: true })
  })

function eqParam(url: URL, col: string): string | null {
  const v = url.searchParams.get(col)
  return v && v.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null
}

function restAnswer(url: URL, method: string, accept: string, body: unknown): Response {
  const table = url.pathname.slice("/rest/v1/".length)
  const one = accept.includes("vnd.pgrst.object")
  const rows = (list: unknown[]) => (one ? (list.length ? json(200, list[0]) : json(406, { code: "PGRST116", message: "no rows" })) : json(200, list))
  if (table === "rate_limit_hits") {
    if (method === "HEAD" || method === "GET") return new Response(method === "HEAD" ? null : "[]", { status: 200, headers: { "content-range": "*/0", "content-type": "application/json" } })
    return json(201, [])
  }
  if (table === "creators") return rows([{ id: "c1", user_id: "u1", slug: "shop", display_name: "Shop" }])
  if (table === "profiles") return rows([{ id: "u1", username: "shop" }])
  if (table === "store_theme_installs") {
    return rows([{ id: INSTALL, creator_id: "c1", name: "Shop", theme_id: "t1", theme: { id: "t1", name: "Base" }, settings: world.settings[0] ?? null, pages: world.pages }])
  }
  if (table === "store_theme_pages") {
    const key = eqParam(url, "page_key")
    if (method === "GET") return rows(key ? world.pages.filter((p) => p.page_key === key) : world.pages)
    if (method === "POST") {
      const row = body as { install_id: string; page_key: string; sections: unknown[]; draft_sections: unknown[] | null }
      const list = Array.isArray(row) ? row : [row]
      for (const r of list) {
        if (world.pages.some((p) => p.page_key === r.page_key)) return json(409, { code: "23505", message: "duplicate key value violates unique constraint" })
      }
      const made = list.map((r, i) => ({ id: `n${world.pages.length + i}`, ...r }))
      world.pages.push(...made)
      return one ? json(201, made[0]) : json(201, made)
    }
    if (method === "PATCH") {
      const hit = world.pages.filter((p) => (!key || p.page_key === key) && (!eqParam(url, "id") || p.id === eqParam(url, "id")))
      for (const p of hit) Object.assign(p, body as object)
      return rows(hit)
    }
  }
  if (table === "store_theme_settings") {
    if (method === "GET") return rows(world.settings)
    if (method === "POST") {
      if (world.settings.length) return json(409, { code: "23505", message: "duplicate key value violates unique constraint" })
      const made = { id: "s-new", ...(body as object) } as (typeof world.settings)[number]
      world.settings.push(made)
      return one ? json(201, made) : json(201, [made])
    }
    if (method === "PATCH") {
      for (const s of world.settings) Object.assign(s, body as object)
      return rows(world.settings)
    }
  }
  return method === "GET" || method === "HEAD" ? rows([]) : json(201, [])
}

const standIn = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : null
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (href.startsWith("/")) return app(href, init)
  const signal = init?.signal ?? req?.signal
  const url = new URL(href)
  const method = (init?.method ?? req?.method ?? "GET").toUpperCase()
  if (url.pathname.endsWith("/jwks.json")) return json(200, { keys: [] })
  if (url.pathname === "/auth/v1/user") return later(world.authMs, () => json(200, person), signal)
  if (url.pathname.startsWith("/rest/v1/")) {
    const n = world.rest++
    const table = url.pathname.slice(9)
    world.restByTable.set(table, (world.restByTable.get(table) ?? 0) + 1)
    const accept = new Headers(init?.headers ?? req?.headers).get("accept") ?? ""
    const raw = init?.body ?? null
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : null
    const fault = world.fault(n, table, method)
    return later(world.restMs(n, table, method), () => {
      if (fault === "reset") throw new TypeError("fetch failed")
      if (fault === "503html") return new Response("<html><body>503 Service Temporarily Unavailable</body></html>", { status: 503, headers: { "content-type": "text/html" } })
      if (fault === "504pool") return json(504, { code: "PGRST003", message: "Timed out acquiring connection from connection pool." })
      if (fault === "429") return json(429, { message: "Too Many Requests" }, { "retry-after": "1" })
      return restAnswer(url, method, accept, body)
    }, signal)
  }
  return json(404, {})
}) as typeof fetch
globalThis.fetch = standIn

/* One request: one cookie store for its whole life, as Next keeps it. */
function holdRequest() {
  const jar = new Map([[COOKIE, cookie]])
  const store = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
  }
  const headers = new Headers({ host: "storelib.com" })
  ;(globalThis as Record<string, unknown>).__PUSH_TEST_NEXT_HEADERS__ = { cookies: () => store, headers: () => headers }
}
const params = { params: Promise.resolve({ installId: INSTALL }) }
/* The browser's fetch of a same-origin path: each is its own request to the real route. */
async function app(path: string, init?: RequestInit): Promise<Response> {
  holdRequest()
  const req = new Request(`https://storelib.com${path}`, init)
  const p = path.split("?")[0]
  if (p === `/api/website-builder/themes/${INSTALL}`) return (await installGet(req, params)) as Response
  if (p === `/api/website-builder/themes/${INSTALL}/sections`) return (await (req.method === "PUT" ? sectionsPut(req, params) : sectionsGet(req, params))) as Response
  if (p === `/api/website-builder/themes/${INSTALL}/settings`) return (await settingsPut(req, params)) as Response
  if (p === "/flaky") return flaky()
  return json(404, {})
}
let flakyLeft = 0
function flaky(): Response {
  if (flakyLeft-- > 0) return json(503, { error: "busy" })
  return json(200, { ok: true })
}

/* What the editor said before this round, for every way its first read could fail. */
const OLD_EDITOR_WORDS = "Your website didn't load. Check your connection and try again."
/** The words the editor shows now, or the old fixed sentence when the old code is under test. */
const EDITOR_SOURCE = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
/** Whether the editor under test words its problem by cause and tries again by itself (false for the code before this round). */
const EDITOR_EXPLAINS = /explainLoadProblem\(loadFailure/.test(EDITOR_SOURCE)
const EDITOR_AUTO = /LOAD_AUTO_RETRY_MS\[loadAutoTries\]/.test(EDITOR_SOURCE)
/** The editor's own wait for one request, read from its source. */
const EDITOR_WAIT_MS = Number(/const SECTIONS_WAIT_MS = ([\d_]+)/.exec(EDITOR_SOURCE)?.[1].replace(/_/g, "") ?? "20000")
function editorWords(f: { status?: number | null; error?: unknown }, retryingNow: boolean): string {
  if (!EDITOR_EXPLAINS) return OLD_EDITOR_WORDS
  const p = explainLoadProblem({ ...f, online: true }, retryingNow)
  return `${p.title}. ${p.body}`
}

/*
  The editor's first read, as app/website-builder/editor/[installId]/page.tsx
  loadData asks it (the same calls: retrying, fetchWithin, waits 700 and
  2000ms), and then, when `auto` is given, the page's automatic tries
  (LOAD_AUTO_RETRY_MS, here divided by `scale` so a minute runs in a moment).
*/
async function editorOpen(auto: readonly number[] | null, scale = 1): Promise<{ ok: boolean; words: string | null; tries: number; ms: number }> {
  const t0 = Date.now()
  let tries = 0
  const once = async () => {
    try {
      const res = await retrying(async () => {
        tries++
        const r = await fetchWithin(`/api/website-builder/themes/${INSTALL}`, {}, EDITOR_WAIT_MS)
        if (r.status >= 500 || r.status === 429) throw new Error(`the website answered ${r.status}`)
        return r
      }, [700, 2000])
      return res.ok ? { ok: true as const } : { ok: false as const, status: res.status }
    } catch (error) {
      return { ok: false as const, error }
    }
  }
  let r = await once()
  for (let i = 0; !r.ok && auto && i < auto.length; i++) {
    await new Promise((res) => setTimeout(res, auto[i] / scale))
    r = await once()
  }
  return { ok: r.ok, words: r.ok ? null : editorWords(r, false), tries, ms: Date.now() - t0 }
}

async function main() {
  forgetSigningKeys()
  const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n1. Supabase Auth slow (3.5s a question): opening the editor")
  resetWorld()
  world.authMs = 3_500
  {
    let ok = 0
    const N = 2
    const took: number[] = []
    const statuses: number[] = []
    for (let i = 0; i < N; i++) {
      holdRequest()
      const t = Date.now()
      const r = (await installGet(new Request(`https://storelib.com/api/website-builder/themes/${INSTALL}`), params)) as Response
      took.push(Date.now() - t)
      statuses.push(r.status)
      if (r.ok) ok++
    }
    report("auth-slow", `${ok}/${N} editor reads answered (statuses ${statuses.join(",")}; ${took.map((t) => (t / 1000).toFixed(1)).join("s, ")}s)`)
    check("the editor's read answers from the token's verified signature while Auth is slow", ok === N, statuses)
    check("  in under 4s each", took.every((t) => t < 4_000), took)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n2. A cold first call (8s), then normal")
  resetWorld()
  world.restMs = (n) => (n === 0 ? 8_000 : 15)
  {
    const r = await editorOpen(null)
    report("cold-start", `${r.ok ? "opened" : `failed: ${r.words}`} in ${(r.ms / 1000).toFixed(1)}s, ${r.tries} tries`)
    check("an 8s cold start opens the editor, first try", r.ok && r.tries === 1, r)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n3. A slow database (1 to 8s per query): opening the editor")
  for (const ms of [1_000, 4_000, 8_000]) {
    resetWorld()
    world.restMs = (_n, table) => (table === "rate_limit_hits" ? 15 : ms)
    const r = await editorOpen(null)
    report(`slow-db-${ms / 1000}s`, `${r.ok ? "opened" : `failed: ${r.words}`} in ${(r.ms / 1000).toFixed(1)}s, ${r.tries} tries`)
    check(`  ${ms / 1000}s per query: the editor opens`, r.ok, r)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n4. The rate limiter's own table slow (6s): reading a page's sections")
  resetWorld()
  world.restMs = (_n, table) => (table === "rate_limit_hits" ? 6_000 : 15)
  {
    holdRequest()
    const t = Date.now()
    const r = (await sectionsGet(new Request(`https://storelib.com/api/website-builder/themes/${INSTALL}/sections?page=home`), params)) as Response
    const took = Date.now() - t
    report("limiter-slow", `sections read ${r.status} in ${(took / 1000).toFixed(1)}s`)
    check("the page's sections still come", r.status === 200, r.status)
    check("  and the limiter holds the read under 4s (was its count plus its insert, 12s here, up to 50s)", took < 4_000, took)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n5. A database that blinks during a save (the update's connection reset)")
  resetWorld()
  {
    let resets = 0
    world.fault = (_n, table, method) => (table === "store_theme_pages" && method === "PATCH" && resets++ < 1 ? "reset" : null)
    const res = await putJsonWithRetry(`/api/website-builder/themes/${INSTALL}/sections`, { page_key: "home", sections: [], mode: "draft" })
    const words = res.ok ? null : explainSaveProblem(res.status, null).title
    report("save-reset", `${res.ok ? "saved" : `${res.status} "${words}"`}`)
    check("a save whose update met a dropped connection is saved, quietly", res.ok, res.status)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n6. The same new page saved twice at once (a retried save whose first answer was lost)")
  resetWorld()
  {
    world.restMs = (_n, table, method) => (table === "store_theme_pages" && method === "POST" ? 150 : 15)
    const body = JSON.stringify({ page_key: "size-guide", sections: [], mode: "draft" })
    const put = () => {
      holdRequest()
      return sectionsPut(new Request(`https://storelib.com/api/website-builder/themes/${INSTALL}/sections`, { method: "PUT", headers: { "content-type": "application/json" }, body }), params) as Promise<Response>
    }
    const [a, b] = await Promise.all([put(), put()])
    const ok = [a, b].filter((r) => r.ok).length
    report("save-twice", `${ok}/2 saves answered ok (statuses ${a.status},${b.status}); pages named size-guide: ${world.pages.filter((p) => p.page_key === "size-guide").length}`)
    check("both answer ok: the second is written to the page the first made", ok === 2, [a.status, b.status])
    check("  one page, not two", world.pages.filter((p) => p.page_key === "size-guide").length === 1)
  }
  resetWorld()
  {
    /* A settings lookup that blinked used to be read as "no row", and the insert then met the row that was there. */
    let blinks = 0
    world.fault = (_n, table, method) => (table === "store_theme_settings" && method === "GET" && blinks++ < 3 ? "504pool" : null)
    const res = await putJsonWithRetry(`/api/website-builder/themes/${INSTALL}/settings`, { draft_settings: { color: "red" } })
    report("settings-lookup-blink", `${res.ok ? "saved" : `${res.status} "${explainSaveProblem(res.status, null).title}"`}`)
    check("a settings save whose lookup blinked is saved", res.ok, res.status)
    check("  into the one settings row", world.settings.length === 1 && (world.settings[0].draft_settings as { color?: string } | null)?.color === "red", world.settings)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n7. The database away for a while (503, 504 or 429 on every read), then back")
  for (const fault of ["503html", "504pool", "429"] as const) {
    resetWorld()
    const until = Date.now() + 6_000
    world.fault = () => (Date.now() < until ? fault : null)
    const r = await editorOpen(EDITOR_AUTO ? LOAD_AUTO_RETRY_MS : null, 4)
    report(`away-6s-${fault}`, `${r.ok ? "opened" : `failed: "${r.words}"`} after ${(r.ms / 1000).toFixed(1)}s, ${r.tries} tries`)
    check(`  ${fault}: the editor opens by itself once the database is back`, r.ok, r)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n8. What the editor says when it gives up")
  {
    const cases: [string, { status?: number; error?: unknown }][] = [
      ["a timeout", { error: Object.assign(new Error("/api/... took longer than 20s"), { name: "LoadTimeout" }) }],
      ["a 503", { error: new Error("the website answered 503") }],
      ["a 500", { status: 500 }],
      ["no answer at all", { error: new TypeError("Failed to fetch") }],
    ]
    for (const [what, f] of cases) {
      const words = editorWords(f, false)
      report(`editor-words ${what}`, words)
      if (what !== "no answer at all") check(`  ${what}, online: never "check your connection"`, !/connection/i.test(words), words)
    }
    const offline = EDITOR_EXPLAINS ? explainLoadProblem({ error: new TypeError("Failed to fetch"), online: false }, true).title : OLD_EDITOR_WORDS
    check("  offline: says offline", /offline/i.test(offline), offline)
    report("timeout-copy", FAIL_COPY.timeout)
    check("requestJson's timeout words do not blame the connection", !/connection/i.test(FAIL_COPY.timeout), FAIL_COPY.timeout)
    const save503 = explainSaveProblem(503, null).title
    report("save-503", save503)
    check("a save answered 503 says Storelib is slow, not that it did not answer", !/didn't answer/.test(save503), save503)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n9. A read in the app meeting a gateway's 503 once (a deploy, a cold start)")
  {
    let ok = 0
    const N = 5
    for (let i = 0; i < N; i++) {
      flakyLeft = 1
      const r = await requestJson("/flaky")
      if (r.ok) ok++
      else if (i === 0) report("flaky-503-words", failMessage(r))
    }
    report("flaky-503", `${ok}/${N} reads answered`)
    check("one quiet retry: every read answers", ok === N, ok)
    flakyLeft = 2
    const twice = await requestJson("/flaky")
    check("  only one: a 503 that stays is said, not hidden", !twice.ok && twice.status === 503, twice.status)
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n10. A busy instance during an outage: requests sent to PostgREST")
  {
    resetWorld()
    world.fault = () => "504pool"
    world.restMs = () => 5
    const N = 200
    await Promise.all(Array.from({ length: N }, () => deadlineFetch(`${URL_}/rest/v1/products?select=id`, { method: "GET" }).then((r) => r.status, () => 0)))
    const sent = world.rest
    report("outage-amplification", `${N} reads put ${sent} requests on PostgREST (${(sent / N).toFixed(2)} each)`)
    check("retries stop multiplying an outage: under 1.5 requests per read", sent / N < 1.5, sent)
    resetWorld()
    let first = true
    world.fault = () => (first ? ((first = false), "504pool") : null)
    const r = await deadlineFetch(`${URL_}/rest/v1/products?select=id`, { method: "GET" })
    check("  a blip on a quiet instance is still asked again", r.status === 200 && world.rest === 2, { status: r.status, sent: world.rest })
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n11. A breaker whose trial hangs (GitHub, a provider)")
  {
    let t = 0
    const b = new CircuitBreaker("hang", { failures: 3, windowMs: 60_000, cooldownMs: 30_000, now: () => t })
    b.failure(); b.failure(); b.failure()
    t = 30_000
    const trial = b.allow()
    /* The provider is back at 40s; the trial never reports (it hangs for 100s). One caller a second asks. */
    let refused = 0
    let wouldHaveWorked = 0
    for (t = 31_000; t <= 130_000; t += 1_000) {
      const let_ = b.allow()
      if (!let_) {
        refused++
        if (t >= 40_000) wouldHaveWorked++
      } else if (t >= 40_000) b.success()
    }
    report("breaker-hung-trial", `${refused} of 100 calls refused, ${wouldHaveWorked} of them after the provider was back`)
    check("a hung trial does not keep everybody refused", trial && wouldHaveWorked <= 25, { refused, wouldHaveWorked })
    let u = 0
    const c = new CircuitBreaker("blip", { failures: 5, now: () => u })
    for (let i = 0; i < 40; i++) { u += 500; if (i % 10 === 0) c.failure(); else c.success() }
    check("  one slow or failed call among answers never opens it", c.state === "closed")
  }

  /* ────────────────────────────────────────────────────────────────────── */
  out("\n12. The pieces are where they should be")
  {
    const editor = src("app/website-builder/editor/[installId]/page.tsx")
    check("the editor tries a failed first read again by itself (LOAD_AUTO_RETRY_MS) and at once when back online",
      /LOAD_AUTO_RETRY_MS\[loadAutoTries\]/.test(editor) && /addEventListener\("online", back/.test(editor))
    check("  and its words come from explainLoadProblem, not one fixed sentence",
      /explainLoadProblem\(loadFailure/.test(editor) && !/body="Check your connection and try again\."/.test(editor))
    check("  a 429 is asked again, never drawn as a page with no sections",
      /if \(res\.status >= 500 \|\| res\.status === 429\) throw new Error\(`the \$\{page\} page answered/.test(editor))
    for (const f of ["app/api/website-builder/themes/[installId]/route.ts", "app/api/website-builder/themes/[installId]/sections/route.ts", "app/api/website-builder/themes/[installId]/files/route.ts", "app/api/website-builder/themes/[installId]/settings/route.ts"]) {
      const code = src(f)
      check(`${f.replace("app/api/website-builder/themes/", "")}: GET takes the read answer, changes stay strict`,
        /getCreator(And)?Install\(installId, true\)/.test(code) && /websiteInstallCaller(<[^>]+>)?\(installId, "[^"]+", \{ read \}\)/.test(code))
    }
    check("the limiter's steps each have a ceiling", /within\(\s*admin\s*\.from\("rate_limit_hits"\)\s*\.select/.test(src("lib/api/rate-limit.ts")) && /LIMIT_SWEEP_MS\)/.test(src("lib/api/rate-limit.ts")))
    const mine = ["lib/net/retry-budget.ts", "lib/website-builder/load-problem.ts", "lib/website-builder/write-retry.ts"]
    const banned = mine.filter((f) => /\u2014/.test(src(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(src(f)))
    check("no em dash and no banned word in this round's files", banned.length === 0, banned)
  }

  out(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    out(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.log(e)
  process.exit(1)
})
