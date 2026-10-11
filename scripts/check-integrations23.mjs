/**
 * ===========================================================================
 *  SETTINGS › INTEGRATIONS, ROUND 23: MEASURED IN CHROMIUM
 * ===========================================================================
 * The real directory in the real settings sheet (scripts/render-integrations23.tsx),
 * physical commerce on, every /api answered here. At 1440x900 and at 390x844
 * (touch, CPU slowed 4x unless CPU_SLOWDOWN says otherwise):
 *
 *   entering a page   the page is on screen within two frames of the press,
 *                     never moves sideways, starts at least half opaque
 *   Back (button)     the list is back within two frames, at exactly the
 *                     scroll it was left at, the card that was opened focused
 *   Back (browser)    the same, from history.back(), as a phone's Back does
 *   Printify          a key typed and Connect: Connected, where orders come
 *                     from, drafts, tracking; the key never shown again
 *   Shippo            Coming soon: no key field, Tell me when it's ready
 *
 *   node scripts/check-integrations23.mjs     (SHOTS=/dir for screenshots)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || null
const SLOW = Number(process.env.CPU_SLOWDOWN || 4)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".integrations23-probe")
mkdirSync(dir, { recursive: true })
/* useSearchParams follows the address as Next's does: pushState, replaceState and Back all re-render. */
writeFileSync(join(dir, "navigation.js"), `import { useSyncExternalStore } from "react"
const sub = (cb) => { window.addEventListener("popstate", cb); window.addEventListener("__url", cb); return () => { window.removeEventListener("popstate", cb); window.removeEventListener("__url", cb) } }
export const usePathname = () => window.__path
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => location.search, () => ""))
const router = { push(h) { window.__nav.push.push(h) }, replace(h) { window.__nav.replace.push(h) }, prefetch() {}, refresh() {}, back() { window.__nav.back++ } }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: async () => ({ data: false, error: null }), storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-integrations23.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={back:0,push:[],replace:[]};window.__path="/app/settings"</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

/* ── the API: Printify connects for real (in this stub), Shippo is Coming soon ── */
let printify = null
const keySeen = []
function integrations() {
  const one = (provider, extra = {}) => ({ provider, status: "disconnected", url: null, keyHint: null, secretHint: null, lastSyncAt: null, lastError: null, account: null, verifiedAt: null, mode: null, autoConfirm: false, webhooks: null, webhookNote: null, location: null, ...extra })
  return ["supplier_email", "custom_webhook", "printful", "printify", "gelato", "cj_dropshipping", "shipstation", "shippo", "easypost"].map((p) => (p === "printify" && printify ? one(p, printify) : one(p)))
}
function answer(method, url, body) {
  const path = url.split("?")[0]
  if (path === "/api/physical/integrations") return { integrations: integrations() }
  if (path === "/api/physical/integrations/printify" && method === "PUT") {
    if (body.disconnect) printify = null
    else if (body.apiKey) {
      keySeen.push(body.apiKey)
      printify = { status: "connected", keyHint: body.apiKey.slice(-4), account: "Mara prints", verifiedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString(), webhooks: "on", location: { id: "loc-1", name: "Printify" }, autoConfirm: false }
    } else if (typeof body.autoConfirm === "boolean" && printify) printify.autoConfirm = body.autoConfirm
    return { integrations: integrations() }
  }
  if (path === "/api/store/integrations") return { tracking: {}, ready: true }
  if (path === "/api/store/integrations/catalog") return { overrides: [] }
  if (path === "/api/store/reviews-app") return { settings: { enabled: false } }
  if (path === "/api/store/settings") return { settings: { storeName: "Mara's", checkout: {}, ready: true }, suggested: {} }
  if (path === "/api/physical/settings") return { settings: {}, locations: [], zones: [], packages: [], ready: true }
  if (path === "/api/billing/overview") return { plans: [], subscription: null, currentPlan: null, invoices: [] }
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
      const out = answer(req.method, req.url, body)
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, 120)
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
const SETUP = () => {
  for (const k of ["pushState", "replaceState"]) {
    const orig = history[k].bind(history)
    history[k] = (...a) => { const r = orig(...a); window.dispatchEvent(new Event("__url")); return r }
  }
}
const SCROLLER = "[data-settings-sheet-scroll]"
/* Polled from here rather than waitForSelector, which stalled on this busy machine with the page plainly drawn. */
async function until(page, fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await page.evaluate(fn).catch(() => false)) return
    await wait(100)
  }
  throw new Error(`timed out: ${fn.toString().slice(0, 80)}`)
}

async function frames(page, press, ms) {
  await page.evaluate(() => {
    window.__f = []
    const gen = (window.__gen = (window.__gen || 0) + 1)
    window.__t0 = performance.now()
    const tick = () => {
      if (!window.__f || gen !== window.__gen) return
      const el = document.querySelector("[data-integrations]")
      const box = document.querySelector("[data-settings-sheet-scroll]")
      const m = el ? getComputedStyle(el).transform : "none"
      window.__f.push({ t: Math.round(performance.now() - window.__t0), view: el?.getAttribute("data-integrations-view") ?? null, x: m === "none" ? 0 : Math.round(new DOMMatrix(m).m41 * 10) / 10, o: el ? Math.round(Number(getComputedStyle(el).opacity) * 100) / 100 : null, scroll: box ? Math.round(box.scrollTop) : null })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await press()
  await wait(ms)
  return page.evaluate(() => { const f = window.__f; window.__f = null; return f })
}

for (const [label, width, height, touch] of [["1440", 1440, 900, false], ["390", 390, 844, true]]) {
  console.log(`\n${label}x${height}${touch ? ", touch, CPU " + SLOW + "x" : ""}`)
  printify = null
  const page = await browser.newPage()
  await page.setViewport({ width, height, isMobile: touch, hasTouch: touch })
  const errors = []
  page.on("pageerror", (e) => { errors.push(String(e)); if (process.env.DEBUG) console.log("PAGEERROR", String(e).slice(0, 600)) })
  if (process.env.DEBUG) page.on("console", (m) => console.log("CONSOLE", m.type(), m.text().slice(0, 300)))
  await page.evaluateOnNewDocument(SETUP)
  await page.goto(`${base}/app/settings?tab=integrations`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await until(page, () => !!document.querySelector("[data-integration-card]"), 120000)
  await wait(900)
  if (touch && SLOW > 1) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: SLOW })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/i23-list-${label}.png` })

  /* Far enough down that a jump to the top would be seen. */
  const card = "printify"
  const at = await page.evaluate((s, c) => {
    const box = document.querySelector(s)
    const el = document.querySelector(`[data-integration-card="${c}"]`)
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 260
    return Math.round(box.scrollTop)
  }, SCROLLER, card)
  await wait(300)
  const historyBefore = await page.evaluate(() => history.length)

  let f = await frames(page, () => page.evaluate((c) => document.querySelector(`[data-integration-card="${c}"]`).click(), card), 600)
  let first = f.findIndex((x) => x.view === "page")
  console.log(`  enter: page on frame ${first} (${f[first]?.t}ms), x ${[...new Set(f.map((x) => x.x))].join(",")}, opacity ${f.slice(first, first + 4).map((x) => x.o).join(",")}..${f.at(-1)?.o}`)
  say(first >= 0 && first <= 2, `the page is on screen within two frames (${f[first]?.t}ms)`)
  say(f.every((x) => x.x === 0), "no sideways slide")
  say(first >= 0 && f[first].o >= 0.55 && f.at(-1).o === 1, "never a blank frame: starts at least half opaque, ends opaque")
  say((await page.evaluate(() => history.length)) === historyBefore + 1 && (await page.evaluate(() => location.search)).includes("integration=printify"), "opening it is a history entry with its address")
  const notTop = await page.evaluate(() => { const h = document.querySelector("[data-integration-header]"); const b = document.querySelector("[data-settings-sheet-scroll]"); return Math.round(h.getBoundingClientRect().top - b.getBoundingClientRect().top) })
  say(notTop >= 0 && notTop < 140, `the page starts at its top (${notTop}px from the sheet's top)`)

  /* Connect Printify with a key. */
  const input = await page.$("[data-integration-key]")
  say(!!input, "Printify asks for its token")
  if (input) {
    await input.type("printify_test_token_0123456789")
    await page.evaluate(() => document.querySelector("[data-integration-save]").click())
    await until(page, () => !!document.querySelector("[data-integration-facts]") && !!document.querySelector("[data-integration-done]"), 8000).catch(() => null)
    const facts = await page.evaluate(() => ({ text: document.querySelector("[data-integration-facts]")?.textContent ?? "", status: document.querySelector("[data-integration-standing]")?.textContent ?? "", inputs: [...document.querySelectorAll("input")].map((i) => i.value).join("|") }))
    say(/Products at the Printify location/.test(facts.text) && /Drafts to approve in Printify/.test(facts.text) && /tells Storelib as each parcel ships/.test(facts.text), "connected: where orders come from, drafts, tracking")
    say(/Connected/.test(facts.status), `the header says Connected ("${facts.status}")`)
    say(!facts.inputs.includes("printify_test_token_0123456789"), "the token is not shown again")
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/i23-printify-${label}.png`, fullPage: false })
  }

  /* Back by its button. */
  f = await frames(page, () => page.evaluate(() => document.querySelector("[data-integration-back]").click()), 600)
  first = f.findIndex((x) => x.view === "list")
  const listFrames = f.slice(first)
  console.log(`  back: list on frame ${first} (${f[first]?.t}ms), scroll ${[...new Set(listFrames.map((x) => x.scroll))].join(",")} (left at ${at})`)
  say(first >= 0 && first <= 2, `the list is back within two frames (${f[first]?.t}ms)`)
  say(listFrames.length > 0 && listFrames.every((x) => x.scroll === at), "exactly where it was left, from its first frame")
  say(f.every((x) => x.x === 0), "no sideways slide")
  await wait(200)
  say((await page.evaluate(() => document.activeElement?.getAttribute("data-integration-card"))) === card, "the card that was opened has the focus")
  say((await page.evaluate(() => history.length)) === historyBefore + 1 && !(await page.evaluate(() => location.search)).includes("integration="), "Back went back through its own entry")

  /* Back by the browser (a phone's Back, a swipe). */
  await page.evaluate((c) => document.querySelector(`[data-integration-card="${c}"]`).click(), "shippo")
  await until(page, () => !!document.querySelector('[data-integration-page="shippo"]'), 10000)
  await wait(300)
  const shippo = await page.evaluate(() => ({ key: !!document.querySelector("[data-integration-install] [data-integration-key]"), notify: !!document.querySelector('[data-integration-notify="shippo"]'), standing: document.querySelector("[data-integration-standing]")?.textContent ?? "", connect: !!document.querySelector("[data-integration-connect]") }))
  say(!shippo.key && !shippo.connect && shippo.notify && /Coming soon/.test(shippo.standing), "Shippo: Coming soon, no key field, Tell me when it's ready")
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/i23-shippo-${label}.png` })
  f = await frames(page, () => page.evaluate(() => history.back()), 700)
  first = f.findIndex((x) => x.view === "list")
  const after = f.slice(first)
  console.log(`  browser back: list on frame ${first} (${f[first]?.t}ms), scroll ${[...new Set(after.map((x) => x.scroll))].join(",")} (left at ${at})`)
  say(first >= 0 && after.every((x) => x.scroll === at), "the browser's Back returns to the list where it was")

  say(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ").slice(0, 300)}` : ""}`)
  await page.close()
}

await browser.close()
server.close()
console.log(bad ? `\n${bad} failed` : "\nall passed")
process.exit(bad ? 1 : 0)
