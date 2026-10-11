/**
 * ===========================================================================
 *  SETTINGS, ROUND 20, MEASURED: THE GLIDE UP AND THE SHEET THAT IS ALWAYS ONE
 * ===========================================================================
 * The real Settings in the real sheet (scripts/render-settings20.tsx) with a
 * real history, in Chromium, at 1440x900, at 2560x1440, and at 390x844
 * touch with 4x CPU.
 *
 *   A SECTION     pressed in the column while far down the longest one: the
 *                 new section on the press, never the old one riding up; it
 *                 first shows at most GLIDE_FROM_PX above its top and glides
 *                 to the top, only ever up; the title and the column come
 *                 into place with it, a little each frame, never a jump; no
 *                 frame without the section; near the top it is just there
 *   IDLE          hidden and shown, focus and blur, a token refreshed, the
 *                 clock seven hours on: one sheet, no rise replayed, no new
 *                 history entry, no load
 *   A LINK        from Settings to a section of Settings, in the sheet and in
 *                 a popover on the body: the section opens in place, no
 *                 history entry, no load
 *   CLOSE         over a second Settings entry (a push from code): one press
 *                 closes, the page under takes presses again
 *   REOPEN        the slot kept the sheet mounted (a replace off Settings):
 *                 opened again, one press closes it
 *   NO BACK       a Back that does nothing: the page under takes presses at
 *                 once and the address goes to the page under
 *   BROWSER       Back closes it, Forward brings it back, one press closes
 *
 *   node scripts/check-settings20.mjs              (SHOTS=/dir for screenshots)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".settings20-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
const router = {
  push(h) { window.__nav.push.push(h); history.pushState({}, "", h); window.__rerender?.() },
  replace(h) { window.__nav.replace.push(h); history.replaceState({}, "", h); window.__rerender?.() },
  prefetch() {}, refresh() { window.__nav.refresh++ }, back() { history.back() },
}
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest, onClick: (e) => { rest.onClick?.(e); if (e.defaultPrevented) return; e.preventDefault(); window.__nav.push.push(href); history.pushState({}, "", href); window.__rerender?.() } }, children)
}
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
const listeners = new Set()
window.__auth = (event) => { for (const f of listeners) f(event, { user: { id: "user-1" } }) }
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: (f) => { listeners.add(f); return { data: { subscription: { unsubscribe() { listeners.delete(f) } } } } }, signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings20.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={push:[],replace:[],refresh:0};window.__mounts=0;window.__cardPresses=0</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const free = { id: "free", name: "Free", price_cents: 0, billing_period: null, features: [] }
/* The answers scripts/check-settings-r1.mjs gives, so every section draws whole. */
function answer(url) {
  const path = url.split("?")[0]
  if (path === "/api/ai-memory") return { memories: [], ready: true }
  if (path === "/api/store/activity") return { entries: [], more: false, missing: false }
  if (path === "/api/store/channels") return { channels: [{ kind: "storefront", id: null, name: "Online store", description: null, enabled: true, off: 0 }], defaultKey: null, ready: true }
  if (path === "/api/store/settings") return { settings: { storeName: "Mara's", phone: null, phoneCountry: null, defaultCountry: "SE", checkout: {}, defaultSalesChannelId: null, logoUrl: null, ready: true }, detectedCountry: "SE", supportEmail: null, suggested: { storeName: "Mara", contactEmail: "maker@example.com" }, logoDefault: null }
  if (path === "/api/physical/settings") return { settings: { defaultLocationId: null }, locations: [], zones: [], packages: [], ready: true }
  if (path === "/api/physical/integrations") return { integrations: [] }
  if (path === "/api/store/integrations") return { tracking: {}, ready: true }
  if (path === "/api/store/integrations/catalog") return { overrides: [] }
  if (path === "/api/billing/overview") return { plans: [free, { id: "growth", name: "Growth", price_cents: 2990, billing_period: "month", features: [] }], subscription: null, currentPlan: free, invoices: [], paymentMethod: null }
  if (path === "/api/billing/subscription") return { currentPlan: free }
  if (path === "/api/domains") return { domains: [] }
  if (path === "/api/notifications/preferences") return { categories: [] }
  return {}
}
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const body = answer(req.url)
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 90)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"], headless: true })

let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const SHOTS = process.env.SHOTS

async function setUp({ phone, width = 1440, height = 900 }) {
  const page = await browser.newPage()
  if (phone) await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  else await page.setViewport({ width, height })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  /* A document load, not a pushState (which puppeteer also reports as a navigation). */
  let loads = 0
  page.on("load", () => loads++)
  await page.evaluateOnNewDocument(() => {
    window.__frames = null
    window.__record = () => {
      window.__frames = []
      const tick = (t) => {
        if (!window.__frames) return
        const scroller = document.querySelector("[data-settings-sheet-scroll]")
        const section = document.querySelector("[data-settings-panel]")
        const title = document.querySelector("[data-settings-header] h1")
        const nav = document.querySelector("[data-settings-groups]")
        const pills = document.querySelector("[data-settings-tabs]")
        let shown = null
        if (scroller && section) {
          const a = scroller.getBoundingClientRect(), b = section.getBoundingClientRect()
          shown = Math.round(Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)))
        }
        const top = (el) => (el && el.getClientRects().length ? Math.round(el.getBoundingClientRect().top) : null)
        window.__frames.push({ t, scroll: scroller ? Math.round(scroller.scrollTop) : null, tab: section?.getAttribute("data-settings-panel") ?? null, shown, title: top(title), nav: top(nav), pills: top(pills) })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
    window.__stop = () => { const f = window.__frames; window.__frames = null; return f }
  })
  await page.goto(`${base}/app`)
  await page.waitForFunction(() => typeof window.__open === "function")
  if (phone) { const cdp = await page.createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }) }
  page.loads = () => loads - 1
  page.errors = errors
  return page
}

const sheetCount = (page) => page.evaluate(() => document.querySelectorAll("[data-settings-sheet-root]").length)
/* The page under: does a press in the middle of it reach a card, not the sheet or its dim? */
const pressable = (page) => page.evaluate(() => {
  const el = document.elementFromPoint(innerWidth * 0.6, innerHeight * 0.55)
  return !!el && !el.closest("[data-settings-sheet-root]")
})
const settle = async (page) => { await wait(900) }

async function open(page) {
  await page.evaluate(() => window.__open())
  await page.waitForSelector("[data-settings-panel]")
  await wait(1100)
}

/* ── A SECTION, FROM FAR DOWN, ON A COMPUTER ── */
/* A computer, and a large screen, where the sheet is taller than the column needs. */
for (const [width, height, tabs] of [[1440, 900, ["billing", "checkout", "security", "domains"]], [2560, 1440, ["billing", "domains"]]]) {
  console.log(`\na computer, ${width}x${height}: a section pressed far down the longest one`)
  const page = await setUp({ phone: false, width, height })
  await open(page)
  for (const tab of tabs) {
    await page.evaluate(() => document.querySelector('[data-settings-side-tab="general"]').click())
    await wait(700)
    const from = await page.evaluate(() => { const s = document.querySelector("[data-settings-sheet-scroll]"); s.scrollTop = s.scrollHeight; return s.scrollTop })
    await wait(200)
    /* FILM=/dir: the screen as the browser paints it (its screencast), for a frame sheet. */
    let cdp = null
    const film = []
    if (process.env.FILM && tab === "billing") {
      cdp = await page.createCDPSession()
      cdp.on("Page.screencastFrame", (f) => { film.push(f.data); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 720, maxHeight: 450, everyNthFrame: 1 })
      await wait(150)
    }
    const tp = await page.evaluate((tab) => { window.__record(); const t = performance.now(); document.querySelector(`[data-settings-side-tab="${tab}"]`).click(); return t }, tab)
    await wait(1100)
    if (cdp) {
      await cdp.send("Page.stopScreencast")
      film.forEach((d, i) => writeFileSync(join(process.env.FILM, `glide-${String(i).padStart(3, "0")}.jpg`), Buffer.from(d, "base64")))
    }
    const frames = (await page.evaluate(() => window.__stop())).filter((f) => f.t >= tp)
    const swap = frames.findIndex((f) => f.tab === tab)
    const at = swap >= 0 ? frames[swap] : null
    const after = swap >= 0 ? frames.slice(swap) : []
    const ups = after.every((f, i) => i === 0 || f.scroll <= after[i - 1].scroll)
    const landed = after.find((f) => f.scroll === 0)
    const rode = frames.slice(0, Math.max(0, swap)).some((f) => f.scroll !== from)
    const blank = frames.filter((f) => f.shown !== null && f.shown < 40).length
    /* The column: where it is held while scrolled, then into its place under the title, a little each frame. */
    /* As a speed, px per ms: a frame the page's thread was late for shows a bigger step that is not a jump on screen. */
    const navSteps = after.map((f, i) => (i === 0 ? 0 : f.nav - after[i - 1].nav))
    const navRate = Math.max(0, ...after.map((f, i) => (i === 0 ? 0 : Math.abs(f.nav - after[i - 1].nav) / Math.max(16.7, f.t - after[i - 1].t))))
    const navJump = Math.max(...navSteps.map(Math.abs))
    const navAtSwap = at && swap > 0 ? at.nav - frames[swap - 1].nav : 0
    const titleIn = after.filter((f) => f.title !== null)
    const titleSteps = titleIn.map((f, i) => (i === 0 ? 0 : f.title - titleIn[i - 1].title))
    const glideMs = landed && at ? Math.round(landed.t - at.t) : null
    console.log(`    ${tab}: from ${from}px; on frame ${swap} (${at ? Math.round(at.t - tp) : "never"}ms) at scroll ${at?.scroll}; at the top ${glideMs}ms later over ${after.indexOf(landed)} frames; column step max ${navJump}px, ${navRate.toFixed(2)}px/ms (at the swap ${navAtSwap}px); frame gaps ${JSON.stringify(after.slice(1, 10).map((f, i) => Math.round(f.t - after[i].t)))}; title steps ${JSON.stringify(titleSteps.slice(1, 14))}; blank ${blank}`)
    say(swap >= 0 && at.t - tp <= 200, `${tab}: the new section shows within 200ms of the press`)
    say(!rode, `${tab}: the old section never rides the scroll before the swap`)
    say(at && at.scroll <= 200 && at.scroll > 0, `${tab}: it first shows just above its top (${at?.scroll}px), not ${from}px down and not already at 0`)
    say(ups && !!landed && glideMs !== null && glideMs <= 800, `${tab}: then glides up, only ever up, to the top within 800ms`)
    say(Math.abs(navAtSwap) <= 1, `${tab}: the column does not move in the frame the section swaps`)
    /* The browser's own smooth scroll peaks near 3.2px/ms (53px in a frame); the jump this replaced was 104px in one, 6.2px/ms. */
    say(navRate <= 3.5, `${tab}: the column comes into place no faster than the glide itself (at most ${navRate.toFixed(2)}px/ms; the one frame jump was 6.2px/ms)`)
    say(titleSteps.every((d) => d >= -1) && (titleIn.length === 0 || titleIn[titleIn.length - 1].title > 0), `${tab}: the title comes down into view, never up and away`)
    say(blank === 0, `${tab}: never a frame without the section`)
  }
  /* Near the top: no glide, just there. */
  await page.evaluate(() => document.querySelector('[data-settings-side-tab="general"]').click())
  await wait(600)
  await page.evaluate(() => { document.querySelector("[data-settings-sheet-scroll]").scrollTop = 5 })
  await wait(100)
  const tp = await page.evaluate(() => { window.__record(); const t = performance.now(); document.querySelector('[data-settings-side-tab="privacy"]').click(); return t })
  await wait(500)
  const frames = (await page.evaluate(() => window.__stop())).filter((f) => f.t >= tp)
  const first = frames.find((f) => f.tab === "privacy")
  say(!!first && first.scroll === 0, `near the top (5px) it is simply at the top in the frame it appears (${first?.scroll})`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/s20-desktop-${width}-privacy.png` })
  say(page.errors.length === 0, `no page errors${page.errors.length ? `: ${page.errors.join(" | ")}` : ""}`)
  await page.close()
}

/* ── A PHONE ── */
console.log("\na phone, 390x844 touch, 4x CPU: a pill pressed while scrolled into a section")
{
  const page = await setUp({ phone: true })
  await open(page)
  /* The pill row is not held: scrolled so the row is still in reach at the top. */
  for (const tab of ["security", "billing"]) {
    await page.evaluate(() => document.querySelector('[data-settings-tab="general"]').click())
    await wait(900)
    const from = await page.evaluate(() => { const s = document.querySelector("[data-settings-sheet-scroll]"); const row = document.querySelector("[data-settings-tabs]"); s.scrollTop = row.offsetTop + 400; return s.scrollTop })
    await wait(200)
    /* Pressed by its own handler: the row is above the screen at this scroll, as it would be after a swipe to it. */
    const tp = await page.evaluate((tab) => { window.__record(); const t = performance.now(); document.querySelector(`[data-settings-tab="${tab}"]`).click(); return t }, tab)
    await wait(1600)
    const frames = (await page.evaluate(() => window.__stop())).filter((f) => f.t >= tp)
    const swap = frames.findIndex((f) => f.tab === tab)
    const after = swap >= 0 ? frames.slice(swap) : []
    const ups = after.every((f, i) => i === 0 || f.scroll <= after[i - 1].scroll)
    const end = after[after.length - 1]
    const blank = frames.filter((f) => f.shown !== null && f.shown < 40).length
    const steps = after.map((f, i) => (i === 0 ? 0 : after[i - 1].scroll - f.scroll))
    console.log(`    ${tab}: from ${from}px; on frame ${swap} at ${after[0]?.scroll}px; ends at ${end?.scroll}px with the pills at ${end?.pills}px; scroll steps ${JSON.stringify(steps.slice(1, 16))}; blank ${blank}`)
    say(swap >= 0, `${tab}: the section swaps`)
    say(ups, `${tab}: only ever up after the swap`)
    say(!!end && end.pills !== null && end.pills >= 60 && end.pills <= 140, `${tab}: it lands with the pills at the top of the page, under the app's header (${end?.pills}px)`)
    say(blank === 0, `${tab}: never a frame without the section`)
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/s20-phone-billing.png` })
  say(page.errors.length === 0, `no page errors${page.errors.length ? `: ${page.errors.join(" | ")}` : ""}`)
  await page.close()
}

/* ── IDLE, LINKS, CLOSE, REOPEN, NO BACK, BROWSER ── */
for (const phone of [false, true]) {
  console.log(`\n${phone ? "a phone" : "a computer"}: idle, links, every way out`)
  let page = await setUp({ phone })
  await open(page)
  const len0 = await page.evaluate(() => history.length)
  const mounts0 = await page.evaluate(() => window.__mounts)

  /* IDLE */
  await page.evaluate(() => {
    const realNow = Date.now.bind(Date)
    const later = 7 * 60 * 60 * 1000
    Date.now = () => realNow() + later
    for (let i = 0; i < 4; i++) {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("blur"))
      window.dispatchEvent(new Event("pagehide"))
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("focus"))
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
    }
    window.__auth("TOKEN_REFRESHED")
    window.__auth("SIGNED_IN")
    window.__auth("TOKEN_REFRESHED")
  })
  await wait(800)
  const idle = await page.evaluate(() => ({ len: history.length, mounts: window.__mounts, anims: document.querySelector("[data-settings-sheet]")?.getAnimations().length ?? -1, path: location.pathname }))
  say((await sheetCount(page)) === 1 && idle.mounts === mounts0, `after hidden and shown four times, focus, a refreshed token, seven hours on: one sheet, never mounted again (${await sheetCount(page)} sheet, ${idle.mounts - mounts0} new mounts)`)
  say(idle.anims === 0 && idle.len === len0 && page.loads() === 0 && idle.path === "/app/settings", `no rise replayed, no history entry, no load (${idle.anims} animations, ${idle.len - len0} entries, ${page.loads()} loads)`)

  /* SKIP_LINKS=1 measures the ways out on a build where a link reloads the page (the base, for before and after). */
  if (!process.env.SKIP_LINKS) {
  /* A LINK FROM SETTINGS TO SETTINGS */
    await page.evaluate(() => {
      const a = document.createElement("a")
      a.href = "/app/settings?tab=domains"
      a.textContent = "Domains"
      a.setAttribute("data-probe-link", "")
      document.querySelector("[data-settings-content]").prepend(a)
      const b = document.createElement("a")
      b.href = "/app/settings?tab=security"
      b.setAttribute("data-probe-portal-link", "")
      b.textContent = "Security"
      b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;background:#fff;padding:4px"
      document.body.append(b)
    })
    await page.evaluate(() => document.querySelector("[data-probe-link]").click())
    await wait(700)
    let st = await page.evaluate(() => ({ len: history.length, tab: document.querySelector("[data-settings-panel]")?.getAttribute("data-settings-panel"), search: location.search, push: window.__nav.push.length }))
    say(st.tab === "domains" && st.len === len0 && page.loads() === 0, `a link in the sheet to ?tab=domains opens Domains in place: no entry, no load (${st.tab}, ${st.len - len0} entries, ${page.loads()} loads, address ${st.search})`)
    await page.evaluate(() => document.querySelector("[data-probe-portal-link]").click())
    await wait(700)
    st = await page.evaluate(() => ({ len: history.length, tab: document.querySelector("[data-settings-panel]")?.getAttribute("data-settings-panel") }))
    say(st.tab === "security" && st.len === len0 && page.loads() === 0, `a link drawn on the body (a popover) does the same (${st.tab}, ${st.len - len0} entries)`)
    await page.evaluate(() => document.querySelector("[data-probe-portal-link]")?.remove())
  }

  /* Each way out from a fresh page, so one that fails does not take the next with it. */
  let loadsBefore = 0
  const fresh = async () => {
    loadsBefore += page.loads()
    await page.close()
    page = await setUp({ phone })
    await open(page)
  }
  const close = () => page.evaluate(() => document.querySelector("[data-settings-sheet-close]").click())
  if (!phone) {
    /* CLOSE OVER A SECOND SETTINGS ENTRY (a push to Settings from code, while it is up) */
    await page.evaluate(() => history.pushState({}, "", "/app/settings?tab=privacy"))
    await close()
    await wait(1400)
    const c = await page.evaluate(() => ({ path: location.pathname, cards: window.__cardPresses }))
    const free = await pressable(page)
    say(c.path === "/app" && free, `one press of the close over a second Settings entry leaves Settings, and the page under takes presses (${c.path}, pressable ${free})`)
    await page.mouse.click(860, 495)
    await wait(100)
    say((await page.evaluate(() => window.__cardPresses)) === c.cards + 1, "a press on the page under reaches its card")

    /* REOPEN: the slot kept the sheet mounted (a replace off Settings, as the back watch's fallback does) */
    await fresh()
    /* The first close's Back goes nowhere, so the back watch replaces the address with the page under: the slot keeps the sheet. */
    await page.evaluate(() => { window.__realBack = history.back.bind(history); history.back = () => {} })
    await close()
    await wait(1600)
    await page.evaluate(() => { history.back = window.__realBack })
    const kept = await page.evaluate(() => ({ path: location.pathname, replace: window.__nav.replace.slice() }))
    console.log(`    after a Back that went nowhere: ${kept.path}, replace ${JSON.stringify(kept.replace)}`)
    await page.evaluate(() => { history.pushState({}, "", "/app/settings"); window.__rerender() })
    await wait(900)
    say((await sheetCount(page)) === 1 && (await page.evaluate(() => !document.querySelector("[data-settings-sheet-gone]"))), "closed, then shown again on the same mount: there, in view")
    await close()
    await wait(1400)
    const r = await page.evaluate(() => location.pathname)
    const rFree = await pressable(page)
    say(r === "/app" && rFree, `and one press closes it again (${r}, page under pressable ${rFree})`)

    /* NO BACK: history.back does nothing */
    await fresh()
    await page.evaluate(() => { history.back = () => {} })
    const t0 = Date.now()
    await close()
    await wait(450)
    const freeEarly = await pressable(page)
    const tEarly = Date.now() - t0
    await wait(1200)
    const nb = await page.evaluate(() => ({ path: location.pathname, replace: window.__nav.replace.slice() }))
    say(freeEarly, `a Back that does nothing: the page under takes presses once the sheet has slid away (${tEarly}ms after the press)`)
    say(nb.path === "/app" && (await sheetCount(page)) === 0, `and the address goes to the page under (${nb.path}, replace ${JSON.stringify(nb.replace)})`)

    /* TWO PRESSES */
    await fresh()
    await page.evaluate(() => { const b = document.querySelector("[data-settings-sheet-close]"); b.click(); b.click() })
    await wait(1400)
    const two = await page.evaluate(() => ({ path: location.pathname, len: history.length }))
    say(two.path === "/app" && (await pressable(page)), `a double press on the close goes Back once (${two.path})`)

    /* BROWSER BACK AND FORWARD */
    await fresh()
    await page.goBack()
    await wait(700)
    say((await sheetCount(page)) === 0 && (await pressable(page)), "the browser's Back closes it")
    await page.goForward()
    await wait(1200)
    say((await sheetCount(page)) === 1, "Forward brings it back")
    await close()
    await wait(1400)
    const f = await page.evaluate(() => location.pathname)
    say(f === "/app" && (await pressable(page)), `and one press closes it (${f})`)
  } else {
    /* A page below 1024px closes by Back, the way the app's header does. */
    await page.evaluate(() => history.pushState({}, "", "/app/settings?tab=privacy"))
    await page.evaluate(() => history.back())
    await wait(900)
    say((await page.evaluate(() => location.pathname)) === "/app/settings", "a phone: Back off a second Settings entry stays on Settings (it is a page there)")
    await page.evaluate(() => history.back())
    await wait(900)
    const p = await page.evaluate(() => location.pathname)
    say(p === "/app" && (await sheetCount(page)) === 0, `a phone: the next Back leaves Settings (${p})`)
  }
  say(loadsBefore + page.loads() === 0, `never a page load (${loadsBefore + page.loads()})`)
  const lock = await page.evaluate(() => ({ attr: document.documentElement.getAttribute("data-settings-sheet-up"), overflow: document.documentElement.style.overflow }))
  say(lock.attr === null && !lock.overflow, `nothing held on the page once closed (${JSON.stringify(lock)})`)
  say(page.errors.length === 0, `no page errors${page.errors.length ? `: ${page.errors.join(" | ")}` : ""}`)
  await page.close()
}

await browser.close()
server.close()
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad ? 1 : 0)
