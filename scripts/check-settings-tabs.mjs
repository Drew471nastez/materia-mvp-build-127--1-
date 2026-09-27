/**
 * ===========================================================================
 *  SETTINGS: WHAT MOVES WHEN YOU CHANGE TAB
 * ===========================================================================
 * "When switching between tabs and the new tab content appears, there is a
 * little bump in the content. No layout jumping, bumping, flashing, or
 * strange reflow."
 *
 * The real Settings page in a shell shaped like /app (scripts/render-settings-
 * tabs.tsx), at 390 and 1280. Every tab is visited in turn, once from the top
 * of the page and once from part way down the longest tab, and on every
 * animation frame after each press this reads:
 *
 *   THE TAB BAR      where it is on the screen. It must not move at all.
 *   THE CONTENT      where the new tab's first card is, from the first frame
 *                    it shows. Once it is there it must stay there: a rise,
 *                    a card arriving above it, a scrollbar coming or going
 *                    (which moves everything sideways), all show up here.
 *   ITS LEFT EDGE    the sideways half of the same thing
 *   LAYOUT SHIFT     the browser's own count, which must stay 0
 *   A BLANK FRAME    a frame with no panel, or one faded to almost nothing
 *
 * And, since "make it a little bit smooth when I switch, not that direct":
 *
 *   THE FADE         the new panel's opacity on every frame after the press,
 *                    and the time until it is fully there: seen (at least
 *                    three frames between 0.2 and 1, fully there no sooner
 *                    than 160ms, where the 140ms fade from 0.4 it replaced
 *                    was there by 134 to 153ms), over by 260ms, and never
 *                    moving (transform none on every frame)
 *   THE PILL         the selected tab's pill, frame by frame: it slides
 *                    (three or more frames between the two tabs), ends
 *                    exactly on the new tab, is never scaled (no stretch),
 *                    never passes where it is going (no overshoot, in
 *                    position or width), and is declared as 200ms on a
 *                    plain ease out ("more normal, regular, clean and
 *                    smooth"). SETTINGS_SHOTS adds it photographed part way,
 *                    slowed twenty times.
 *   NOT ON LOAD      the first paint, and a tab opened by ?tab= on load, are
 *                    simply there: no fade, no slide
 *   NOT ON RE-RENDER typing in General's Name field repaints the form, and
 *                    the panel must not fade again
 *   REDUCED MOTION   with the system asking for less, every frame after a
 *                    press is at full opacity and the outline jumps
 *
 *   node scripts/check-settings-tabs.mjs
 *   SETTINGS_SHOTS=/some/dir node scripts/check-settings-tabs.mjs
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

const dir = join(root, ".settings-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-tabs.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root, process.env.SETTINGS_CSS || null)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

/* Every API answers quickly with an empty success, the way a fast network would. */
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const free = { id: "free", name: "Free", price_cents: 0, billing_period: null, features: [] }
    const body = req.url.startsWith("/api/billing/overview")
      ? { plans: [free, { id: "growth", name: "Growth", price_cents: 2990, billing_period: "month", features: [] }, { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month", features: [] }], subscription: null, currentPlan: free, invoices: [], paymentMethod: null }
      : req.url.startsWith("/api/domains") ? { domains: [] }
      /* Nothing stored yet: every category on its defaults, which is what a new account reads. */
      : req.url.startsWith("/api/notifications/preferences") ? { categories: [] } : {}
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 120)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* No Stores tab since 88d197a4 ("Get rid of the Stores tab in Settings"). */
const TABS = ["security", "payments", "billing", "domains", "notifications", "privacy", "general"]
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const report = {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))


/* Every frame from the document's start: where things are, the panel's tone, and what is animating. */
const RECORDER = () => {
  window.__rec = []
  window.__shift = 0
  const order = ["general", "security", "payments", "billing", "domains", "notifications", "privacy"]
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift", buffered: true })
  } catch { /* no layout shift API */ }
  const tick = (t) => {
    const bar = document.querySelector("[data-settings-tabs]")
    const panel = document.querySelector("[data-settings-panel]")
    const first = panel?.firstElementChild?.firstElementChild ?? panel?.firstElementChild
    const s = document.querySelector(".app-content-scroll")
    const fr = first?.getBoundingClientRect()
    const ring = document.querySelector("[data-settings-tab-ring]")
    const row = ring?.parentElement?.getBoundingClientRect()
    const tabName = panel?.getAttribute("data-settings-panel") ?? null
    const tabEl = tabName ? bar?.querySelectorAll("button")[order.indexOf(tabName)] : null
    const rr = ring?.getBoundingClientRect()
    const tr = tabEl?.getBoundingClientRect()
    const cs = panel ? getComputedStyle(panel) : null
    window.__rec.push({
      t,
      tab: tabName,
      bar: bar ? Math.round(bar.getBoundingClientRect().top * 10) / 10 : null,
      top: fr ? Math.round(fr.top * 10) / 10 : null,
      left: fr ? Math.round(fr.left * 10) / 10 : null,
      opacity: cs ? Number(cs.opacity) : null,
      moved: cs ? (cs.transform !== "none" || (cs.translate && cs.translate !== "none")) : false,
      anims: panel ? panel.getAnimations().length : 0,
      ringVisible: ring ? getComputedStyle(ring).visibility === "visible" : false,
      ringX: rr && row ? Math.round((rr.left - row.left) * 10) / 10 : null,
      ringW: rr ? Math.round(rr.width * 10) / 10 : null,
      ringAnims: ring ? ring.getAnimations().length : 0,
      ringTiming: ring && ring.getAnimations()[0] ? (() => { const t = ring.getAnimations()[0].effect.getTiming(); return `${t.duration} ${t.easing}` })() : null,
      /* Stretch: anything but a plain move and a true width (a scale squashes the hairline and the round ends). */
      ringStretch: ring ? (() => { const c = getComputedStyle(ring); return (c.transform !== "none" && !/^matrix\(1, 0, 0, 1,/.test(c.transform)) || (c.scale && c.scale !== "none") })() : false,
      tabX: tr && row ? Math.round((tr.left - row.left) * 10) / 10 : null,
      tabW: tr ? Math.round(tr.width * 10) / 10 : null,
      scroll: s ? s.scrollTop : null,
      gutter: s ? s.offsetWidth - s.clientWidth : null,
    })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function openPage(viewport, { query = "", reduced = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.evaluateOnNewDocument(RECORDER)
  await page.goto(`${base}/app/settings${query}`)
  await page.waitForSelector("[data-settings-panel]")
  await wait(700)
  return { page, errors }
}

async function press(page, errors, tab) {
  const shift0 = await page.evaluate(() => window.__shift)
  const t0 = await page.evaluate((tab) => {
    const order = ["general", "security", "payments", "billing", "domains", "notifications", "privacy"]
    const b = document.querySelectorAll("[data-settings-tabs] button")[order.indexOf(tab)]
    if (!b) throw new Error("no tab button for " + tab + "; the page reads: " + document.body.innerText.slice(0, 300))
    const t = performance.now()
    b.click()
    return t
  }, tab)
  await wait(650)
  const rec = await page.evaluate((t0) => window.__rec.filter((r) => r.t >= t0), t0)
  const shift = (await page.evaluate(() => window.__shift)) - shift0
  const before = await page.evaluate((t0) => window.__rec.filter((r) => r.t < t0).slice(-1)[0], t0)
  if (!before) fail(`no frames were recorded before pressing ${tab}: ${errors.join(" | ") || "no errors"}`)
  const mine = rec.filter((r) => r.tab === tab)
  const settled = mine[mine.length - 1]
  const barMoved = Math.max(0, ...rec.filter((r) => r.bar != null).map((r) => Math.abs(r.bar - before.bar)))
  /* From the first frame the new tab shows, how far its first card travels. */
  const contentMoved = mine.length ? Math.max(...mine.map((r) => Math.abs(r.top - settled.top))) : null
  const leftMoved = mine.length ? Math.max(...mine.map((r) => Math.abs(r.left - settled.left))) : null
  /* A frame with no panel under the tabs, or one so faint it reads as none. */
  const blank = rec.filter((r) => r.tab === null || (r.opacity != null && r.opacity < 0.15)).length
  const gutterChanged = settled && before ? settled.gutter !== before.gutter : false
  /* The fade and the outline, frame by frame, in ms from the press. */
  const curve = mine.map((r) => [Math.round(r.t - t0), Math.round(r.opacity * 1000) / 1000, r.ringX])
  const full = mine.find((r) => r.opacity >= 0.999)
  const fading = mine.filter((r) => r.opacity >= 0.2 && r.opacity < 0.999).length
  const minOpacity = mine.length ? Math.min(...mine.map((r) => r.opacity)) : null
  const rose = mine.some((r) => r.moved)
  const between = (x) => x != null && before.ringX != null && settled?.ringX != null && Math.min(before.ringX, settled.ringX) + 0.5 < x && x < Math.max(before.ringX, settled.ringX) - 0.5
  const slideFrames = rec.filter((r) => between(r.ringX)).length
  const ringOnTab = settled ? Math.abs(settled.ringX - settled.tabX) <= 0.5 && Math.abs(settled.ringW - settled.tabW) <= 0.5 && settled.ringVisible : false
  const ringDone = rec.find((r, i) => i > 0 && r.ringAnims === 0 && rec[i - 1].ringAnims > 0)
  /* A calm slide: never scaled, and never past where it is going (no overshoot, no bounce back). */
  const stretched = rec.filter((r) => r.ringStretch).length
  const lo = Math.min(before.ringX ?? 0, settled?.ringX ?? 0) - 0.5
  const hi = Math.max(before.ringX ?? 0, settled?.ringX ?? 0) + 0.5
  const overshoot = rec.filter((r) => r.ringX != null && (r.ringX < lo || r.ringX > hi)).length
  const wLo = Math.min(before.ringW ?? 0, settled?.ringW ?? 0) - 0.5
  const wHi = Math.max(before.ringW ?? 0, settled?.ringW ?? 0) + 0.5
  const widthOut = rec.filter((r) => r.ringW != null && (r.ringW < wLo || r.ringW > wHi)).length
  return {
    tab, barMoved, contentMoved, leftMoved, blank, shift: Math.round(shift * 10000) / 10000, gutterChanged, scroll: [before.scroll, settled?.scroll],
    visibleAt: full ? Math.round(full.t - t0) : null, fading, minOpacity, rose, slideFrames, ringOnTab, slideEndsAt: ringDone ? Math.round(ringDone.t - t0) : null,
    stretched, overshoot, widthOut,
    /* The slide itself, from its first frame to its last: the click's own render is not part of it. */
    slideTiming: rec.find((r) => r.ringTiming)?.ringTiming ?? null,
    curve,
  }
}

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }],
]) {
  const { page, errors } = await openPage(viewport)
  /* The first paint: nothing fades, nothing slides. */
  const load = await page.evaluate(() => ({
    frames: window.__rec.filter((r) => r.tab).length,
    minOpacity: Math.min(...window.__rec.filter((r) => r.tab).map((r) => r.opacity)),
    anims: Math.max(0, ...window.__rec.map((r) => r.anims)),
    ringAnims: Math.max(0, ...window.__rec.map((r) => r.ringAnims)),
    ringOnTab: (() => { const r = window.__rec[window.__rec.length - 1]; return Math.abs(r.ringX - r.tabX) <= 0.5 && Math.abs(r.ringW - r.tabW) <= 0.5 && r.ringVisible })(),
  }))
  await wait(300)
  const fromTop = []
  for (const tab of TABS) fromTop.push(await press(page, errors, tab))
  /* Part way down the longest tab, then a short one. */
  const tallest = await page.evaluate(() => { const s = document.querySelector(".app-content-scroll"); s.scrollTop = Math.min(420, s.scrollHeight - s.clientHeight); return s.scrollTop })
  await wait(200)
  const fromScrolled = []
  for (const tab of ["security", "general", "privacy", "general"]) fromScrolled.push(await press(page, errors, tab))
  if (process.env.SETTINGS_SHOTS) await page.screenshot({ path: join(process.env.SETTINGS_SHOTS, `settings-tabs-${label}.png`) })

  /* A re-render on the same tab (a letter typed in Name) must not fade the panel again. */
  await page.evaluate(() => { document.querySelector(".app-content-scroll").scrollTop = 0 })
  await wait(200)
  const t1 = await page.evaluate(() => performance.now())
  await page.focus("#firstName")
  await page.keyboard.type("a")
  await wait(400)
  const rerender = await page.evaluate((t1) => {
    const f = window.__rec.filter((r) => r.t >= t1)
    return { frames: f.length, minOpacity: Math.min(...f.map((r) => r.opacity)), anims: Math.max(0, ...f.map((r) => r.anims)), name: document.querySelector("#firstName").value }
  }, t1)
  /* The pill part way, slowed twenty times, so a person can look at it: its hairline and round ends keep their shape. */
  if (process.env.SETTINGS_SHOTS) {
    const cdp = await page.createCDPSession()
    await cdp.send("Animation.enable")
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 })
    const clip = await page.evaluate(() => { const r = document.querySelector("[data-settings-tabs]").getBoundingClientRect(); return { x: Math.max(0, r.x), y: r.y - 4, width: Math.min(r.width, innerWidth - Math.max(0, r.x)), height: r.height + 8 } })
    await page.evaluate(() => document.querySelectorAll("[data-settings-tabs] button")[3].click())
    for (const ms of [30, 70, 120, 250]) {
      await wait(ms === 30 ? 600 : (ms - [30, 70, 120, 250][[30, 70, 120, 250].indexOf(ms) - 1]) * 20)
      await page.screenshot({ path: join(process.env.SETTINGS_SHOTS, `settings-pill-${label}-${String(ms).padStart(3, "0")}ms.png`), clip })
    }
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  }
  await page.close()

  /* A tab opened by the address on load is there at once too. */
  const deep = await openPage(viewport, { query: "?tab=security" })
  const onLoad = await deep.page.evaluate(() => ({
    tab: document.querySelector("[data-settings-panel]").getAttribute("data-settings-panel"),
    minOpacity: Math.min(...window.__rec.filter((r) => r.tab).map((r) => r.opacity)),
    anims: Math.max(0, ...window.__rec.map((r) => r.anims)),
    ringAnims: Math.max(0, ...window.__rec.map((r) => r.ringAnims)),
  }))
  await deep.page.close()

  /* Less motion: a press changes the tab at full opacity, and the outline jumps. */
  const calm = await openPage(viewport, { reduced: true })
  const reduced = await press(calm.page, calm.errors, "security")
  const reducedRing = await calm.page.evaluate(() => Math.max(0, ...window.__rec.map((r) => r.ringAnims)))
  await calm.page.close()

  const first = fromTop[0]
  report[label] = {
    load, onLoad, rerender,
    firstPress: { tab: first.tab, visibleAt: first.visibleAt, fading: first.fading, minOpacity: first.minOpacity, slideFrames: first.slideFrames, slideEndsAt: first.slideEndsAt, curve: first.curve.slice(0, 16) },
    reduced: { minOpacity: reduced.minOpacity, fading: reduced.fading, ringAnims: reducedRing, ringOnTab: reduced.ringOnTab },
    presses: [...fromTop, ...fromScrolled].map(({ curve, ...r }) => r),
    scrolledTo: tallest,
    errors: [...errors, ...deep.errors, ...calm.errors].slice(0, 3),
  }
  for (const r of [...fromTop, ...fromScrolled]) {
    const at = `at ${label}, to ${r.tab}:`
    if (r.barMoved > 0.5) problems.push(`${at} the tab bar moved ${r.barMoved}px`)
    if (r.contentMoved == null) problems.push(`${at} the tab never showed`)
    else if (r.contentMoved > 0.5) problems.push(`${at} the content moved ${r.contentMoved}px after it appeared`)
    if (r.leftMoved > 0.5) problems.push(`${at} the content moved ${r.leftMoved}px sideways`)
    if (r.gutterChanged) problems.push(`${at} a scrollbar came or went`)
    if (r.blank) problems.push(`${at} ${r.blank} blank frames`)
    if (r.shift > 0) problems.push(`${at} layout shift ${r.shift}`)
    if (r.rose) problems.push(`${at} the panel was moved by a transform`)
    if (r.fading < 3) problems.push(`${at} the fade was ${r.fading} frames: too direct to see`)
    if (r.visibleAt == null || r.visibleAt > 260) problems.push(`${at} fully there only at ${r.visibleAt}ms`)
    /* The one before this was fully there by 134 to 153ms, from 0.4: over before it was seen. */
    else if (r.visibleAt < 160) problems.push(`${at} fully there at ${r.visibleAt}ms, as direct as before`)
    if (r.slideFrames < 3) problems.push(`${at} the outline slid over ${r.slideFrames} frames`)
    if (!r.ringOnTab) problems.push(`${at} the outline did not end on the tab`)
    if (r.stretched) problems.push(`${at} the pill was scaled (stretched) on ${r.stretched} frames`)
    if (r.overshoot || r.widthOut) problems.push(`${at} the pill went past where it was going (${r.overshoot} frames in position, ${r.widthOut} in width)`)
    /* The slide's own timing, as declared (frame times on a busy machine say more about the machine): 200ms on a plain ease out that never passes 1. */
    if (r.slideTiming && !/^200 cubic-bezier\(0\.33, 1, 0\.68, 1\)$/.test(r.slideTiming)) problems.push(`${at} the pill slides on ${r.slideTiming}, not 200ms on a plain ease out`)
  }
  const at = `at ${label}:`
  if (load.minOpacity < 1 || load.anims) problems.push(`${at} the first paint faded (min opacity ${load.minOpacity}, ${load.anims} animations)`)
  if (load.ringAnims) problems.push(`${at} the outline slid on load`)
  if (!load.ringOnTab) problems.push(`${at} the outline is not on the selected tab after load`)
  if (onLoad.tab !== "security" || onLoad.minOpacity < 1 || onLoad.anims || onLoad.ringAnims) problems.push(`${at} ?tab=security on load: ${JSON.stringify(onLoad)}`)
  if (rerender.minOpacity < 1 || rerender.anims) problems.push(`${at} a re-render faded the panel again: ${JSON.stringify(rerender)}`)
  if (reduced.minOpacity < 1 || reducedRing) problems.push(`${at} with reduced motion: min opacity ${reduced.minOpacity}, outline animations ${reducedRing}`)
  if (!reduced.ringOnTab) problems.push(`${at} with reduced motion the outline did not land on the tab`)
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: the tab bar and the content hold still, the new tab fades in over 200ms, the outline slides, and neither happens on load, on a re-render or with reduced motion, at 390 and 1280")
