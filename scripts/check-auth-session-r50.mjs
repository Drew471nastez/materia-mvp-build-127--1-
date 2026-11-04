/**
 * ===========================================================================
 *  RANDOM SIGN OUTS, MEASURED: THE REAL PROXY AGAINST A SUPABASE AUTH THAT
 *  ROTATES REFRESH TOKENS AND ENDS A SESSION ON REUSE, AS SUPABASE DOES
 * ===========================================================================
 * Round 50. The owner: "random logging out", "constant log outs, but just
 * bars", "Sign in to use this" while signed in.
 *
 * The real proxy.ts and the real lib/ modules are bundled with esbuild (the
 * real next/server, the real @supabase/ssr and supabase-js) and run against a
 * stand in for Supabase Auth that does what supabase/auth does
 * (internal/tokens/service.go RefreshTokenGrant, counter tokens):
 *
 *   a refresh token at the session's counter    rotated: counter + 1
 *   one behind ("fail-to-save"), or any token   the current one handed back,
 *   used again inside the reuse interval        nothing rotated
 *   two or more behind, outside the interval    THE SESSION IS ENDED
 *                                               ("Invalid Refresh Token:
 *                                               Already Used")
 *
 * A browser is a cookie jar that takes every Set-Cookie a response carries,
 * in the order the responses arrive. Each scenario counts:
 *
 *   revoked      sessions Supabase Auth ended for reuse
 *   cleared      times the jar lost its session while Auth still had it
 *                (the person is signed out on their next page)
 *   prompts      sign in answers to a person who was signed in all along:
 *                a redirect to /login, or a route's 401
 *   dropped      renewals Auth made whose new token never reached the jar
 *   auth calls   refresh requests that reached Supabase Auth
 *
 *   node scripts/check-auth-session-r50.mjs                     # this tree
 *   SRC_ROOT=/path/to/older/tree node scripts/check-auth-session-r50.mjs   # the same scenarios on other code
 *   R50_JSON=1 ...                                              # one JSON line with every number
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"

const root = process.cwd()
const src = process.env.SRC_ROOT ?? root
const out = join(root, ".r50auth-probe")
mkdirSync(out, { recursive: true })
const empty = join(out, "empty.js")
writeFileSync(empty, "export {}\n")
const entry = join(out, "entry.ts")
writeFileSync(
  entry,
  [
    `export { proxy } from ${JSON.stringify(join(src, "proxy.ts"))}`,
    `export { readCurrentUser } from ${JSON.stringify(join(src, "lib/auth/current-user.ts"))}`,
    `export { routeUserFrom } from ${JSON.stringify(join(src, "lib/auth/route-user.ts"))}`,
    `export { deadlineFetch } from ${JSON.stringify(join(src, "lib/net/deadline.ts"))}`,
    "",
  ].join("\n"),
)
const bundle = join(out, "probe.cjs")
execFileSync(
  "pnpm",
  ["exec", "esbuild", entry, "--bundle", "--platform=node", "--format=cjs", "--log-level=error", `--outfile=${bundle}`, `--alias:server-only=${empty}`, `--alias:@=${src}`, "--packages=external"],
  { stdio: ["ignore", "ignore", "inherit"] },
)

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
delete process.env.SUPABASE_JWT_SECRET

const KEY = "sb-abcdefgh-auth-token"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nowS = () => Math.floor(Date.now() / 1000)
const quiet = { warn: console.warn, error: console.error, log: console.log }
const say = (...a) => quiet.log(...a)
console.warn = () => {}
console.error = () => {}

/* ------------------------------------------------------------------ */
/*  The stand in for Supabase Auth                                     */
/* ------------------------------------------------------------------ */
const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {} }
const auth = {
  reuseMs: 1_000,
  sessions: new Map(),
  /** "ok" | "slow" (ms in refreshDelay) | a status number | "html-<status>" | "network" */
  refresh: "ok",
  refreshDelay: 0,
  user: "ok",
  refreshCalls: 0,
  /** Renewals Auth rotated, by the counter they handed out. */
  issued: [],
  revoked: 0,
  reset() {
    this.sessions.clear()
    this.refresh = "ok"
    this.refreshDelay = 0
    this.user = "ok"
    this.refreshCalls = 0
    this.issued = []
    this.revoked = 0
  },
}
let sid = 0
function newSession(expiresIn) {
  const id = `s${++sid}`
  auth.sessions.set(id, { counter: 0, lastRefreshedAt: 0, alive: true })
  return stored(id, 0, expiresIn)
}
function stored(id, counter, expiresIn) {
  const exp = nowS() + expiresIn
  return { access_token: `at.${id}.${counter}.${exp}.${Math.random().toString(36).slice(2, 6)}`, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: `rt.${id}.${counter}`, user }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const html = (status) => new Response(`<!doctype html><title>${status}</title><h1>Error ${status}</h1>`, { status, headers: { "content-type": "text/html" } })

function failure(mode) {
  if (mode === "network") throw new TypeError("fetch failed")
  if (typeof mode === "string" && mode.startsWith("html-")) return html(Number(mode.slice(5)))
  if (typeof mode === "number") return json({ message: `status ${mode}` }, mode)
  return null
}

async function refreshGrant(body) {
  auth.refreshCalls++
  if (auth.refreshDelay) await sleep(auth.refreshDelay)
  const failed = failure(auth.refresh)
  if (failed) return failed
  const [, id, c] = String(body.refresh_token).split(".")
  const s = auth.sessions.get(id)
  if (!s || !s.alive) return json({ code: "refresh_token_not_found", error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }, 400)
  const counter = Number(c)
  const diff = s.counter - counter
  const now = Date.now()
  if (diff < 0) return json({ code: "validation_failed", msg: "Invalid Refresh Token: Not Issued By This Server" }, 400)
  if (diff === 0) {
    s.counter++
    s.lastRefreshedAt = now
    auth.issued.push(`${id}.${s.counter}`)
    return json(stored(id, s.counter, 3600))
  }
  const failToSave = diff === 1
  const concurrent = Math.abs(now - s.lastRefreshedAt) < auth.reuseMs
  if (failToSave || concurrent) return json(stored(id, s.counter, 3600))
  s.alive = false
  auth.revoked++
  return json({ code: "refresh_token_already_used", error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" }, 400)
}

function userFor(token) {
  const failed = failure(auth.user)
  if (failed) return failed
  const [, id, , exp] = String(token).split(".")
  const s = auth.sessions.get(id)
  if (!s || !s.alive) return json({ code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" }, 403)
  if (Number(exp) < nowS()) return json({ code: "bad_jwt", msg: "invalid JWT: token is expired" }, 403)
  return json(user)
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url)
  if (url.pathname === "/auth/v1/token") {
    const body = JSON.parse(init.body ?? "{}")
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError")
    return refreshGrant(body)
  }
  if (url.pathname === "/auth/v1/user") {
    const authz = new Headers(init.headers).get("authorization") ?? ""
    if (auth.user === "slow") await sleep(4_000)
    return userFor(authz.replace(/^Bearer /i, ""))
  }
  if (url.pathname.startsWith("/auth/v1/.well-known")) return json({ keys: [] })
  if (url.pathname.startsWith("/rest/v1/")) return json([])
  return json({}, 404)
}

const require = createRequire(bundle)
const { NextRequest } = require("next/server")
const { createServerClient } = require("@supabase/ssr")
const probe = require(bundle)

/* ------------------------------------------------------------------ */
/*  The browser: a cookie jar                                          */
/* ------------------------------------------------------------------ */
function jar(session) {
  const cookies = new Map()
  if (session) cookies.set(KEY, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`)
  cookies.set("sb-host-only", "1")
  return {
    cookies,
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    take(setCookies) {
      for (const line of setCookies) {
        if (/;\s*Domain=/i.test(line)) continue
        const [pair] = line.split(";")
        const eq = pair.indexOf("=")
        const name = pair.slice(0, eq).trim()
        const value = pair.slice(eq + 1).trim()
        if (/Max-Age=0\b/i.test(line) || value === "") cookies.delete(name)
        else cookies.set(name, value)
      }
    },
    session() {
      const raw = cookies.get(KEY)
      if (!raw) return null
      try {
        return JSON.parse(Buffer.from(decodeURIComponent(raw).replace(/^base64-/, ""), "base64url").toString("utf8"))
      } catch {
        return null
      }
    },
  }
}

async function visit(browser, path, { rsc = false } = {}) {
  const headers = new Headers({ host: "storelib.com", "user-agent": "Mozilla/5.0" })
  headers.set("cookie", browser.header())
  if (rsc) headers.set("rsc", "1")
  const res = await probe.proxy(new NextRequest(`https://storelib.com${path}`, { headers }))
  const setCookies = res.headers.getSetCookie?.() ?? []
  return { res, setCookies, location: res.headers.get("location") }
}

/* The route behind the proxy, before round 50: getUser(), and 401 "Sign in to use this" when it gave nobody. */
async function routeBefore(cookieHeader) {
  const client = serverClient(cookieHeader)
  const { data } = await client.auth.getUser().catch(() => ({ data: { user: null } }))
  return data?.user ? 200 : 401
}
/* After: lib/auth/route-user's three answers (routeUserFrom over readCurrentUser), a 503 for "Auth did not answer". */
async function routeAfter(cookieHeader) {
  const client = serverClient(cookieHeader)
  const who = probe.routeUserFrom(await probe.readCurrentUser(client, { tokenFirst: true, retries: 1, timeoutMs: 3_000, pauseMs: () => 50 }))
  return who.kind === "user" ? 200 : who.kind === "anonymous" ? 401 : 503
}
function serverClient(cookieHeader) {
  const pairs = cookieHeader.split(";").map((p) => p.trim()).filter(Boolean).map((p) => ({ name: p.slice(0, p.indexOf("=")), value: decodeURIComponent(p.slice(p.indexOf("=") + 1)) }))
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, "anon", {
    global: { fetch: probe.deadlineFetch },
    cookies: { getAll: () => pairs, setAll: () => { throw new Error("Server Component") } },
  })
}

function alive(browser) {
  const s = browser.session()
  if (!s) return false
  const [, id] = String(s.refresh_token).split(".")
  return auth.sessions.get(id)?.alive === true
}
function dropped(browser) {
  const s = browser.session()
  if (!s) return 0
  const [, id, c] = String(s.refresh_token).split(".")
  const live = auth.sessions.get(id)
  return live ? Math.max(0, live.counter - Number(c)) : 0
}

const results = []
function record(name, r) {
  results.push({ name, ...r })
  say(`  ${name.padEnd(46)} revoked ${r.revoked}  cleared ${r.cleared}  prompts ${r.prompts}  dropped ${r.dropped}  auth calls ${r.authCalls}`)
}

/* ------------------------------------------------------------------ */
/*  Scenarios                                                          */
/* ------------------------------------------------------------------ */
async function parallelAtExpiry() {
  auth.reset()
  const browser = jar(newSession(-30))
  const paths = ["/app/products", "/app", "/api/app/search?q=a", "/app/orders", "/explore?x=1", "/app/settings", "/api/notifications", "/app/website-builder", "/api/ai-models", "/app/customers", "/app/analytics", "/api/dashboard"]
  let prompts = 0
  const answers = await Promise.all(paths.map((p, i) => visit(browser, p, { rsc: i % 2 === 1 })))
  for (const a of answers) {
    browser.take(a.setCookies)
    if (a.location?.includes("/login")) prompts++
  }
  const droppedNow = dropped(browser)
  await sleep(auth.reuseMs + 200)
  const later = await visit(browser, "/app/products")
  browser.take(later.setCookies)
  if (later.location?.includes("/login")) prompts++
  record("12 parallel requests at expiry", { revoked: auth.revoked, cleared: alive(browser) || auth.revoked ? 0 : 1, prompts, dropped: droppedNow, authCalls: auth.refreshCalls })
}

async function twoTabs() {
  auth.reset()
  const browser = jar(newSession(-30))
  let prompts = 0
  /* Tab A and tab B wake together: each loads its page and its prefetches at once, on one cookie jar. */
  const a = ["/app/products", "/app/orders", "/app/customers"].map((p) => visit(browser, p))
  await sleep(40)
  const b = ["/website-builder/editor/i1", "/app/settings", "/app"].map((p) => visit(browser, p, { rsc: true }))
  for (const r of await Promise.all([...a, ...b])) {
    browser.take(r.setCookies)
    if (r.location?.includes("/login")) prompts++
  }
  const droppedNow = dropped(browser)
  await sleep(auth.reuseMs + 200)
  for (const p of ["/app/products", "/app/orders"]) {
    const r = await visit(browser, p)
    browser.take(r.setCookies)
    if (r.location?.includes("/login")) prompts++
  }
  record("two tabs waking at expiry", { revoked: auth.revoked, cleared: alive(browser) || auth.revoked ? 0 : 1, prompts, dropped: droppedNow, authCalls: auth.refreshCalls })
}

async function appResume() {
  auth.reset()
  const browser = jar(newSession(-600))
  let prompts = 0
  /* The phone was put away mid renewal: Auth rotated, the answer never arrived. */
  await refreshGrant({ refresh_token: browser.session().refresh_token })
  await sleep(auth.reuseMs + 200)
  /* Back in the app: the WebView reloads the page and its requests fire at once. */
  const burst = await Promise.all(["/app", "/app/products", "/api/app/session", "/api/notifications", "/app/orders", "/app/website-builder", "/api/dashboard", "/app/analytics"].map((p, i) => visit(browser, p, { rsc: i % 3 === 0 })))
  for (const r of burst) {
    browser.take(r.setCookies)
    if (r.location?.includes("/login")) prompts++
  }
  const droppedNow = dropped(browser)
  await sleep(auth.reuseMs + 200)
  const r = await visit(browser, "/app")
  browser.take(r.setCookies)
  if (r.location?.includes("/login")) prompts++
  record("app resume after a lost renewal", { revoked: auth.revoked, cleared: alive(browser) || auth.revoked ? 0 : 1, prompts, dropped: droppedNow, authCalls: auth.refreshCalls })
}

/*
  ROUND 51: WIFI TO CELLULAR. The phone was in the background past the token's
  expiry; it comes back on wifi, a renewal reaches Auth and rotates, and the
  wifi goes before the answer arrives. The next requests go on cellular while
  it is still coming up (the renewal fails at the network), then on cellular
  once it is up.
*/
async function networkSwitch() {
  auth.reset()
  const browser = jar(newSession(-900))
  let prompts = 0
  await refreshGrant({ refresh_token: browser.session().refresh_token })
  auth.refresh = "network"
  for (const p of ["/app/orders", "/api/notifications"]) {
    const r = await visit(browser, p, { rsc: p.startsWith("/app") })
    browser.take(r.setCookies)
    if (r.location?.includes("/login")) prompts++
  }
  const keptThrough = !!browser.session()
  auth.refresh = "ok"
  await sleep(auth.reuseMs + 200)
  for (const p of ["/app/orders", "/app/products", "/api/app/session"]) {
    const r = await visit(browser, p, { rsc: p !== "/api/app/session" })
    browser.take(r.setCookies)
    if (r.location?.includes("/login")) prompts++
  }
  const droppedNow = dropped(browser)
  record("wifi to cellular mid renewal", { revoked: auth.revoked, cleared: keptThrough && (alive(browser) || auth.revoked) ? 0 : 1, prompts, dropped: droppedNow, authCalls: auth.refreshCalls })
}

async function slowRenewal() {
  auth.reset()
  const browser = jar(newSession(-30))
  auth.refreshDelay = 6_600
  const r = await visit(browser, "/app/products")
  browser.take(r.setCookies)
  /* The renewal the response did not wait for ends at Auth meanwhile. */
  await sleep(4_500)
  auth.refreshDelay = 0
  const droppedNow = dropped(browser)
  await sleep(auth.reuseMs + 200)
  const next = await visit(browser, "/app/products")
  browser.take(next.setCookies)
  record("renewal slower than the proxy's read (6.6s)", { revoked: auth.revoked, cleared: alive(browser) || auth.revoked ? 0 : 1, prompts: (r.location?.includes("/login") ? 1 : 0) + (next.location?.includes("/login") ? 1 : 0), dropped: droppedNow, authCalls: auth.refreshCalls })
}

async function authOutage(mode) {
  auth.reset()
  const browser = jar(newSession(-30))
  auth.refresh = mode
  let prompts = 0
  for (const p of ["/app/products", "/api/ai-models"]) {
    const r = await visit(browser, p)
    browser.take(r.setCookies)
    if (r.location?.includes("/login")) prompts++
  }
  const keptSession = !!browser.session()
  auth.refresh = "ok"
  const back = await visit(browser, "/app/products")
  browser.take(back.setCookies)
  if (back.location?.includes("/login")) prompts++
  record(`refresh answered ${mode}`, { revoked: auth.revoked, cleared: keptSession ? 0 : 1, prompts, dropped: 0, authCalls: auth.refreshCalls })
}

async function routeOutage(mode, routeKind) {
  auth.reset()
  const s = newSession(3000)
  auth.user = mode
  const cookie = `${KEY}=base64-${Buffer.from(JSON.stringify(s)).toString("base64url")}`
  const status = routeKind === "before" ? await routeBefore(cookie) : await routeAfter(cookie)
  return status === 401 ? 1 : 0
}

say("\nRound 50: sessions under rotation, reuse detection and outages")
say(`  source: ${src === root ? "this tree" : src}\n`)
try {
  await parallelAtExpiry()
  await twoTabs()
  await appResume()
  await networkSwitch()
  await slowRenewal()
  for (const mode of [500, 502, 503, 504, "html-520", "html-522", 408, 429, "html-403", "network"]) await authOutage(mode)

  say("\n  A route behind the proxy while Supabase Auth's /user does not answer (\"Sign in to use this\")")
  const routeModes = ["network", 500, 502, 503, 504, "html-522", "slow"]
  let before = 0
  let after = 0
  for (const mode of routeModes) {
    const b = await routeOutage(mode, "before")
    const a = await routeOutage(mode, "after")
    before += b
    after += a
    say(`  /user answered ${String(mode).padEnd(9)} getUser() route: ${b ? "401 Sign in" : "no prompt"}   route-user: ${a ? "401 Sign in" : "503 Try again"}`)
  }
  results.push({ name: "route prompts during an Auth outage (raw getUser pattern)", prompts: before })
  results.push({ name: "route prompts during an Auth outage (lib/auth/route-user)", prompts: after })

  const totals = results.reduce((t, r) => ({ revoked: t.revoked + (r.revoked ?? 0), cleared: t.cleared + (r.cleared ?? 0), prompts: t.prompts + (r.name.includes("raw getUser") ? 0 : r.prompts ?? 0), dropped: t.dropped + (r.dropped ?? 0) }), { revoked: 0, cleared: 0, prompts: 0, dropped: 0 })
  say(`\n  TOTAL  revoked ${totals.revoked}  cleared ${totals.cleared}  sign in prompts ${totals.prompts}  dropped renewals ${totals.dropped}`)
  say(`  (a raw getUser() route would have prompted ${before} times out of ${routeModes.length})\n`)
  if (process.env.R50_JSON) say(JSON.stringify({ totals, results }))
  process.exitCode = totals.revoked === 0 && totals.cleared === 0 && totals.prompts === 0 ? 0 : 1
} finally {
  rmSync(out, { recursive: true, force: true })
}
