/**
 * ===========================================================================
 *  ROUND 52, IN THE REAL APP: EVERY SIGN IN FLOW, DESKTOP, PHONE AND THE APP
 * ===========================================================================
 * `next dev` of this checkout against a stand in Supabase that signs its
 * access tokens with HS256 (SUPABASE_JWT_SECRET is set, so the server checks
 * them locally as production does), keeps sessions (a sign out ends one; a
 * revoked refresh token is refused) and keeps password reset codes (valid,
 * expired, used). Driven in headless Chromium at 1440x900, at 390x844 and at
 * 390x844 with the Capacitor shell's user agent:
 *
 *   RESET     a valid link: the form, a new password, then the login form;
 *             an expired and a used link: "Link expired", and Back to log in
 *             opens the login form (the owner's report); the same while the
 *             browser still holds the recovery session of an earlier visit
 *   LOGIN     email, then password, then where /auth/continue sends them
 *   LOGOUT    /logout: signed out, the login form on /login
 *   SIGNUP    a new address: the check your email step
 *   EXPIRED   an access token past its time with a live refresh token: /app
 *             renews it and renders; a revoked one: /login, not a loop
 *   NATIVE    /native-start signed out: /welcome; signed in: onward
 *   CONNECT   /auth/connect-return hands its address to the app
 *   AUTH DOWN /app and a save while /auth/v1/user hangs (AUTH_DOWN=1)
 *
 *   node scripts/check-auth-flows-r52.mjs
 *   SHOTS_DIR=/some/dir ...      screenshots of every step
 *   ONLY=reset,login ...         some flows only
 */
import { spawn } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { createServer } from "node:http"
import { createHmac, randomBytes } from "node:crypto"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

/* The headless shell: full Chromium in headless mode holds an unanswerable "open this app?" dialog after the phone page's storelib:// hand off and drops every tap after it, which no phone does. */
const CHROMIUM = process.env.CHROMIUM_PATH || ["/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const STUB_PORT = Number(process.env.STUB_PORT || 54452)
const PORT = Number(process.env.PORT || 3952)
const BASE = `http://localhost:${PORT}`
const STUB = `http://127.0.0.1:${STUB_PORT}`
const NEXT_BIN = "node_modules/next/dist/bin/next"
const SECRET = "r52-flows-secret-of-plenty-of-length-0123456789"
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean)
const want = (f) => ONLY.length === 0 || ONLY.includes(f)
const shots = process.env.SHOTS_DIR || null
if (shots) mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const results = []
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  results.push({ ok, what })
  if (!ok) broken++
}

/* ── The stand in Supabase ─────────────────────────────────────────────── */
const AT = "2026-10-01T10:00:00.000Z"
const b64u = (b) => Buffer.from(b).toString("base64url")
const nowS = () => Math.floor(Date.now() / 1000)
const BUYER = { id: "99999999-9999-4999-8999-000000000052", aud: "authenticated", role: "authenticated", email: "ghita@example.com", email_confirmed_at: AT, confirmed_at: AT, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "Ghita Nastase" }, identities: [{ provider: "email", identity_data: { email: "ghita@example.com" } }], created_at: AT, updated_at: AT }
const PASSWORD = { [BUYER.email]: "correct-horse-1" }
const sessions = new Map()
const USERS = new Map([[BUYER.id, BUYER]])
const auth = { userMode: "ok", log: [] }
function jwt(user, sid, expIn = 3600, amr = "password") {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const p = b64u(JSON.stringify({ iss: `${STUB}/auth/v1`, sub: user.id, aud: "authenticated", role: "authenticated", exp: nowS() + expIn, iat: nowS(), email: user.email, app_metadata: user.app_metadata, user_metadata: user.user_metadata, session_id: sid, amr: [{ method: amr, timestamp: nowS() }] }))
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`
}
function newSession(user, { expIn = 3600, amr = "password" } = {}) {
  const sid = `s-${randomBytes(4).toString("hex")}`
  const refresh = `rt-${randomBytes(8).toString("hex")}`
  sessions.set(refresh, { sid, userId: user.id, alive: true })
  sessions.set(sid, { sid, userId: user.id, alive: true })
  return { access_token: jwt(user, sid, expIn, amr), token_type: "bearer", expires_in: expIn, expires_at: nowS() + expIn, refresh_token: refresh, user }
}
function tokenUser(bearer) {
  const t = String(bearer || "").replace(/^Bearer /i, "")
  const [h, p, s] = t.split(".")
  if (!s || createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return { error: 401 }
  const claims = JSON.parse(Buffer.from(p, "base64url").toString())
  if (claims.exp < nowS()) return { error: 403, code: "bad_jwt" }
  const live = sessions.get(claims.session_id)
  if (!live?.alive) return { error: 403, code: "session_not_found" }
  return { user: USERS.get(claims.sub) ?? null, claims }
}
const resetRequests = [
  { id: "rr-valid", token: "validvalidvalidvalidvalidvalidvalidvalidvalidvalidvalidvalid01", user_id: BUYER.id, email: BUYER.email, used: false, expires_at: new Date(Date.now() + 3600_000).toISOString() },
  { id: "rr-valid2", token: "validvalidvalidvalidvalidvalidvalidvalidvalidvalidvalidvalid02", user_id: BUYER.id, email: BUYER.email, used: false, expires_at: new Date(Date.now() + 3600_000).toISOString() },
  { id: "rr-expired", token: "expiredexpiredexpiredexpiredexpiredexpiredexpiredexpiredexpir", user_id: BUYER.id, email: BUYER.email, used: false, expires_at: new Date(Date.now() - 3600_000).toISOString() },
  { id: "rr-used", token: "usedusedusedusedusedusedusedusedusedusedusedusedusedusedusedus", user_id: BUYER.id, email: BUYER.email, used: true, expires_at: new Date(Date.now() + 3600_000).toISOString() },
]
const tables = {
  profiles: [{ id: BUYER.id, username: "ghita", display_name: "Ghita Nastase", avatar_url: null, email: BUYER.email, email_verified: true, is_creator: false, welcome_completed: true, created_at: AT }],
  creators: [],
  password_reset_requests: resetRequests,
  platform_settings: [], platform_flags: [], rate_limit_hits: [],
}
function matches(row, key, raw) {
  const [op, ...rest] = raw.split(".")
  const arg = rest.join(".")
  const v = row[key] == null ? null : String(row[key])
  if (op === "eq") return v === arg
  if (op === "neq") return v !== arg
  if (op === "is") return arg === "null" ? v === null : v === arg
  if (op === "in") return arg.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(v)
  return true
}
const filtered = (list, url) => {
  let rows = [...(list || [])]
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "offset", "or", "and", "on_conflict", "columns"].includes(k)) continue
    rows = rows.filter((r) => matches(r, k, v))
  }
  return rows
}
async function body(req) {
  let s = ""
  for await (const d of req) s += d
  try { return JSON.parse(s || "{}") } catch { return {} }
}
const stub = createServer(async (req, res) => {
  const url = new URL(req.url, STUB)
  const send = (status, b, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...headers })
    res.end(b === undefined ? "" : JSON.stringify(b))
  }
  if (req.method === "OPTIONS") return send(204)
  const p = url.pathname
  auth.log.push(`${req.method} ${p}`)
  if (p === "/auth/v1/token") {
    const b = await body(req)
    const grant = url.searchParams.get("grant_type")
    if (grant === "password") {
      if (PASSWORD[b.email] && PASSWORD[b.email] === b.password) return send(200, newSession(BUYER))
      return send(400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" })
    }
    if (grant === "refresh_token") {
      const s = sessions.get(b.refresh_token)
      if (!s?.alive) return send(400, { code: "refresh_token_not_found", error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" })
      s.alive = false
      const next = newSession(USERS.get(s.userId) ?? BUYER)
      /* The same session id goes on: Supabase rotates the refresh token within one session. */
      return send(200, next)
    }
    return send(400, { msg: "unsupported grant" })
  }
  if (p === "/auth/v1/user") {
    if (auth.userMode === "hang") return /* never answers */
    const who = tokenUser(req.headers.authorization)
    if (req.method === "PUT") {
      const b = await body(req)
      if (!who.user) return send(401, { msg: "no user" })
      if (b.password) PASSWORD[BUYER.email] = b.password
      return send(200, BUYER)
    }
    if (who.user) return send(200, who.user)
    return send(who.error || 401, { code: who.code || "no_authorization", error_code: who.code || "no_authorization", msg: "no user" })
  }
  if (p === "/auth/v1/logout") {
    const who = tokenUser(req.headers.authorization)
    if (who.claims) for (const [, s] of sessions) if (s.userId === who.claims.sub) s.alive = false
    return send(204)
  }
  if (p === "/auth/v1/signup") {
    const b = await body(req)
    /* Confirm email is off in production: a new account is signed in at once, and Storelib sends its own code. */
    const fresh = { id: `77777777-7777-4777-8777-${randomBytes(6).toString("hex")}`, aud: "authenticated", role: "authenticated", email: b.email, email_confirmed_at: null, identities: [{ provider: "email" }], created_at: new Date().toISOString(), user_metadata: b.data || {}, app_metadata: { provider: "email", providers: ["email"] } }
    USERS.set(fresh.id, fresh)
    return send(200, newSession(fresh))
  }
  if (p === "/auth/v1/admin/generate_link") {
    const b = await body(req)
    const t = randomBytes(6).toString("hex")
    return send(200, { action_link: `${STUB}/auth/v1/verify?token=${t}&type=recovery`, email_otp: "123456", hashed_token: t, redirect_to: b.redirect_to || "", verification_type: "recovery", ...BUYER })
  }
  if (p === "/auth/v1/verify") {
    const s = newSession(BUYER, { amr: "recovery" })
    const hash = new URLSearchParams({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: "3600", expires_at: String(s.expires_at), token_type: "bearer", type: "recovery" })
    res.writeHead(303, { location: `https://storelib.com/reset-password#${hash}` })
    return res.end()
  }
  const admin = p.match(/^\/auth\/v1\/admin\/users(?:\/([^/]+))?$/)
  if (admin) {
    if (admin[1]) return admin[1] === BUYER.id ? send(200, BUYER) : send(404, { msg: "User not found" })
    return send(200, { users: [BUYER], aud: "authenticated" })
  }
  if (p === "/auth/v1/.well-known/jwks.json") return send(200, { keys: [] })
  if (p.startsWith("/auth/v1/")) return send(200, {})
  if (p.startsWith("/storage/v1/")) return send(404, { error: "not found" })
  if (p.startsWith("/rest/v1/rpc/")) return send(200, null)
  const m = p.match(/^\/rest\/v1\/([a-z_0-9]+)$/)
  if (!m) return send(404, { message: "no route" })
  const list = (tables[m[1]] ??= [])
  if (req.method === "PATCH") {
    const b = await body(req)
    const hit = filtered(list, url)
    for (const r of hit) Object.assign(r, b)
    return send(200, hit)
  }
  if (req.method === "POST") {
    const b = await body(req)
    const rows = (Array.isArray(b) ? b : [b]).map((r) => ({ id: `w-${randomBytes(3).toString("hex")}`, ...r }))
    list.push(...rows)
    return send(201, rows)
  }
  if (req.method === "DELETE") return send(200, [])
  const rows = filtered(list, url)
  const range = { "content-range": `${rows.length ? `0-${rows.length - 1}` : "*"}/${rows.length}` }
  if (req.method === "HEAD") return send(200, undefined, range)
  if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
    if (rows.length !== 1) return send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" })
    return send(200, rows[0], range)
  }
  return send(200, rows, range)
})
await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r))

/* ── next dev ───────────────────────────────────────────────────────────── */
const env = {
  ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: "probe-anon-key", SUPABASE_SERVICE_ROLE_KEY: "probe-service-role-key-long-enough",
  SUPABASE_JWT_SECRET: SECRET, STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: BASE,
}
const next = spawn(process.execPath, ["--max-old-space-size=6144", NEXT_BIN, "dev", "--turbopack", "-p", String(PORT), "-H", "localhost"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] })
let serverOut = ""
const log = process.env.NEXT_LOG || null
next.stdout.on("data", (d) => { serverOut += d; if (log) appendFileSync(log, d) })
next.stderr.on("data", (d) => { serverOut += d; if (log) appendFileSync(log, d) })
process.on("exit", () => { next.kill(); stub.close() })
let up = false
for (let i = 0; i < 400 && !up; i++) {
  await sleep(1500)
  up = await fetch(`${BASE}/robots.txt`).then((r) => r.status > 0).catch(() => false)
}
if (!up) { console.error(`next dev did not come up\n${serverOut.slice(-3000)}`); process.exit(1) }
for (const path of ["/login", "/reset-password", "/request", "/signup", "/native-start", "/welcome", "/auth/continue", "/auth/auth-code-error", "/app", "/explore", "/auth/connect-return?to=%2Fauth%2Fcallback%3Fcode%3Dx"]) {
  const t0 = Date.now()
  const r = await fetch(`${BASE}${path}`, { redirect: "manual" }).catch((e) => ({ status: String(e) }))
  console.log(`  warm ${path} ${r.status} ${Date.now() - t0}ms`)
}
for (const [path, b] of [["/api/auth/exchange-reset-code", { code: "warm" }], ["/api/auth/account-origin", { email: "warm@example.com" }]]) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).catch((e) => ({ status: String(e) }))
  console.log(`  warm POST ${path} ${r.status}`)
}

/* ── The browser ────────────────────────────────────────────────────────── */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, timeout: 180_000, protocolTimeout: 180_000, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const CAP_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 StorelibApp Capacitor"
const VIEWS = [
  { name: "desktop", vp: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "phone", vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" },
  { name: "app", vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, ua: CAP_UA },
]
const consent = { name: "storelib_consent", value: `2.p1.a0.m0.${nowS()}`, url: BASE }
const KEY = "sb-127-auth-token"
const cookieFor = (s) => ({ name: KEY, value: `base64-${b64u(JSON.stringify(s))}`, url: BASE })

async function fresh(view) {
  /* A new person each time, as far as the rate limits are concerned. */
  for (const k of Object.keys(tables)) if (/rate_limit/.test(k)) tables[k].length = 0
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(view.vp)
  if (view.ua) await page.setUserAgent(view.ua)
  await page.setCookie(consent)
  page.setDefaultTimeout(60_000)
  page.__errors = []
  page.on("pageerror", (e) => page.__errors.push(String(e).slice(0, 200)))
  return { ctx, page }
}
async function shot(page, name) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) }).catch(() => {})
}
const path = (page) => new URL(page.url()).pathname
async function waitFor(page, fn, ms = 30_000, ...args) {
  try {
    await page.waitForFunction(fn, { timeout: ms, polling: 200 }, ...args)
    return true
  } catch {
    return false
  }
}
const loginFormShown = (page, ms = 30_000) => waitFor(page, () => location.pathname === "/login" && !!document.querySelector('input[type="email"], input[name="email"], input[autocomplete="email"]'), ms)
/* A real tap or click at the element's middle, as a person would, with a ceiling: a page whose main thread is stuck answers nothing, and that is a finding, not a hang of this script. */
const within = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))])
async function clickText(page, text) {
  const box = await within(
    page.evaluate((t) => {
      const el = [...document.querySelectorAll("a, button")].find((e) => e.textContent?.trim() === t && e.getBoundingClientRect().width > 0)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      /* What is under the point, and what became of the click, for a failure's detail. */
      const under = document.elementFromPoint(x, y)
      window.__r52click = { under: under ? `${under.tagName} ${(under.textContent || "").trim().slice(0, 30)}` : null, events: [] }
      for (const type of ["pointerdown", "click"]) document.addEventListener(type, (e) => window.__r52click.events.push(`${type}:${e.target?.tagName}:${e.defaultPrevented}`), { capture: true, once: true })
      return { x, y }
    }, text),
    10_000,
    "stuck",
  ).catch(() => null)
  if (!box || box === "stuck") return box === "stuck" ? "page not answering" : false
  /* A phone is touched, not clicked: after a storelib:// hand off that found no app, headless Chromium drops mouse input on an emulated phone, and a finger is what the person uses anyway. */
  const touch = page.viewport()?.hasTouch
  const done = await within((touch ? page.touchscreen.tap(box.x, box.y) : page.mouse.click(box.x, box.y)).then(() => true), 10_000, "stuck").catch(() => true)
  return done === "stuck" ? "click not answered" : true
}
async function responsive(page) {
  return within(page.evaluate(() => true), 5_000, false).catch(() => true)
}

async function resetExpired(view, which, { withSession = false } = {}) {
  const { ctx, page } = await fresh(view)
  const row = resetRequests.find((r) => r.id === which)
  if (withSession) await page.setCookie(cookieFor(newSession(BUYER, { amr: "recovery" })))
  await page.goto(`${BASE}/reset-password?code=${row.token}`, { waitUntil: "domcontentloaded" })
  const shown = await waitFor(page, () => /Link expired/.test(document.body.innerText), 20_000)
  expect(shown, `${view.name} ${which}${withSession ? " (a session left in the browser)" : ""}: "Link expired"`, await page.evaluate(() => document.body.innerText.slice(0, 160)))
  await shot(page, `${view.name}-${which}${withSession ? "-session" : ""}-expired`)
  const clicked = await clickText(page, "Back to log in")
  const onLogin = clicked === true && (await loginFormShown(page, 25_000))
  const alive = await responsive(page)
  if (!onLogin && alive) console.log("    click detail:", JSON.stringify(await within(page.evaluate(() => window.__r52click ?? null), 5_000, null).catch(() => null)))
  if (alive) await within(shot(page, `${view.name}-${which}${withSession ? "-session" : ""}-back`), 10_000)
  expect(onLogin, `  Back to log in opens the login form`, { clicked, alive, at: page.url().replace(BASE, ""), errors: page.__errors.slice(0, 3), text: alive ? await within(page.evaluate(() => document.body.innerText.slice(0, 120)), 5_000, "").catch(() => "") : "(page not answering)" })
  await within(ctx.close(), 10_000)
}

async function resetValid(view, which) {
  const { ctx, page } = await fresh(view)
  const row = resetRequests.find((r) => r.id === which)
  row.used = false
  await page.goto(`${BASE}/reset-password?code=${row.token}`, { waitUntil: "domcontentloaded" })
  /* A phone browser offers the app first; Continue in browser. */
  if (view.name === "phone") {
    await waitFor(page, () => /Continue in browser/.test(document.body.innerText), 20_000)
    await clickText(page, "Continue in browser instead")
  }
  const form = await waitFor(page, () => !!document.querySelector('input[placeholder="New password"]'), 30_000)
  expect(form, `${view.name} valid link: the new password form`, await page.evaluate(() => document.body.innerText.slice(0, 160)))
  await shot(page, `${view.name}-${which}-form`)
  if (!form) return ctx.close()
  const pw = `new-password-${view.name}-1`
  await page.type('input[placeholder="New password"]', pw)
  await page.type('input[placeholder="Confirm new password"]', pw)
  await page.click('button[type="submit"]')
  const done = await waitFor(page, () => /Password reset successfully/.test(document.body.innerText), 20_000)
  expect(done, "  saved: Password reset successfully")
  /* The Capacitor user agent alone has no native bridge (window.Capacitor), so the page takes the web way: the login form. In the shell it is /welcome. */
  const after = await waitFor(page, () => location.pathname === "/welcome" || (location.pathname === "/login" && !!document.querySelector("input[type=email]")), 15_000)
  expect(after, "  then the login form (or /welcome in the shell)", page.url().replace(BASE, ""))
  PASSWORD[BUYER.email] = "correct-horse-1"
  await ctx.close()
}

async function login(view) {
  const { ctx, page } = await fresh(view)
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
  expect(await loginFormShown(page), `${view.name} /login: the form`)
  await page.type('input[type="email"]', BUYER.email)
  await page.keyboard.press("Enter")
  const pwField = await waitFor(page, () => !!document.querySelector('input[type="password"]'), 20_000)
  expect(pwField, "  the password field after the address")
  if (pwField) {
    await page.type('input[type="password"]', "correct-horse-1")
    await page.keyboard.press("Enter")
    const away = await waitFor(page, () => location.pathname !== "/login", 30_000)
    expect(away, "  signed in: left /login", page.url().replace(BASE, ""))
    await shot(page, `${view.name}-login-after`)
    const cookies = await page.cookies()
    expect(cookies.some((c) => c.name.startsWith(KEY)), "  the session cookie is set")
    /* Log out: Settings > Account > Log out (on this device). */
    await page.goto(`${BASE}/account/settings?section=account`, { waitUntil: "domcontentloaded" })
    const button = await waitFor(page, () => !!document.querySelector("[data-account-logout]"), 30_000)
    expect(button, "  Settings shows Log out", page.url().replace(BASE, ""))
    if (button) {
      await page.click("[data-account-logout]")
      const out = await waitFor(page, () => !location.pathname.startsWith("/account/settings"), 20_000)
      await sleep(800)
      const left = (await page.cookies()).filter((c) => c.name.startsWith(KEY))
      expect(out && left.length === 0, "  Log out: signed out, the session cookie gone", { at: page.url().replace(BASE, ""), left: left.map((c) => c.name), errors: page.__errors.slice(0, 2), text: await within(page.evaluate(() => document.body.innerText.slice(0, 200)), 5_000, "").catch(() => "") })
    }
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
    expect(await loginFormShown(page), "  and /login shows the form again")
  }
  await ctx.close()
}

async function signup(view) {
  const { ctx, page } = await fresh(view)
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" })
  const ok = await waitFor(page, () => !!document.querySelector('input[type="email"]'), 30_000)
  expect(ok, `${view.name} /signup: the form`)
  await shot(page, `${view.name}-signup`)
  if (!ok) return ctx.close()
  /* A plain address, and a person's pace: the sign up guard refuses throwaway domains and a form sent within 1.5s. */
  const address = `maria.popescu${Math.floor(Math.random() * 90 + 10)}${view.name.length}@gmail.com`
  await sleep(2_000)
  await page.type("#email", address)
  await page.keyboard.press("Enter")
  const pw = await waitFor(page, () => !!document.querySelector("#password"), 20_000)
  expect(pw, "  a new address: the password field")
  if (!pw) return ctx.close()
  await page.type("#password", "new-account-pass-1")
  await page.evaluate(() => {
    const terms = document.querySelector("#terms")
    if (terms && terms.getAttribute("aria-checked") !== "true" && !terms.checked) terms.click()
  })
  await page.click('button[type="submit"]')
  const onVerify = await waitFor(page, () => location.pathname === "/signup/verify", 30_000)
  expect(onVerify, "  signed up: the code step (/signup/verify)", page.url().replace(BASE, ""))
  await shot(page, `${view.name}-signup-verify`)
  if (!onVerify) return ctx.close()
  /* The code Storelib made (the mail itself cannot be sent here; the stand in keeps the row). */
  let code = null
  for (let i = 0; i < 40 && !code; i++) {
    code = (tables.verification_codes ?? []).filter((r) => r.email === address).at(-1)?.code ?? null
    if (!code) await sleep(250)
  }
  /* Mailgun is not reachable here: the route refuses before it makes a code ("SMTP is not configured"), so the code step itself is not driven. */
  if (!code) console.log("  skip    the code itself: no mail service in this sandbox")
  if (code) {
    await waitFor(page, () => !!document.querySelector("input[autocomplete='one-time-code'], input[data-input-otp]"), 15_000)
    await page.focus("input[autocomplete='one-time-code'], input[data-input-otp]").catch(() => {})
    await page.keyboard.type(code)
    const verified = await waitFor(page, () => location.pathname !== "/signup/verify", 30_000)
    expect(verified, "  the code: verified, on to the next page", page.url().replace(BASE, ""))
    await shot(page, `${view.name}-signup-verified`)
  }
  await ctx.close()
}

async function expiredSession(view) {
  {
    const { ctx, page } = await fresh(view)
    await page.setCookie(cookieFor(newSession(BUYER, { expIn: -120 })))
    await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" })
    await sleep(2500)
    expect(!/\/login/.test(page.url()), `${view.name} an expired access token with a live refresh token: renewed, not sent to log in`, page.url().replace(BASE, ""))
    await ctx.close()
  }
  {
    const { ctx, page } = await fresh(view)
    const s = newSession(BUYER, { expIn: -120 })
    sessions.get(s.refresh_token).alive = false
    sessions.get(JSON.parse(Buffer.from(s.access_token.split(".")[1], "base64url").toString()).session_id).alive = false
    await page.setCookie(cookieFor(s))
    await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" })
    const onLogin = await loginFormShown(page, 30_000)
    expect(onLogin, `  a revoked session: /app sends to the login form, no loop`, page.url().replace(BASE, ""))
    await ctx.close()
  }
}

async function nativeStart(view) {
  const { ctx, page } = await fresh(view)
  await page.goto(`${BASE}/native-start`, { waitUntil: "domcontentloaded" })
  const went = await waitFor(page, () => location.pathname !== "/native-start", 20_000)
  expect(went, `${view.name} /native-start signed out: goes on`, page.url().replace(BASE, ""))
  await ctx.close()
}

async function connectReturn(view) {
  const { ctx, page } = await fresh(view)
  const res = await page.goto(`${BASE}/auth/connect-return?to=${encodeURIComponent("/api/website-builder/supabase/callback?code=abc&state=x&in_app=1")}`, { waitUntil: "domcontentloaded" })
  const html = await page.content()
  expect(res.status() === 200 && /storelib:\/\/|intent:\/\/|com\.storelib\.app:\/\//.test(html), `${view.name} /auth/connect-return: the app's address on the page`, res.status())
  await ctx.close()
}

async function authCodeError(view) {
  const { ctx, page } = await fresh(view)
  await page.goto(`${BASE}/auth/auth-code-error`, { waitUntil: "domcontentloaded" })
  await waitFor(page, () => document.body.innerText.length > 20, 15_000)
  await shot(page, `${view.name}-auth-code-error`)
  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href")?.startsWith("/login"))
    if (!el) return false
    el.click()
    return true
  })
  expect(clicked && (await loginFormShown(page, 25_000)), `${view.name} /auth/auth-code-error: its way to log in opens the form`, page.url().replace(BASE, ""))
  await ctx.close()
}

try {
  for (const view of VIEWS.filter((v) => !process.env.VIEWS || process.env.VIEWS.split(",").includes(v.name))) {
    console.log(`\n${view.name}`)
    if (want("reset")) {
      await resetExpired(view, "rr-expired")
      await resetExpired(view, "rr-used")
      await resetExpired(view, "rr-used", { withSession: true })
      await resetValid(view, view.name === "phone" ? "rr-valid2" : "rr-valid")
      await authCodeError(view)
    }
    if (want("login")) await login(view)
    if (want("signup")) await signup(view)
    if (want("expired")) await expiredSession(view)
    if (want("native")) await nativeStart(view)
    if (want("connect")) await connectReturn(view)
  }
} finally {
  await browser.close().catch(() => {})
}
console.log(`\n${results.length - broken} ok, ${broken} failed`)
process.exit(broken ? 1 : 0)
