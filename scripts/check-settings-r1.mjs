/**
 * ===========================================================================
 *  SETTINGS, ROUND R1: MEASURED IN CHROMIUM AT 1440 AND AT 390
 * ===========================================================================
 * The real Settings in the real sheet (scripts/render-settings-r1.tsx), every
 * /api answered by stubs here, the router and Supabase stubbed. What it reads:
 *
 * THE SHEET AT 1440
 *   a section pressed from far down   the new section is painted at the top
 *                                     in the frame it first appears, within
 *                                     160ms of the press; after that
 *                                     nothing moves (its top, the column, the
 *                                     handle strip), no layout shift
 *   AI Memory                         typing and Remember adds the memory;
 *                                     the sheet stays, nothing is saved or
 *                                     refreshed, no navigation; the box is wide
 *   unsaved changes                   close asks (Keep editing keeps it up,
 *                                     Discard closes with one Back), another
 *                                     section asks, Save saves then switches
 *   Integrations                      a card pushes its page in (transform
 *                                     moves from the right, opacity from 0),
 *                                     the page has its header, status and
 *                                     action; Back pops the list in from the
 *                                     left and the scroll glides, only ever
 *                                     up, to the list's top; a category press
 *                                     keeps the pills where they are
 *   Plan                              a centred "Plans and pricing"
 *
 * THE PAGE AT 390 (with a keyboard where it matters: the probe's own
 * visualViewport, shrunk as a keyboard would)
 *   the scroll does not rubber band   overscroll-behavior-y none
 *   pills                             a press replaces no pill, never fades
 *                                     or hides a pill's words or icon, and
 *                                     no animation runs inside a pill
 *   the save bar                      the last card clears it
 *   Create channel, Request           the app's bottom sheet (on the body,
 *   integration                       above the page), and with the keyboard
 *                                     up the field typed in and the button are
 *                                     both above it
 *   leaving with changes              the nav pill's link and Back both ask;
 *                                     Discard goes where it was going
 *   Activity                          every pill shows its rows, or its empty
 *                                     card, on the frame after the press;
 *                                     never a blank frame
 *   Store details                     opened after the prefetch, it draws at
 *                                     once, with no placeholder frame
 *
 *   node scripts/check-settings-r1.mjs        (SHOTS=/dir for screenshots, CPU_SLOWDOWN=4 for a phone's speed)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || null
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".settings-r1-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => window.__path
export const useSearchParams = () => new URLSearchParams(location.search)
const router = { push(h) { window.__nav.push.push(h) }, replace(h) { window.__nav.replace.push(h) }, prefetch() {}, refresh() { window.__nav.refresh++ }, back() { window.__nav.back++ } }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => { window.__nav.saves++; return q }, rpc: async () => ({ data: false, error: null }), storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-r1.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={back:0,push:[],replace:[],refresh:0,saves:0};window.__path="/app/settings"</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

/* ── The API ── */
const day = (h) => new Date(Date.now() - h * 3600_000).toISOString()
const ACTIVITY = [
  { id: 3, createdAt: day(1), actor: "person", action: "product.price", subjectType: "product", subjectId: "p1", subjectLabel: "Honey", meta: {} },
  { id: 2, createdAt: day(2), actor: "person", action: "order.fulfilled", subjectType: "order", subjectId: "o1", subjectLabel: "#1001", meta: {} },
  { id: 1, createdAt: day(30), actor: "person", action: "settings.taxes", subjectType: null, subjectId: null, subjectLabel: null, meta: {} },
]
let memories = [{ id: "m1", content: "Prices in euros", source: "creator", createdAt: day(5) }]
const asked = []
const free = { id: "free", name: "Free", price_cents: 0, billing_period: null, features: [] }
function answer(method, url, body) {
  const path = url.split("?")[0]
  const q = new URLSearchParams(url.split("?")[1] || "")
  if (path === "/api/ai-memory" && method === "POST") {
    const m = { id: `m${memories.length + 1}`, content: body.content, source: "creator", createdAt: new Date().toISOString() }
    memories = [m, ...memories]
    return { memory: m }
  }
  if (path === "/api/ai-memory") return { memories, ready: true }
  if (path === "/api/store/activity") {
    const g = q.get("group")
    const pre = { products: "product.", orders: "order.", files: "file.", settings: "settings." }[g]
    return { entries: ACTIVITY.filter((e) => !pre || e.action.startsWith(pre)), more: false, missing: false }
  }
  if (path === "/api/store/channels" && method === "GET") return { channels: [{ kind: "storefront", id: null, name: "Online store", description: null, enabled: true, off: 0 }], defaultKey: null, ready: true }
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
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      let body = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { /* none */ }
      asked.push(`${req.method} ${req.url}`)
      const out = answer(req.method, req.url, body)
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, 90)
    })
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

/* A keyboard: the probe's own visualViewport, so its height can be shrunk the way a keyboard shrinks it. */
const SETUP = () => {
  const t = new EventTarget()
  window.__vvH = null
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    /* Getters defined on it, not copied (Object.assign would read them once, at load). */
    value: Object.defineProperties(t, {
      height: { get: () => window.__vvH ?? window.innerHeight },
      width: { get: () => window.innerWidth },
      offsetTop: { value: 0 }, offsetLeft: { value: 0 }, pageTop: { value: 0 }, pageLeft: { value: 0 }, scale: { value: 1 },
    }),
  })
  window.__keyboard = (h) => { window.__vvH = h ? window.innerHeight - h : null; t.dispatchEvent(new Event("resize")) }
  window.__shift = 0
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift", buffered: true }) } catch { /* none */ }
  history.back = ((orig) => function () { window.__nav.back++; return orig.call(history) })(history.back)
}

async function open(width, height, touch) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, isMobile: !!touch, hasTouch: !!touch })
  const errors = []
  page.on("pageerror", (e) => { errors.push(String(e)); if (process.env.DEBUG) console.log("PAGEERROR", String(e).slice(0, 400)) })
  await page.evaluateOnNewDocument(SETUP)
  await page.goto(`${base}/app/settings`)
  await page.waitForSelector("[data-settings-panel]")
  await wait(900)
  /* CPU_SLOWDOWN=4: a phone's speed, for the timings (the thresholds are set for an unthrottled run). */
  const slow = Number(process.env.CPU_SLOWDOWN || 1)
  if (slow > 1) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: slow })
  return { page, errors }
}
const click = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error(`no ${s}`); el.click() }, sel)
/* Frames after a press: what each wants, read on every animation frame. */
async function framesAfter(page, press, read, ms = 700) {
  await page.evaluate(`window.__read = ${read.toString()}`)
  await page.evaluate(() => {
    window.__f = []
    window.__clickAt = -1
    document.addEventListener("click", () => { if (window.__f && window.__clickAt < 0) window.__clickAt = window.__f.length }, { capture: true, once: true })
    window.__t0 = performance.now()
    /* One loop per recording: an older one stops when a new one starts. */
    const gen = (window.__gen = (window.__gen || 0) + 1)
    const tick = () => { if (!window.__f || gen !== window.__gen) return; window.__f.push({ t: performance.now() - window.__t0, ...window.__read() }); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  await press()
  await wait(ms)
  return page.evaluate(() => { const f = window.__f; window.__f = null; f.clickAt = window.__clickAt; return { frames: f, clickAt: window.__clickAt } }).then(({ frames, clickAt }) => Object.assign(frames, { clickAt }))
}

/* ═════════════════════════ 1440: THE SHEET ═════════════════════════ */
{
  console.log("\n1440: the sheet")
  const { page, errors } = await open(1440, 900, false)
  const SCROLL = "[data-settings-sheet-scroll]"

  console.log("\n  a section pressed from far down")
  for (const tab of ["security", "notifications", "store", "domains"]) {
    await click(page, '[data-settings-side-tab="general"]')
    await wait(500)
    const from = await page.evaluate((s) => { const el = document.querySelector(s); el.scrollTop = el.scrollHeight; return el.scrollTop }, SCROLL)
    await wait(150)
    const shift0 = await page.evaluate(() => window.__shift)
    const f = await framesAfter(page, () => click(page, `[data-settings-side-tab="${tab}"]`), () => {
      const s = document.querySelector("[data-settings-sheet-scroll]")
      const p = document.querySelector("[data-settings-panel]")
      const nav = document.querySelector("[data-settings-groups]")
      const strip = document.querySelector("[data-settings-sheet-handle]")
      const top = (el) => (el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null)
      return { tab: p?.getAttribute("data-settings-panel"), scroll: Math.round(s.scrollTop), panel: top(p), nav: top(nav), strip: top(strip) }
    }, 650)
    const first = f.findIndex((x) => x.tab === tab)
    const after = first >= 0 ? f.slice(first) : []
    const still = after.every((x) => x.panel === after[0].panel && x.scroll === after[0].scroll && x.nav === after[0].nav && x.strip === after[0].strip)
    const beforeMoves = f.slice(0, Math.max(0, first)).some((x) => x.scroll !== from)
    const shift = (await page.evaluate(() => window.__shift)) - shift0
    console.log(`    ${tab}: from ${from}px, new section on frame ${first} (${first >= 0 ? Math.round(f[first].t) : "never"}ms), scroll then ${after[0]?.scroll}, still after: ${still}, layout shift ${shift.toFixed(4)}`)
    /* The glide it replaced swapped the section in 400 to 470ms after the press (check-settings-sheet-desktop.mjs before round R1). */
    say(first >= 0 && f[first].t <= 160, `${tab}: the new section shows within 160ms of the press`)
    /*
      Changed on purpose (round 20, the owner: "when I click in the sidebar, it should auto scroll up smoothly, clean"):
      the section is painted just above its top in its first frame and glides up to it, only up; the handle strip never
      moves (scripts/check-settings20.mjs measures the glide, the column and the title frame by frame).
    */
    const glide = after.every((x, i) => i === 0 || (x.scroll <= after[i - 1].scroll && x.strip === after[0].strip)) && after[after.length - 1]?.scroll === 0
    say(after[0]?.scroll !== undefined && after[0].scroll <= 400, `${tab}: painted just above its top in its first frame (${after[0]?.scroll}px)`)
    say(glide, `${tab}: then up to the top and only up; the handle strip holds still`)
    say(!beforeMoves, `${tab}: the old section never rides the scroll before the swap`)
    say(shift < 0.001, `${tab}: no layout shift`)
  }

  console.log("\n  AI Memory")
  await click(page, '[data-settings-side-tab="ai_memory"]')
  await page.waitForSelector("[data-ai-memory-input]")
  await wait(300)
  const navBefore = await page.evaluate(() => JSON.stringify(window.__nav))
  const savesBefore = await page.evaluate(() => window.__nav.saves)
  await page.focus("[data-ai-memory-input]")
  await page.keyboard.type("Keep product names short")
  const wide = await page.evaluate(() => {
    const i = document.querySelector("[data-ai-memory-input]").getBoundingClientRect()
    const card = document.querySelector('[data-account-panel="ai-memory"]').getBoundingClientRect()
    return { input: Math.round(i.width), card: Math.round(card.width), h: Math.round(i.height) }
  })
  await click(page, "[data-ai-memory-remember]")
  await wait(500)
  const after = await page.evaluate(() => ({ sheet: !!document.querySelector("[data-settings-sheet]"), rows: [...document.querySelectorAll("[data-ai-memory]")].map((n) => n.textContent), nav: window.__nav }))
  console.log(`    box ${wide.input}px of a ${wide.card}px card, ${wide.h}px tall; rows now ${after.rows.length}; nav ${JSON.stringify(after.nav)}`)
  say(after.sheet, "Remember leaves the sheet up")
  say(after.rows.some((r) => r.includes("Keep product names short")), "the memory is added to the list")
  say(after.nav.saves === savesBefore && after.nav.refresh === JSON.parse(navBefore).refresh && after.nav.back === 0 && after.nav.push.length === 0, "nothing is saved to the profile, refreshed or navigated")
  say(wide.input >= wide.card - 80 && wide.h >= 60, "the box takes the card's width and a few lines")
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r1-ai-memory-1440.png` })
  /* Enter keeps it too. */
  await page.focus("[data-ai-memory-input]")
  await page.keyboard.type("Ship on Mondays")
  await page.keyboard.press("Enter")
  await wait(400)
  say(await page.evaluate(() => [...document.querySelectorAll("[data-ai-memory]")].some((n) => n.textContent.includes("Ship on Mondays")) && !!document.querySelector("[data-settings-sheet]")), "Enter keeps it and the sheet stays")

  console.log("\n  unsaved changes")
  await click(page, '[data-settings-side-tab="general"]')
  await wait(400)
  await page.focus("#firstName")
  await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control")
  await page.keyboard.type("Mara Lindqvist")
  await wait(200)
  await click(page, "[data-settings-sheet-close]")
  await wait(300)
  let st = await page.evaluate(() => ({ dialog: !!document.querySelector("[data-settings-leave-guard]"), sheet: !!document.querySelector("[data-settings-sheet]"), back: window.__nav.back }))
  say(st.dialog && st.sheet, `close asks first, and the sheet stays (${JSON.stringify(st)})`)
  await click(page, "[data-leave-keep]")
  await wait(250)
  st = await page.evaluate(() => ({ dialog: !!document.querySelector("[data-settings-leave-guard]"), name: document.querySelector("#firstName").value }))
  say(!st.dialog && st.name === "Mara Lindqvist", `Keep editing keeps what was typed (${JSON.stringify(st)})`)
  await click(page, '[data-settings-side-tab="security"]')
  await wait(250)
  st = await page.evaluate(() => ({ dialog: !!document.querySelector("[data-settings-leave-guard]"), tab: document.querySelector("[data-settings-panel]").getAttribute("data-settings-panel") }))
  say(st.dialog && st.tab === "general", "another section asks first")
  const saves0 = await page.evaluate(() => window.__nav.saves)
  await click(page, "[data-leave-save]")
  await wait(700)
  st = await page.evaluate(() => ({ dialog: !!document.querySelector("[data-settings-leave-guard]"), tab: document.querySelector("[data-settings-panel]")?.getAttribute("data-settings-panel"), saves: window.__nav.saves, bar: document.querySelector("[data-settings-save-bar]")?.getAttribute("data-settings-save-bar") }))
  say(!st.dialog && st.tab === "security" && st.saves > saves0 && st.bar === "down", `Save saves, then opens the section (saves ${st.saves - saves0}, bar ${st.bar})`)
  await click(page, '[data-settings-side-tab="general"]')
  await wait(400)

  console.log("\n  Integrations")
  await click(page, '[data-settings-side-tab="integrations"]')
  await page.waitForSelector("[data-integration-card]")
  await wait(300)
  const card = await page.evaluate(() => document.querySelectorAll("[data-integration-card]")[5].getAttribute("data-integration-card"))
  await page.evaluate((s) => { const el = document.querySelector(s); el.scrollTop = 700 }, SCROLL)
  await wait(150)
  let f = await framesAfter(page, () => click(page, `[data-integration-card="${card}"]`), () => {
    const el = document.querySelector("[data-integrations]")
    const m = getComputedStyle(el).transform
    return { view: el.getAttribute("data-integrations-view"), x: m === "none" ? 0 : Math.round(new DOMMatrix(m).m41 * 10) / 10, o: Math.round(Number(getComputedStyle(el).opacity) * 100) / 100, scroll: Math.round(document.querySelector("[data-settings-sheet-scroll]").scrollTop) }
  }, 500)
  const pushed = f.filter((x) => x.view === "page")
  const xs = pushed.map((x) => x.x)
  console.log(`    push: ${pushed.length} frames, x ${xs.slice(0, 6).join(",")}..., opacity from ${pushed[0]?.o}, scroll ${pushed[0]?.scroll} then ${pushed.at(-1)?.scroll}`)
  say(pushed.length > 0 && xs[0] > 2 && xs.at(-1) === 0 && xs.every((x, i) => i === 0 || x <= xs[i - 1] + 0.1), "the page pushes in from the right, only ever towards rest")
  say(pushed[0]?.o < 0.6 && pushed.at(-1)?.o === 1, "and fades in")
  say(pushed.every((x) => x.scroll === pushed[0].scroll), "the page is placed once and does not scroll after it appears")
  const head = await page.evaluate(() => ({ header: !!document.querySelector("[data-integration-header] [data-integration-mark], [data-integration-header] img, [data-integration-header] span"), standing: document.querySelector("[data-integration-standing]")?.textContent, action: document.querySelector("[data-integration-action]")?.textContent, setup: !!document.querySelector("[data-integration-install] input, [data-integration-install] button") }))
  console.log(`    header: standing "${head.standing}", action "${head.action}"`)
  say(head.header && !!head.standing && head.setup, "the page has its header with the mark, where it stands, and a setup card with its controls")
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r1-integration-page-1440.png` })
  await page.evaluate((s) => { document.querySelector(s).scrollTop = 900 }, SCROLL)
  await wait(200)
  f = await framesAfter(page, () => click(page, "[data-integration-back]"), () => {
    const el = document.querySelector("[data-integrations]")
    const s = document.querySelector("[data-settings-sheet-scroll]")
    const m = getComputedStyle(el).transform
    return { view: el.getAttribute("data-integrations-view"), x: m === "none" ? 0 : Math.round(new DOMMatrix(m).m41 * 10) / 10, scroll: Math.round(s.scrollTop), listTop: Math.round(el.getBoundingClientRect().top - s.getBoundingClientRect().top) }
  }, 1300)
  const popped = f.filter((x) => x.view === "list")
  const sc = popped.map((x) => x.scroll)
  const end = popped.at(-1)
  console.log(`    pop: x from ${popped[0]?.x}, scroll ${sc[0]} -> ${end?.scroll} over ${new Set(sc).size} positions, list top at ${end?.listTop}px in the scroll`)
  say(popped.length > 0 && popped[0].x < -2 && end.x === 0, "the list pops in from the left")
  say(sc.every((y, i) => i === 0 || y <= sc[i - 1]) && new Set(sc).size >= 6, "the scroll glides up over several frames, never down")
  say(end && end.listTop >= 0 && end.listTop <= 24, "and ends at the top of the list")
  /* A category press keeps the pills in place. */
  /* Scrolled so the pills are in view part way down the screen, as after reading the first rows. */
  await page.evaluate((s) => { const box = document.querySelector(s); const row = document.querySelector("[data-integration-pills]"); box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - 140 }, SCROLL)
  await wait(150)
  const pillsBefore = await page.evaluate(() => Math.round(document.querySelector("[data-integration-pills]").getBoundingClientRect().top))
  const cat = await page.evaluate(() => [...document.querySelectorAll("[data-integration-pills] button")].at(-1).textContent)
  f = await framesAfter(page, () => page.evaluate(() => [...document.querySelectorAll("[data-integration-pills] button")].at(-1).click()), () => ({ pills: Math.round(document.querySelector("[data-integration-pills]").getBoundingClientRect().top), cards: document.querySelectorAll("[data-integration-card]").length, o: Number(getComputedStyle(document.querySelector("[data-integration-card]")?.parentElement ?? document.body).opacity) }), 500)
  const pillTops = [...new Set(f.map((x) => x.pills))]
  console.log(`    category "${cat}": pills at ${pillsBefore} then ${pillTops.join(",")}, cards ${f[0].cards} -> ${f.at(-1).cards}, first card opacity ${f.slice(0, 4).map((x) => x.o.toFixed(2)).join(",")}`)
  say(pillTops.length === 1 && Math.abs(pillTops[0] - pillsBefore) <= 1, "the pills stay where they are on screen")
  say(f.some((x) => x.o < 0.95) && f.at(-1).o === 1, "the cards settle in rather than pop")

  console.log("\n  Plan")
  await click(page, '[data-settings-side-tab="billing"]')
  await page.waitForSelector("[data-plans-header]", { timeout: 4000 }).catch(() => null)
  const plan = await page.evaluate(() => { const h = document.querySelector("[data-plans-header]"); if (!h) return null; const r = h.querySelector("h2").getBoundingClientRect(); const p = document.querySelector("[data-plan-cards]").getBoundingClientRect(); return { text: h.querySelector("h2").textContent, align: getComputedStyle(h).textAlign, centre: Math.round(r.left + r.width / 2), cards: Math.round(p.left + p.width / 2) } })
  console.log(`    ${JSON.stringify(plan)}`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r1-plan-1440.png` })
  say(!!plan && plan.text === "Plans and pricing" && plan.align === "center" && Math.abs(plan.centre - plan.cards) <= 2, "a centred Plans and pricing over the cards")

  say(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`)
  await page.close()
}

/* ═════════════════════════ 390: THE PAGE ═════════════════════════ */
{
  console.log("\n390: the page")
  const { page, errors } = await open(390, 844, true)
  if (process.env.DEBUG) console.log(await page.evaluate(() => {
    const out = { iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, wide: [] }
    for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.right > 395 && r.width > 0) out.wide.push(el.tagName + "." + String(el.className).slice(0, 60) + " " + Math.round(r.right)) }
    out.wide = out.wide.slice(0, 12)
    return JSON.stringify(out)
  }))
  const SCROLL = "[data-settings-sheet-scroll]"
  const ob = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).overscrollBehaviorY, SCROLL)
  say(ob === "none", `the page's scroll does not rubber band (overscroll-behavior-y ${ob})`)

  console.log("\n  pills")
  await page.evaluate(() => {
    window.__removed = 0
    new MutationObserver((l) => { for (const m of l) for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches?.("[data-settings-tab]") || n.querySelector?.("[data-settings-tab]"))) window.__removed++ }).observe(document.querySelector("[data-settings-tabs]"), { childList: true, subtree: true })
  })
  let worst = { hidden: 0, anim: 0 }
  for (const tab of ["security", "privacy", "billing", "store", "channels", "general"]) {
    const box = await page.evaluate((t) => { const r = document.querySelector(`[data-settings-tab="${t}"]`); r.scrollIntoView({ inline: "center" }); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }, tab)
    await wait(350)
    const f = await framesAfter(page, () => page.touchscreen.tap(box.x, box.y), () => {
      const pills = [...document.querySelectorAll("[data-settings-tab]")]
      let hidden = 0
      for (const p of pills) {
        for (const el of [p.querySelector("svg"), p.querySelector("span")]) {
          const cs = getComputedStyle(el)
          if (!el || cs.visibility === "hidden" || Number(cs.opacity) < 1 || el.getBoundingClientRect().width === 0) hidden++
        }
      }
      const anim = document.getAnimations().filter((a) => { const t = a.effect?.target; return t && t.closest?.("[data-settings-tab]") && t !== t.closest("[data-settings-tab]") }).length
      const on = document.querySelector("[data-settings-tab][aria-selected=true]")?.getAttribute("data-settings-tab")
      return { hidden, anim, on, panel: document.querySelector("[data-settings-panel]")?.getAttribute("data-settings-panel") }
    }, 500)
    const hid = Math.max(...f.map((x) => x.hidden)), an = Math.max(...f.map((x) => x.anim))
    worst = { hidden: Math.max(worst.hidden, hid), anim: Math.max(worst.anim, an) }
    const c = Math.max(0, f.clickAt)
    const onAt = f.findIndex((x) => x.on === tab) - c, panelAt = f.findIndex((x) => x.panel === tab) - c
    console.log(`    ${tab}: (frames counted from the click) pill on at frame ${onAt}, section at frame ${panelAt}, words or icons not fully drawn on any frame: ${hid}, animations inside a pill: ${an}`)
    say(onAt >= 0 && onAt <= 1 && panelAt >= 0 && panelAt <= 8, `${tab}: the pill fills on the next frame and the section follows`)
  }
  const removed = await page.evaluate(() => window.__removed)
  say(removed === 0, `no pill is ever taken out of the page (${removed})`)
  say(worst.hidden === 0, "a pill's words and icon are fully drawn on every frame")
  say(worst.anim === 0, "nothing inside a pill is ever animated (no layer for WebKit to lift the words onto)")

  console.log("\n  the save bar")
  await page.evaluate(() => document.querySelector('[data-settings-tab="general"]').click())
  await wait(400)
  await page.evaluate(() => { const i = document.querySelector("#city"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "Malmo"); i.dispatchEvent(new Event("input", { bubbles: true })) })
  await wait(500)
  await page.evaluate((s) => { const el = document.querySelector(s); el.scrollTop = el.scrollHeight }, SCROLL)
  await wait(300)
  const bar = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-settings-panel] > div > div")]
    const last = cards.at(-1).getBoundingClientRect()
    const b = document.querySelector('[data-settings-save-bar="up"] [role=region]').getBoundingClientRect()
    const nav = document.querySelector("[data-fake-nav]").getBoundingClientRect()
    return { last: Math.round(last.bottom), bar: Math.round(b.top), barBottom: Math.round(b.bottom), nav: Math.round(nav.top) }
  })
  console.log(`    last card ends at ${bar.last}px, the bar spans ${bar.bar} to ${bar.barBottom}px, the nav pill starts at ${bar.nav}px`)
  say(bar.last <= bar.bar - 8, "the last card clears the save bar")
  say(bar.barBottom <= bar.nav - 4, "the bar clears the nav pill")
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r1-save-bar-390.png` })

  console.log("\n  leaving with changes")
  await page.evaluate(() => document.querySelector("[data-fake-nav-link]").click())
  await wait(400)
  let st = await page.evaluate(() => ({ dialog: !!document.querySelector("[data-settings-leave-guard]"), sheet: !!document.querySelector("[data-settings-leave-guard]")?.closest("[data-sheet-panel]"), push: window.__nav.push.slice(), href: location.pathname }))
  say(st.dialog && st.sheet && st.push.length === 0 && st.href === "/app/settings", "the nav pill's link asks first, in a bottom sheet, and goes nowhere yet")
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r1-leave-guard-390.png` })
  await page.evaluate(() => document.querySelector("[data-leave-keep]").click())
  await wait(500)
  await page.evaluate(() => history.back())
  await wait(500)
  st = await page.evaluate(() => ({ dialog: !!document.querySelector("[data-settings-leave-guard]"), href: location.pathname }))
  say(st.dialog && st.href === "/app/settings", "Back asks first and stays on Settings")
  await page.evaluate(() => document.querySelector("[data-leave-keep]").click())
  await wait(500)
  await page.evaluate(() => document.querySelector("[data-fake-nav-link]").click())
  await wait(400)
  await page.evaluate(() => document.querySelector("[data-leave-discard]").click())
  await wait(500)
  st = await page.evaluate(() => ({ push: window.__nav.push.slice(), city: document.querySelector("#city")?.value, bar: document.querySelector("[data-settings-save-bar]")?.getAttribute("data-settings-save-bar") }))
  say(st.push.at(-1) === "/app/products" && st.city === "" && st.bar === "down", `Discard puts the fields back and goes where it was going (${JSON.stringify(st)})`)

  console.log("\n  sheets and the keyboard")
  for (const [tab, opener, field, button] of [["integrations", "[data-request-integration]", "#request-name", "Send request"], ["channels", "[data-create-channel]", "#channel-name", "Create channel"]]) {
    await page.evaluate((t) => document.querySelector(`[data-settings-tab="${t}"]`).click(), tab)
    await page.waitForSelector(opener)
    await wait(300)
    if (process.env.DEBUG) console.log("before open", await page.evaluate(() => JSON.stringify({ iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, wide: [...document.querySelectorAll("body *")].filter((el) => { const r = el.getBoundingClientRect(); return r.right > 395 && r.width > 0 && !el.closest("[data-settings-tabs]") }).slice(0, 8).map((el) => el.tagName + "." + String(el.className).slice(0, 70) + " " + Math.round(el.getBoundingClientRect().right)) })))
    await click(page, opener)
    await wait(600)
    if (process.env.DEBUG) console.log("after open", await page.evaluate(() => JSON.stringify({ iw: innerWidth, ih: innerHeight })))
    const where = await page.evaluate((f) => { const el = document.querySelector(f); const panel = el?.closest("[data-sheet-panel]"); return { inSheet: !!panel, onBody: !!panel && panel.closest("[data-sheet-root]")?.parentElement === document.body, z: panel ? Number(getComputedStyle(panel.closest("[data-sheet-root]")).zIndex) : 0 } }, field)
    say(where.inSheet && where.onBody && where.z > 55, `${tab}: the form is the app's bottom sheet, on the body, above the page and the pill (z ${where.z})`)
    await page.focus(field)
    if (process.env.DEBUG) console.log("after focus", await page.evaluate(() => JSON.stringify({ iw: innerWidth, ih: innerHeight, vv: window.visualViewport.height, kb: getComputedStyle(document.documentElement).getPropertyValue("--kb-inset") })))
    await page.evaluate(() => window.__keyboard(336))
    await wait(700)
    const kb = await page.evaluate(([f, b]) => {
      const vis = window.visualViewport.height
      const fr = document.querySelector(f).getBoundingClientRect()
      const btn = [...document.querySelectorAll("[data-sheet-panel] button")].find((x) => x.textContent.trim() === b)?.getBoundingClientRect()
      return { vis: Math.round(vis), field: Math.round(fr.bottom), fieldTop: Math.round(fr.top), button: btn ? Math.round(btn.bottom) : null }
    }, [field, button])
    console.log(`    ${tab}: keyboard up, visible to ${kb.vis}px: field ${kb.fieldTop}-${kb.field}px, "${button}" ends at ${kb.button}px`)
    say(kb.field <= kb.vis && kb.fieldTop >= 0, `${tab}: the field typed into is above the keyboard`)
    say(kb.button !== null && kb.button <= kb.vis, `${tab}: and so is "${button}"`)
    await page.keyboard.type("Klaviyo")
    say(await page.evaluate((f) => document.querySelector(f).value === "Klaviyo", field), `${tab}: typing reaches the field`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/r1-${tab}-sheet-keyboard-390.png` })
    await page.evaluate(() => window.__keyboard(0))
    await page.evaluate(() => document.querySelector("[data-sheet-panel] [data-close]").click())
    await wait(600)
  }

  console.log("\n  Activity")
  await page.evaluate(() => document.querySelector('[data-settings-tab="activity"]').click())
  await page.waitForSelector("[data-activity-filters]")
  await wait(400)
  for (const [i, name] of [[1, "products"], [2, "orders"], [4, "files"], [3, "settings"], [0, "all"]]) {
    const f = await framesAfter(page, () => page.evaluate((n) => document.querySelectorAll("[data-activity-filters] button")[n].click(), i), () => ({ rows: document.querySelectorAll("[data-activity]").length, empty: !!document.querySelector("[data-activity-empty]"), busy: !!document.querySelector("[data-activity-loading]") }), 400)
    const blank = f.slice(1).filter((x) => !x.rows && !x.empty).length
    const firstShown = f.findIndex((x) => x.rows || x.empty)
    console.log(`    ${name}: shown from frame ${firstShown}, rows ${f.at(-1).rows}, empty card ${f.at(-1).empty}, blank or loading frames ${blank}`)
    say(firstShown >= 0 && firstShown <= 2 && blank === 0, `${name}: shown at once, never blank`)
  }

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/r1-activity-390.png` })
  if (SHOTS) {
    await page.evaluate(() => document.querySelector('[data-settings-tab="integrations"]').click())
    await page.waitForSelector("[data-integration-card]")
    await wait(300)
    await page.evaluate(() => document.querySelector("[data-integration-card]").click())
    await wait(600)
    await page.screenshot({ path: `${SHOTS}/r1-integration-page-390.png` })
    await page.evaluate(() => document.querySelector("[data-integration-back]").click())
    await wait(900)
  }
  console.log("\n  Store details")
  const f = await framesAfter(page, () => page.evaluate(() => document.querySelector('[data-settings-tab="store"]').click()), () => ({ panel: document.querySelector("[data-settings-panel]")?.getAttribute("data-settings-panel"), busy: !!document.querySelector('[data-settings-panel] [aria-busy="true"]'), ready: !!document.querySelector("[data-store-details]") }), 500)
  const at = f.findIndex((x) => x.panel === "store") - Math.max(0, f.clickAt)
  if (process.env.DEBUG) console.log(JSON.stringify(f.slice(0, 8)), f.clickAt)
  console.log(`    the section at frame ${at}, drawn whole at frame ${f.findIndex((x) => x.ready) - Math.max(0, f.clickAt)} (from the click), placeholder frames ${f.filter((x) => x.busy).length}`)
  say(at >= 0 && at <= 3 && f.filter((x) => x.busy).length === 0 && f[at + Math.max(0, f.clickAt)].ready, "Store details draws whole at once from what was fetched ahead")

  say(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`)
  await page.close()
}

await browser.close()
server.close()
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad ? 1 : 0)
