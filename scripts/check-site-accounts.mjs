/**
 * ===========================================================================
 *  THE ACCOUNT, SIGN IN, WISHLIST, CONTACT AND SHOP PAGES, USED
 * ===========================================================================
 * tests/account-sections.test.ts proves the markup. This is the other half:
 * whether a visitor can use it. Each page is drawn on the server the way a
 * website draws it (scripts/prerender-site-accounts.tsx), served from a
 * local origin, hydrated in Chromium (scripts/render-site-accounts.tsx) and
 * driven at a phone and a desktop width, on a light theme and a dark one:
 *
 *   shop       a heart saves a product without following the card's link,
 *              and the header's count, localStorage and the cookie the server
 *              reads all agree
 *   wishlist   the saved cards show, removing one hides it, removing the
 *              last shows the empty state
 *   contact    what is posted is what was typed, with the consent box as the
 *              visitor left it and the timing the server checks
 *   login      the two links go through Storelib and come back
 *   account    orders, saved items and a sign out that is a POST
 *
 * and measured on the way: horizontal overflow, layout shift, long tasks at
 * a phone's CPU (4x slower), the slowest frame while a heart is toggled, and
 * any error the page threw. A guest must not call the account API at all.
 *
 *   node scripts/check-site-accounts.mjs      (SHOTS=<dir> to keep pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? ""
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "site-navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "site-link.jsx"), `import React from "react"\nexport default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : String(href && href.pathname || "#"), ...rest }, children) }\n`)
writeFileSync(join(stubs, "site-image.jsx"), `import React from "react"\nexport default function Image({ src, alt, ...rest }) { const { fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...ok } = rest; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...ok }) }\n`)
writeFileSync(join(stubs, "site-supabase.js"), `export function createClient() { throw new Error("a website page must not open a Supabase client") }\n`)
writeFileSync(join(stubs, "site-empty.js"), `export {}\n`)
/* The engine's compiler hashes source with node:crypto; the Next build
   supplies a browser version, and this stands in for it. A page that is
   served prerendered never compiles, so the value is never compared. */
writeFileSync(join(stubs, "site-crypto.js"), `export function createHash() { let h = 2166136261; const self = { update(s) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return self }, digest() { return (h >>> 0).toString(16).padStart(8, "0").repeat(8) } }; return self }\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-site-accounts-"))
const aliases = [
  `--alias:next/navigation=${join(stubs, "site-navigation.js")}`, `--alias:next/link=${join(stubs, "site-link.jsx")}`,
  `--alias:next/image=${join(stubs, "site-image.jsx")}`, `--alias:@/lib/supabase/client=${join(stubs, "site-supabase.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
]

/* The server's half: every page drawn as a website draws it. */
const server = join(out, "prerender.cjs")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/prerender-site-accounts.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${server}`,
  '--define:process.env.NODE_ENV="production"', `--alias:server-only=${join(stubs, "site-empty.js")}`, ...aliases],
  { stdio: ["ignore", "ignore", "inherit"] })
const fixtures = join(out, "pages")
execFileSync("node", [server], { env: { ...process.env, OUT_DIR: fixtures, NODE_ENV: "production" }, stdio: ["ignore", "ignore", "inherit"] })

/* The browser's half: the same client code a website ships. */
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-site-accounts.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--minify", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  `--alias:node:crypto=${join(stubs, "site-crypto.js")}`, ...aliases],
  { stdio: ["ignore", "ignore", "inherit"] })

const css = await appCss(root)
/* Inter from the build, served from this origin: a page on http may not
   read file:// URLs. Only the files the stylesheet names are served. */
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = `/media/${fontFiles.size}.woff2`
  fontFiles.set(name, path)
  return `url(${name})`
})
const js = readFileSync(bundle)
const pages = Object.fromEntries(readdirSync(fixtures).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(fixtures, f), "utf8"))]))

const PERF = `
window.__perf = { longtasks: [], cls: 0, shifts: 0, errors: [] };
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { window.__perf.longtasks.push(Math.round(e.duration)) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) { window.__perf.cls += e.value; window.__perf.shifts++ } }) }).observe({ type: "layout-shift", buffered: true }) } catch (e) {}
`

function html(p) {
  const probe = JSON.stringify({ template: p.template, prerendered: p.prerendered, props: p.props }).replace(/</g, "\\u003c")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0}</style></head>
<body><div id="app">${p.ssr}</div><script>window.__PROBE__=${probe}</script><script src="/probe.js"></script></body></html>`
}

const posts = []
const outside = []
const accountCalls = []
const http = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return }
  if (url.pathname === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(js); return }
  if (fontFiles.has(url.pathname)) { res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(fontFiles.get(url.pathname))); return }
  if (url.pathname.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      if (url.pathname === "/api/website-builder/contact") {
        posts.push({ at: Date.now(), body: JSON.parse(raw || "{}"), origin: req.headers.origin ?? null, type: req.headers["content-type"] ?? null })
        setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, subscribed: false })) }, 180)
        return
      }
      if (url.pathname.startsWith("/api/site-account")) accountCalls.push(`${req.method} ${url.pathname}`)
      res.writeHead(404, { "content-type": "application/json" }); res.end("{}")
    })
    return
  }
  const key = url.pathname.slice(1).replace("/", "-")
  const p = pages[key]
  if (!p) { res.writeHead(404); res.end("no page"); return }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(html(p))
})
await new Promise((r) => http.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${http.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const report = {}

const VIEWPORTS = [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
]
const THEMES = ["storelib-default", "studio-noir"]
const CREATOR = "11111111-1111-4111-8111-111111111111"
const STORE_KEY = `storelib:wishlist:${CREATOR}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })

async function open(theme, key, viewport, label, seed = null) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text().slice(0, 200)) })
  /* Which resource, rather than the console's "a resource". */
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().replace(base, "")}`) })
  page.on("requestfailed", (r) => { if (r.url().startsWith(base)) errors.push(`failed ${r.url().replace(base, "")}`) })
  await page.setRequestInterception(true)
  /* Nothing leaves the machine: a font from a CDN is not what is measured. */
  page.on("request", (r) => {
    if (r.url().startsWith(base) || r.url().startsWith("data:")) return r.continue()
    /* A theme's Google Fonts stylesheet answers empty: the fallback face
       is measured, and the page is not told a request failed. */
    if (r.url().startsWith("https://fonts.googleapis.com/")) return r.respond({ status: 200, contentType: "text/css", body: "" })
    outside.push(r.url().slice(0, 80))
    return r.abort()
  })
  await page.evaluateOnNewDocument(PERF)
  if (seed) await page.evaluateOnNewDocument(`try { localStorage.setItem(${JSON.stringify(STORE_KEY)}, ${JSON.stringify(JSON.stringify(seed))}) } catch (e) {}`)
  if (label === "390") await page.emulateCPUThrottling(4)
  const started = Date.now()
  await page.goto(`${base}/${theme}/${key}`, { waitUntil: "load" })
  await page.waitForFunction("window.__HYDRATED__ === true", { timeout: 15000 })
  await wait(400)
  const loadMs = Date.now() - started
  if (label === "390") await page.emulateCPUThrottling(1)
  const shape = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight,
    cls: Math.round(window.__perf.cls * 10000) / 10000,
    longtasks: window.__perf.longtasks.slice(),
  }))
  return { page, errors, shape, loadMs }
}

async function shoot(page, name) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true })
}

/** The slowest frame while `act` runs and for `ms` after. */
async function framesDuring(page, act, ms = 500) {
  await page.evaluate((ms) => {
    window.__frames = []
    let last = performance.now()
    const end = last + ms
    const tick = (t) => { window.__frames.push(t - last); last = t; if (t < end) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }, ms)
  const work = await act()
  await wait(ms + 100)
  return page.evaluate((work) => ({ worst: Math.round(Math.max(0, ...window.__frames)), frames: window.__frames.length, slow: window.__frames.map((f, i) => [i, Math.round(f)]).filter(([, f]) => f > 20), work: typeof work === "number" ? Math.round(work * 10) / 10 : null }), work ?? null)
}

const hearts = (page) => page.evaluate(() => [...document.querySelectorAll("[data-storelib-wishlist]")].map((b) => b.getAttribute("aria-pressed")))
const store = (page) => page.evaluate((k) => ({ local: JSON.parse(localStorage.getItem(k) || "[]"), cookie: (document.cookie.split("; ").find((c) => c.startsWith("sl_wishlist=")) || "").slice(12) }), STORE_KEY)
/**
 * Where a visitor reads the count. On a desktop, the header's heart. On a
 * phone the header row keeps menu, logo, search and bag, as the themes
 * always had it, and the heart with its count is at the foot of the menu:
 * so the menu is opened, read where a thumb would find it, pictured, and
 * closed again. A link in a closed menu is off screen and does not count.
 */
async function savedCount(page, label, shot = "") {
  const read = () => page.evaluate((phone) => {
    const inMenu = (x) => !!x.closest('[role="dialog"]')
    const a = [...document.querySelectorAll('a[href="/wishlist"]')].find((x) => {
      const r = x.getBoundingClientRect()
      return inMenu(x) === phone && r.width > 0 && r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight
    })
    return a ? `${a.getAttribute("aria-label")} / badge ${a.querySelector("span[aria-hidden]")?.textContent ?? "none"}` : null
  }, label === "390")
  if (label !== "390") return read()
  await page.evaluate(() => document.querySelector('button[aria-label="Open menu"]').click())
  await wait(600)
  const got = await read()
  if (SHOTS && shot) await page.screenshot({ path: join(SHOTS, `${shot}.png`) })
  await page.keyboard.press("Escape")
  await wait(500)
  return got
}

try {
  for (const theme of THEMES) {
    for (const [label, viewport] of VIEWPORTS) {
      const at = `${theme} ${label}`
      console.log(`\n${at}`)

      /* ── Shop: a heart on every product card ─────────────────────────── */
      {
        const { page, errors, shape, loadMs } = await open(theme, "shop", viewport, label)
        await shoot(page, `${theme}-shop-${label}`)
        const before = await hearts(page)
        expect(before.length === 4 && before.every((v) => v === "false"), `shop: four hearts, none pressed`, JSON.stringify(before))
        const url = page.url()
        /* The page doing nothing first, so a slow frame is not blamed on a heart. */
        const idle = await framesDuring(page, async () => {})
        const frames = await framesDuring(page, () => page.evaluate(() => { const t = performance.now(); document.querySelectorAll("[data-storelib-wishlist]")[1].click(); return performance.now() - t }))
        const after = await hearts(page)
        const saved = await store(page)
        expect(after[1] === "true" && after.filter((v) => v === "true").length === 1, `shop: the second heart is pressed and only that one`, JSON.stringify(after))
        expect(page.url() === url, `shop: saving did not follow the card's link`, page.url())
        expect(saved.local.length === 1 && saved.cookie === saved.local[0], `shop: localStorage and the cookie the server reads agree`, JSON.stringify(saved))
        const count = await savedCount(page, label, `${theme}-shop-menu-${label}`)
        expect(/1 saved \/ badge 1$/.test(count ?? ""), `shop: the ${label === "390" ? "menu" : "header"} says one is saved`, String(count))
        const handle = await page.$$("[data-storelib-wishlist]")
        const box = await handle[1].boundingBox()
        expect(box && box.width >= 36 && box.height >= 36, `shop: the heart is a 36px target or larger`, JSON.stringify(box))
        await page.evaluate(() => document.querySelectorAll("[data-storelib-wishlist]")[1].click())
        await wait(150)
        const cleared = await store(page)
        expect(cleared.local.length === 0 && cleared.cookie === "", `shop: pressing it again takes it back off`, JSON.stringify(cleared))
        expect(shape.overflow <= 0, `shop: no sideways scroll`, `${shape.overflow}px`)
        expect(errors.length === 0, `shop: no errors`, errors.join(" | "))
        report[`${at} shop`] = { ...shape, loadMs, toggleFrames: frames, idleFrames: idle }
        await page.close()
      }

      /* ── The control: the theme's own home page ──────────────────────── */
      {
        const { page, errors, shape, loadMs } = await open(theme, "home", viewport, label)
        expect(errors.length === 0, `home (control): no errors`, errors.join(" | "))
        report[`${at} home (control)`] = { ...shape, loadMs }
        await page.close()
      }

      /* ── Wishlist: three saved as a guest ────────────────────────────── */
      {
        const seed = pages[`${theme}-wishlist`].seed
        const { page, errors, shape, loadMs } = await open(theme, "wishlist", viewport, label, seed)
        await shoot(page, `${theme}-wishlist-${label}`)
        const shown = () => page.evaluate(() => [...document.querySelectorAll("[data-storelib-wishlist-card]")].filter((c) => !c.hidden && c.offsetParent !== null).length)
        const empty = () => page.evaluate(() => { const e = document.querySelector("[data-storelib-wishlist-empty]"); return !!e && !e.hidden && e.offsetParent !== null })
        expect((await shown()) === 3, `wishlist: the three saved cards show`, String(await shown()))
        const three = await savedCount(page, label)
        expect(/3 saved \/ badge 3$/.test(three ?? ""), `wishlist: the ${label === "390" ? "menu" : "header"} counts three`, String(three))
        const frames = await framesDuring(page, () => page.evaluate(() => { const t = performance.now(); document.querySelector("[data-storelib-wishlist]").click(); return performance.now() - t }))
        expect((await shown()) === 2, `wishlist: removing one hides its card`, String(await shown()))
        expect((await store(page)).local.length === 2, `wishlist: and forgets it`, JSON.stringify(await store(page)))
        await page.evaluate(() => [...document.querySelectorAll("[data-storelib-wishlist]")].filter((b) => b.getAttribute("aria-pressed") === "true").forEach((b) => b.click()))
        await wait(200)
        expect((await shown()) === 0 && (await empty()), `wishlist: removing the last shows the empty state`, `${await shown()} cards, empty ${await empty()}`)
        await shoot(page, `${theme}-wishlist-empty-${label}`)
        const note = await page.evaluate(() => !!document.querySelector('a[href="/account/login"]'))
        expect(note, `wishlist: a guest is told they can sign in to keep it`)
        expect(shape.overflow <= 0, `wishlist: no sideways scroll`, `${shape.overflow}px`)
        expect(errors.length === 0, `wishlist: no errors`, errors.join(" | "))
        report[`${at} wishlist`] = { ...shape, loadMs, toggleFrames: frames }
        await page.close()
      }

      /* ── Contact ─────────────────────────────────────────────────────── */
      {
        const { page, errors, shape, loadMs } = await open(theme, "contact", viewport, label)
        await shoot(page, `${theme}-contact-${label}`)
        const tick = theme === "studio-noir"
        const sentBefore = posts.length
        await page.type('form[data-storelib-form="contact"] input[name="name"]', "Sam Carter")
        await page.type('form[data-storelib-form="contact"] input[name="email"]', "sam@example.com")
        await page.type('form[data-storelib-form="contact"] textarea[name="message"]', "Is the apron available in blue?")
        if (tick) await page.click('form[data-storelib-form="contact"] input[name="consent"]')
        const trap = await page.evaluate(() => {
          const t = document.querySelector('input[name="company"]')
          /* What is painted is the wrapper's clip: one pixel, clipped away, transparent. */
          const w = t.closest("[aria-hidden=true]")
          const r = w.getBoundingClientRect()
          const cs = getComputedStyle(w)
          const painted = r.width > 1 || r.height > 1 || (cs.opacity !== "0" && cs.clipPath === "none")
          return { tab: t.tabIndex, visible: painted, hidden: !!w, box: [Math.round(r.width), Math.round(r.height)], clip: cs.clipPath, opacity: cs.opacity }
        })
        expect(!trap.visible && trap.tab === -1 && trap.hidden, `contact: the trap field is out of sight, reach and the reading order`, JSON.stringify(trap))
        await wait(2600)
        await page.click('form[data-storelib-form="contact"] [type="submit"]')
        await page.waitForFunction(() => { const s = document.querySelector("[data-storelib-success]"); return s && !s.hidden }, { timeout: 5000 }).catch(() => {})
        const sent = posts.slice(sentBefore)
        const body = sent[0]?.body ?? {}
        expect(sent.length === 1, `contact: one message posted`, String(sent.length))
        expect(body.name === "Sam Carter" && body.email === "sam@example.com" && body.message === "Is the apron available in blue?", `contact: what was typed is what was sent`, JSON.stringify(body))
        expect(body.consent === tick, `contact: consent is ${tick} because the box was ${tick ? "ticked" : "left alone"}`, String(body.consent))
        expect(body.company === "" && body.elapsed >= 2500 && body.page === "contact" && body.creator_id === CREATOR, `contact: the empty trap, the time taken, the page and the store`, JSON.stringify({ company: body.company, elapsed: body.elapsed, page: body.page }))
        expect(sent[0]?.type?.startsWith("application/json"), `contact: posted as JSON`, String(sent[0]?.type))
        const done = await page.evaluate(() => { const s = document.querySelector("[data-storelib-success]"); return s && !s.hidden ? s.textContent.trim() : null })
        expect(!!done, `contact: the visitor is told it was sent`, String(done))
        await shoot(page, `${theme}-contact-sent-${label}`)
        expect(shape.overflow <= 0, `contact: no sideways scroll`, `${shape.overflow}px`)
        expect(errors.length === 0, `contact: no errors`, errors.join(" | "))
        report[`${at} contact`] = { ...shape, loadMs }
        await page.close()
      }

      /* ── Sign in ─────────────────────────────────────────────────────── */
      {
        const { page, errors, shape, loadMs } = await open(theme, "login", viewport, label)
        await shoot(page, `${theme}-login-${label}`)
        const links = await page.evaluate(() => [...document.querySelectorAll(".s__btn")].map((a) => a.getAttribute("href")))
        expect(links[0] === "/api/site-account/start?return=%2Faccount", `login: Sign in goes through Storelib and back to the account`, JSON.stringify(links))
        expect(links[1] === "/api/site-account/start?return=%2Faccount&mode=signup", `login: Create account does the same, starting at sign up`, JSON.stringify(links))
        expect(shape.overflow <= 0, `login: no sideways scroll`, `${shape.overflow}px`)
        expect(errors.length === 0, `login: no errors`, errors.join(" | "))
        report[`${at} login`] = { ...shape, loadMs }
        await page.close()
      }

      /* ── Account ─────────────────────────────────────────────────────── */
      {
        const { page, errors, shape, loadMs } = await open(theme, "account", viewport, label)
        await shoot(page, `${theme}-account-${label}`)
        const acct = await page.evaluate(() => ({
          who: document.querySelector(".acct__who")?.textContent.trim(),
          orders: document.querySelectorAll(".order").length,
          go: [...document.querySelectorAll(".order__go")].map((a) => a.textContent.trim()),
          saved: document.querySelectorAll(".saved .card").length,
          out: (() => { const f = document.querySelector("form.acct__out"); return f ? `${f.method} ${f.getAttribute("action")}` : null })(),
        }))
        expect(/Alex/.test(acct.who ?? ""), `account: greets the visitor by name`, String(acct.who))
        expect(acct.orders === 2 && acct.go.join() === "Download,Receipt", `account: two orders, a download and a receipt`, JSON.stringify(acct))
        expect(acct.saved === 2, `account: saved items`, String(acct.saved))
        expect(acct.out === "post /account/logout", `account: sign out is a POST`, String(acct.out))
        expect(shape.overflow <= 0, `account: no sideways scroll`, `${shape.overflow}px`)
        expect(errors.length === 0, `account: no errors`, errors.join(" | "))
        report[`${at} account`] = { ...shape, loadMs }
        await page.close()
      }
    }
  }
  expect(accountCalls.length === 0, `a guest never called the account API`, accountCalls.join(", "))

  /* ── The other widths: nothing wider than the screen ─────────────────── */
  console.log("\nother widths")
  for (const width of [360, 430, 1280, 1920]) {
    const viewport = width < 600 ? { width, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width, height: 900, deviceScaleFactor: 1 }
    const wide = []
    for (const theme of THEMES) {
      for (const key of ["shop", "wishlist", "contact", "login", "account"]) {
        const seed = key === "wishlist" ? pages[`${theme}-wishlist`].seed : null
        const { page, errors, shape } = await open(theme, key, viewport, String(width), seed)
        if (shape.overflow > 0 || errors.length) wide.push(`${theme} ${key}: ${shape.overflow}px ${errors.join(" | ")}`)
        await page.close()
      }
    }
    expect(wide.length === 0, `${width}: every page fits, without errors`, wide.join("; "))
  }
} finally {
  await browser.close()
  http.close()
}

console.log("\nMeasurements (overflow px, page height, CLS, long tasks ms at 4x CPU on 390, load ms, slowest toggle frame ms)")
for (const [k, v] of Object.entries(report)) {
  console.log(`  ${k.padEnd(36)} overflow ${String(v.overflow).padStart(4)}  h ${String(v.height).padStart(5)}  cls ${v.cls}  long [${v.longtasks.join(",")}]  load ${v.loadMs}${v.toggleFrames ? `  click ${v.toggleFrames.work}ms  frame ${v.toggleFrames.worst} (${v.toggleFrames.frames}) slow ${JSON.stringify(v.toggleFrames.slow)}` : ""}${v.idleFrames ? `  idle ${v.idleFrames.worst} slow ${JSON.stringify(v.idleFrames.slow)}` : ""}`)
}
console.log(`\nclient bundle ${Math.round(js.length / 1024)} KB minified (the whole page, React included)`)
if (outside.length) console.log(`requests that would have left the machine: ${[...new Set(outside)].join(", ")}`)
if (broken) fail(`${broken} check(s) failed.`)
console.log("\nAll checks passed.")
