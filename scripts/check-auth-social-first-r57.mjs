/**
 * ===========================================================================
 *  LOG IN AND SIGN UP: GOOGLE AND APPLE FIRST, THEN "OR", THEN THE EMAIL FORM
 * ===========================================================================
 * Round 57. The owner: "put Continue with Google and Continue with Apple at
 * the top of the login and signup pages instead of the bottom".
 *
 * `next dev` of this checkout against the stand in Supabase, signed out, at
 * 360, 390, 768 and 1280 wide. For /login, /signup and the two with a next=
 * carried, it reads from the real page:
 *
 *   ORDER    top edges of Google, Apple, the OR divider, Email and Continue
 *   SHIFT    the layout shift total from navigation to settled, and Google's
 *            and the heading's position at first paint against 2s later
 *   FOCUS    Tab from the top: the order the controls take focus, which has
 *            to be the order they are drawn in
 *   NAMES    the accessible names Chromium gives the two buttons, the email
 *            field and the submit button
 *   APPLE    Apple's button against Google's: the same height, width, type
 *            size and weight (Apple's HIG: at least as prominent)
 *   CARRY    Google's and Apple's press goes to the provider with the next=
 *            kept: the redirect_to of the authorize request the page makes
 *
 *   node scripts/check-auth-social-first-r57.mjs               # starts next dev
 *   BASE=http://localhost:3000 node scripts/check-auth-social-first-r57.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-auth-social-first-r57.mjs
 *   BUNDLER=--webpack   when node_modules is a symlink out of the tree (Turbopack refuses it)
 *   EXPECT=old   only measures (the order before r57), for the before numbers
 */
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const STUB_PORT = Number(process.env.STUB_PORT || 54571)
const PORT = Number(process.env.PORT || 3957)
const BASE = (process.env.BASE || `http://localhost:${PORT}`).replace(/\/$/, "")
const NEXT_BIN = process.env.NEXT_BIN || "node_modules/next/dist/bin/next"
const SHOTS = process.env.SHOTS_DIR || null
const TAG = process.env.TAG || "after"
const EXPECT_OLD = process.env.EXPECT === "old"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const results = []
const expect = (pass, name, detail) => {
  if (!pass) failures++
  console.log(`  ${pass ? "ok  " : "FAIL"} ${name}${detail !== undefined ? `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
}

let stub = null
let next = null
if (!process.env.BASE) {
  stub = await serveSupabaseStub({ port: STUB_PORT, tables: {}, users: [] })
  const env = {
    ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "probe-anon-key", SUPABASE_SERVICE_ROLE_KEY: "probe-service-role-key-long-enough",
    STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: BASE,
  }
  next = spawn(process.execPath, ["--max-old-space-size=6144", NEXT_BIN, "dev", process.env.BUNDLER || "--turbopack", "-p", String(PORT), "-H", "localhost"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  next.stdout.on("data", (d) => { out += d })
  next.stderr.on("data", (d) => { out += d })
  if (process.env.NEXT_LOG) { const { appendFileSync } = await import("node:fs"); next.stdout.on("data", (d) => appendFileSync(process.env.NEXT_LOG, d)); next.stderr.on("data", (d) => appendFileSync(process.env.NEXT_LOG, d)) }
  let up = false
  for (let i = 0; i < 400 && !up; i++) {
    await sleep(1500)
    up = await fetch(`${BASE}/robots.txt`).then((r) => r.status > 0).catch(() => false)
  }
  if (!up) { console.error(`next dev did not come up\n${out.slice(-3000)}`); process.exit(1) }
  process.on("exit", () => { next?.kill(); stub?.server?.close?.() })
}

const PAGES = ["/login", "/signup", "/login?next=%2Fmaria%2Ffilm-presets", "/signup?next=%2Fmaria%2Ffilm-presets"]
for (const p of PAGES) {
  const t0 = Date.now()
  const r = await fetch(`${BASE}${p}`).catch((e) => ({ status: String(e) }))
  console.log(`  warm ${p} ${r.status} ${Date.now() - t0}ms`)
}

const VIEWS = [
  { name: "360", vp: { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: "390", vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: "768", vp: { width: 768, height: 1024, deviceScaleFactor: 2 } },
  { name: "1280", vp: { width: 1280, height: 800, deviceScaleFactor: 2 } },
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, timeout: 180_000, protocolTimeout: 240_000, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/* Collected in the page from the first byte: every layout shift, and where Google and the heading first drew. */
const OBSERVER = `(() => {
  window.__cls = 0
  window.__shifts = []
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue
        window.__cls += e.value
        window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime) })
      }
    }).observe({ type: "layout-shift", buffered: true })
  } catch {}
  const first = () => {
    const g = [...document.querySelectorAll("button")].find((b) => /Continue with Google|Connecting/.test(b.textContent || ""))
    const h = document.querySelector("h1")
    if (g && h && !window.__first) window.__first = { g: g.getBoundingClientRect().top + scrollY, h: h.getBoundingClientRect().top + scrollY }
    if (!window.__first) requestAnimationFrame(first)
  }
  requestAnimationFrame(first)
})()`

const READ = () => {
  const btn = (re) => [...document.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim()))
  const google = btn(/^Continue with Google$/)
  const apple = btn(/^Continue with Apple$/)
  const submit = document.querySelector('form button[type="submit"]')
  const email = document.getElementById("email")
  const orText = [...document.querySelectorAll("span")].find((s) => (s.textContent || "").trim().toUpperCase() === "OR")
  const or = orText?.parentElement
  const top = (el) => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : null)
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, fw: cs.fontWeight, bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, radius: cs.borderTopLeftRadius, opacity: cs.opacity }
  }
  return {
    top: { google: top(google), apple: top(apple), or: top(or), email: top(email), submit: top(submit), h1: top(document.querySelector("h1")) },
    google: box(google),
    apple: box(apple),
    gaps: google && apple && or && email ? { googleToApple: Math.round(apple.getBoundingClientRect().top - google.getBoundingClientRect().bottom), appleToOr: Math.round(or.getBoundingClientRect().top - apple.getBoundingClientRect().bottom), orToEmail: Math.round(email.getBoundingClientRect().top - or.getBoundingClientRect().bottom) } : null,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    first: window.__first || null,
    cls: +(window.__cls || 0).toFixed(4),
    shifts: window.__shifts || [],
  }
}

const describe = () => {
  const el = document.activeElement
  if (!el || el === document.body) return "body"
  if (el.id === "email") return "email"
  if (el.id === "password") return "password"
  if (el.id === "terms") return "terms"
  const text = (el.textContent || "").trim()
  if (/^Continue with Google$/.test(text)) return "google"
  if (/^Continue with Apple$/.test(text)) return "apple"
  if (el.matches('form button[type="submit"]')) return "submit"
  if (el.tagName === "A") return `link:${el.getAttribute("href")}`
  return `${el.tagName.toLowerCase()}:${text.slice(0, 24)}`
}

for (const view of VIEWS) {
  for (const path of PAGES) {
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    await page.setViewport(view.vp)
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)))
    await page.setCookie({ name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE })
    await page.evaluateOnNewDocument(OBSERVER)
    const label = `${view.name} ${path}`
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 180_000 })
    await page.waitForSelector("#email", { timeout: 60_000 })
    await sleep(2000)
    const m = await page.evaluate(READ)
    const t = m.top
    const socialFirst = t.google < t.apple && t.apple < t.or && t.or < t.email && t.email < t.submit
    const oldOrder = t.email < t.submit && t.submit < t.or && t.or < t.google && t.google < t.apple
    console.log(`\n${label}`)
    console.log(`  tops ${JSON.stringify(t)}  gaps ${JSON.stringify(m.gaps)}`)
    if (EXPECT_OLD) expect(oldOrder, `${label}: the order before r57 (email, Continue, OR, Google, Apple)`, t)
    else expect(socialFirst, `${label}: Google, Apple, OR, Email, Continue from the top`, t)
    expect(m.scrollWidth <= m.innerWidth, `${label}: no sideways scroll`, `${m.scrollWidth} <= ${m.innerWidth}`)
    expect(m.cls < 0.01, `${label}: layout shift total under 0.01`, { cls: m.cls, shifts: m.shifts })
    const moved = m.first ? { google: Math.round(t.google - m.first.g), h1: Math.round(t.h1 - m.first.h) } : null
    expect(!!moved && moved.google === 0 && moved.h1 === 0, `${label}: Google and the heading where they first drew, 2s later`, moved)
    expect(!!m.apple && !!m.google && m.apple.h >= m.google.h && m.apple.w >= m.google.w && m.apple.fs === m.google.fs && Number(m.apple.fw) >= Number(m.google.fw) && m.apple.bg === m.google.bg && m.apple.color === m.google.color && m.apple.border === m.google.border,
      `${label}: Apple at least as prominent as Google (size, type, colours)`, { apple: m.apple, google: m.google })

    /* Focus: Tab from the document's start, the first ten stops. */
    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0) })
    const stops = []
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab")
      stops.push(await page.evaluate(describe))
    }
    const at = (k) => stops.indexOf(k)
    const focusOk = at("google") >= 0 && at("google") < at("apple") && at("apple") < at("email") && at("email") < at("submit")
    if (!EXPECT_OLD) expect(focusOk, `${label}: Tab goes Google, Apple, Email, Continue, the drawn order`, stops)
    else console.log(`  focus ${JSON.stringify(stops)}`)

    /* Names, as the accessibility tree has them. */
    const snap = await page.accessibility.snapshot({ interestingOnly: true })
    const flat = []
    const walk = (n) => { if (!n) return; flat.push({ role: n.role, name: n.name }); (n.children || []).forEach(walk) }
    walk(snap)
    const named = (role, name) => flat.some((n) => n.role === role && n.name === name)
    expect(named("button", "Continue with Google") && named("button", "Continue with Apple") && named("textbox", "Email") && named("button", "Continue"),
      `${label}: screen reader names: Continue with Google, Continue with Apple, Email, Continue`, flat.filter((n) => ["button", "textbox"].includes(n.role)).map((n) => `${n.role}:${n.name}`))
    const axOrder = flat.filter((n) => ["button", "textbox"].includes(n.role)).map((n) => n.name)
    if (!EXPECT_OLD) expect(axOrder.indexOf("Continue with Google") < axOrder.indexOf("Email") && axOrder.indexOf("Continue with Apple") < axOrder.indexOf("Email"), `${label}: the reading order has the two buttons before the email field`, axOrder)
    expect(errors.length === 0, `${label}: no page errors`, errors)

    if (SHOTS && !path.includes("next=")) {
      await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0) })
      await sleep(200)
      const file = join(SHOTS, `${TAG}-${path.replace(/\W+/g, "") || "root"}-${view.name}.png`)
      await page.screenshot({ path: file, fullPage: view.vp.width < 1000 })
      console.log(`  shot ${file}`)
    }
    results.push({ view: view.name, path, ...m, stops, axOrder })

    /* Carry: the press goes through /auth/start with the next= on it, and that hop sets the carry cookie /auth/continue reads (web path; the native plugin paths are not in a browser). */
    if (path.includes("next=") && !EXPECT_OLD) {
      for (const provider of ["google", "apple"]) {
        const ctx2 = await browser.createBrowserContext()
        const p2 = await ctx2.newPage()
        await p2.setViewport(view.vp)
        await p2.setCookie({ name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE })
        await p2.setRequestInterception(true)
        let start = null
        let authorize = null
        p2.on("request", (req) => {
          const u = req.url()
          if (u.includes("/auth/start")) start = start || u
          if (/\/auth\/v1\/authorize|accounts\.google\.com|appleid\.apple\.com/.test(u)) {
            authorize = authorize || u
            return req.respond({ status: 200, contentType: "text/html", body: "<p>provider</p>" })
          }
          return req.continue()
        })
        await p2.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 180_000 })
        await p2.waitForSelector("#email")
        const name = provider === "google" ? "Continue with Google" : "Continue with Apple"
        await p2.evaluate((n) => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === n)?.click(), name)
        for (let i = 0; i < 60 && !authorize; i++) await sleep(250)
        const su = start ? new URL(start) : null
        const carryCookie = (await p2.cookies(BASE)).find((c) => c.name === "storelib_auth_carry")
        expect(!!su && su.searchParams.get("provider") === provider && /film-presets/.test(su.searchParams.get("next") || ""), `${label}: ${name} goes to /auth/start with provider and next=`, start)
        expect(!!authorize && new URL(authorize).searchParams.get("provider") === provider, `${label}: and on to the ${provider} authorize`, authorize)
        expect(!!carryCookie && /film-presets/.test(decodeURIComponent(carryCookie.value)), `${label}: the carry cookie holds the page to come back to`, carryCookie ? carryCookie.value.slice(0, 80) : null)
        await ctx2.close()
      }
    }
    await ctx.close()
  }
}

await browser.close()
if (process.env.JSON_OUT) writeFileSync(process.env.JSON_OUT, JSON.stringify(results, null, 2))
console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`)
next?.kill()
process.exit(failures === 0 ? 0 : 1)
