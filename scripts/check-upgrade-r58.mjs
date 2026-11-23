/**
 * ===========================================================================
 *  ROUND 58: THE PLANS PAGE IN THE APP, MEASURED BESIDE /pricing
 * ===========================================================================
 * The owner: the upgrade page opens and closes smoothly and cleanly, has an X
 * and a way back to Billing, keeps the current plan's button filled, matches
 * the public pricing page section by section from the same components and
 * data, and holds up on a phone (no sideways scroll, a close that stays,
 * safe areas).
 *
 * scripts/render-upgrade-r58.tsx draws both pages with their real
 * components. In headless Chromium, at 360, 390, 768 and 1280:
 *
 *   PICTURES     the plans page at its top, its compare table and its
 *                questions, the same three on /pricing, and the cards for
 *                somebody on Grow (the current plan's button). Written to
 *                SHOTS_DIR as <LABEL>-<page>-<part>-<width>.png at 2x.
 *   SIDEWAYS     the page's own scroller and the document are never wider
 *                than the window, and a sideways scroll of either moves 0px
 *   THE CLOSE    with the page scrolled to its foot, the X (or, before this
 *                round, the Back) is still on screen and is what a press
 *                there lands on; 44px at least
 *   SAFE AREAS   with a 47px top and 34px bottom inset emulated, the bar sits
 *                under the top inset and the page's foot clears the bottom one
 *   CURRENT      the current plan's button is filled (its background is not
 *                white and it has no outline), disabled, and says Current plan
 *   ONE SOURCE   every price, card line, compare row and question on the two
 *                pages, read from the DOM, is the same list
 *   OPEN, CLOSE  Billing -> Upgrade -> X, with the CPU at a quarter speed on
 *                the phone: layout shifts after the first frame, frames
 *                where neither page is drawn, the longest gap between frames
 *                during the move, and the press-to-first-frame time
 *
 *   LABEL=before SHOTS_DIR=/dir node scripts/check-upgrade-r58.mjs
 * Prints a JSON report at the end; exits 1 when an "after" expectation fails.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const LABEL = process.env.LABEL || "after"
const STRICT = LABEL !== "before"
const WIDTHS = (process.env.WIDTHS || "360,390,768,1280").split(",").map(Number)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : STRICT ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok && STRICT) broken++
}

const stubs = mkdtempSync(join(tmpdir(), "storelib-upgrade-r58-"))
const shots = process.env.SHOTS_DIR || join(stubs, "shots")
mkdirSync(shots, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `import React from "react"
export const __RouteContext = React.createContext({ path: "/app/settings", search: "" })
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = {
  push: (h) => { log("push", h); window.__navigate(h, "push") },
  replace: (h) => { log("replace", h); window.__navigate(h, "replace") },
  prefetch: (h) => log("prefetch", h),
  back: () => { log("back"); window.__back() },
  refresh: () => log("refresh"),
}
export const useRouter = () => router
export const usePathname = () => React.useContext(__RouteContext).path
export const useSearchParams = () => { const r = React.useContext(__RouteContext); return React.useMemo(() => new URLSearchParams(r.search), [r.search]) }
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); if (window.__navigate) window.__navigate(href, replace ? "replace" : "push"); else (window.__pushed ||= []).push(href) } } }, children)
})
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest }) { const s = typeof src === "object" && src ? src.src : src; return React.createElement("img", { src: s, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: null, error: null }) }) } }
`)

const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-upgrade-r58.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    react: compiled("react"),
    "react-dom": compiled("react-dom"),
    "next/navigation": join(stubs, "navigation.js"),
    "@/lib/supabase/client": join(stubs, "supabase-client.js"),
    "next/link": join(stubs, "link.jsx"),
    "next/image": join(stubs, "image.jsx"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl", ".webp": "dataurl", ".jpg": "dataurl" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const css = await appCss(root)
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>
<script>
  window.__shifts = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ t: e.startTime, v: e.value, from: (e.sources || []).map((s) => s.node && s.node.nodeName + (s.node.className && typeof s.node.className === "string" ? "." + s.node.className.split(" ").slice(0, 3).join(".") : "")) }) }).observe({ type: "layout-shift", buffered: true }) } catch {}
</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] })
const report = { label: LABEL, widths: {}, source: null, trips: {} }

async function open(path, viewport, { throttle = 1, insets = null } = {}) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const cdp = await page.createCDPSession()
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  let insetOk = false
  if (insets) {
    try {
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets })
      insetOk = true
    } catch {
      insetOk = false
    }
  }
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
    if (u.startsWith("http://probe.test/api/")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
    if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("data:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  await page.goto(`http://probe.test${path}`, { waitUntil: "load" })
  await page.evaluate(() => document.fonts.ready)
  await sleep(1300)
  return { page, cdp, insetOk }
}

const shot = async (page, name) => {
  const file = join(shots, `${LABEL}-${name}.png`)
  await page.screenshot({ path: file })
  return file
}

/* Scroll whichever box the page scrolls in to put `sel` near the top. */
const scrollTo = (page, sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    const sc = document.querySelector("[data-page-layer-scroll]")
    const bar = document.querySelector("[data-upgrade-bar]")
    const head = bar ? bar.getBoundingClientRect().height : 0
    if (sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - head - 12
    else window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 12)
    return true
  }, sel)

/* What both pages say, read from the DOM. */
const READ = () => {
  const t = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
  const cards = [...document.querySelectorAll("[data-plan-card]")].map((c) => ({
    id: c.getAttribute("data-plan-card"),
    name: t(c.querySelector("[data-plan-pill]")),
    price: t(c.querySelector("[data-plan-price]")),
    summary: t(c.querySelector("[data-plan-summary]")),
    lines: [...c.querySelectorAll("[data-plan-lines] li")].map(t),
  }))
  let compare = []
  const pz = document.querySelector(".pz-cmp")
  if (pz) {
    const plans = [...pz.querySelectorAll(".pz-cmp-plan")].map((p) => t(p.querySelector(".pz-cmp-id")))
    const rows = [...pz.querySelectorAll(".pz-cmp-line")].map((r) => [t(r.querySelector(".pz-cmp-label")), ...[...r.querySelectorAll(".pz-cmp-cell")].map((c) => c.querySelector("[aria-label]")?.getAttribute("aria-label") ?? t(c))].join(" | "))
    compare = [plans.join(" | "), ...rows]
  } else if (document.querySelector("[data-compare-plans]")) {
    const box = document.querySelector("[data-compare-plans]")
    const plans = [...box.querySelectorAll("[data-compare-head] > span")].slice(1).map(t)
    const rows = [...box.querySelectorAll("[data-compare-row]")].map((r) => [...r.children].map((c, i) => (i === 0 ? t(c) : c.querySelector("[aria-label]")?.getAttribute("aria-label") ?? t(c).replace(/^[^:]+: /, ""))).join(" | "))
    compare = [plans.join(" | "), ...rows]
  }
  let faq = []
  if (document.querySelector(".faq-item")) faq = [...document.querySelectorAll(".faq-item")].map((i) => `${t(i.querySelector(".faq-q"))} => ${t(i.querySelector(".faq-a"))}`)
  else faq = [...document.querySelectorAll("[data-faq-item]")].map((i) => `${t(i.querySelector("h3"))} => ${t(i.querySelector("[role=region]"))}`)
  return { cards, compare, faq }
}

for (const width of WIDTHS) {
  const phone = width < 768
  const vp = { width, height: phone ? 800 : width === 768 ? 1024 : 860, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone }
  const out = (report.widths[width] = {})
  console.log(`\n── ${width}px ──`)

  /* /pricing */
  {
    const { page } = await open("/pricing", vp)
    out.pricingShots = [await shot(page, `pricing-top-${width}`)]
    await scrollTo(page, "#compare")
    await sleep(900)
    out.pricingShots.push(await shot(page, `pricing-compare-${width}`))
    await scrollTo(page, "#faq")
    await sleep(900)
    out.pricingShots.push(await shot(page, `pricing-faq-${width}`))
    if (width === 1280) report.pricingRead = await page.evaluate(READ)
    await page.close()
  }

  /* The plans page in the app, for somebody on Free, with the insets of an iPhone. */
  {
    const insets = phone ? { top: 47, bottom: 34, left: 0, right: 0 } : null
    const { page, insetOk } = await open("/app/settings/billing/upgrade", vp, { insets })
    out.upgradeShots = [await shot(page, `upgrade-top-${width}`)]
    const geo = await page.evaluate(() => {
      const sc = document.querySelector("[data-page-layer-scroll]")
      const before = { sc: sc.scrollLeft, doc: document.scrollingElement.scrollLeft }
      sc.scrollLeft = 200
      document.scrollingElement.scrollLeft = 200
      const moved = { sc: sc.scrollLeft, doc: document.scrollingElement.scrollLeft }
      sc.scrollLeft = before.sc
      const bar = document.querySelector("[data-upgrade-bar]")
      const layer = document.querySelector("[data-page-layer]")
      return {
        scrollerOver: sc.scrollWidth - sc.clientWidth,
        docOver: document.scrollingElement.scrollWidth - innerWidth,
        sidewaysMoved: moved,
        barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
        layerPadTop: parseFloat(getComputedStyle(layer).paddingTop),
      }
    })
    out.geometry = geo
    out.insetEmulated = insetOk
    expect(geo.scrollerOver <= 0 && geo.docOver <= 0, `${width}: nothing wider than the window`, { scroller: geo.scrollerOver, doc: geo.docOver })
    expect(geo.sidewaysMoved.sc === 0 && geo.sidewaysMoved.doc === 0, `${width}: a sideways scroll moves nothing`, geo.sidewaysMoved)
    if (insets && insetOk) expect(geo.barTop >= 47, `${width}: the bar sits under the 47px top inset`, geo.barTop)

    await scrollTo(page, "#compare")
    await sleep(900)
    out.upgradeShots.push(await shot(page, `upgrade-compare-${width}`))
    await scrollTo(page, "#faq, [data-plan-faq]")
    await sleep(900)
    out.upgradeShots.push(await shot(page, `upgrade-faq-${width}`))
    /* To the foot: the close is still there and takes the press. */
    const foot = await page.evaluate(() => {
      const sc = document.querySelector("[data-page-layer-scroll]")
      sc.scrollTop = sc.scrollHeight
      const close = document.querySelector("[data-upgrade-close]") || document.querySelector("[data-upgrade-back]")
      const r = close.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const last = sc.lastElementChild?.lastElementChild ?? sc.lastElementChild
      const padBottom = parseFloat(getComputedStyle(sc.firstElementChild).paddingBottom) + parseFloat(getComputedStyle(document.querySelector("[data-upgrade-body]") || sc.firstElementChild).paddingBottom)
      return {
        kind: close.hasAttribute("data-upgrade-close") ? "x" : "back",
        top: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        hits: !!hit && close.contains(hit),
        hasX: !!document.querySelector("[data-upgrade-close]"),
        hasBack: !!document.querySelector("[data-upgrade-back]"),
        backText: (document.querySelector("[data-upgrade-back]")?.textContent || "").trim(),
        footClear: Math.round(sc.getBoundingClientRect().bottom - (last ? last.getBoundingClientRect().bottom : 0)),
        padBottom,
      }
    })
    await sleep(400)
    out.upgradeShots.push(await shot(page, `upgrade-foot-${width}`))
    out.foot = foot
    expect(foot.hasX && foot.hasBack, `${width}: an X and a back link to Billing`, { x: foot.hasX, back: foot.backText })
    expect(foot.kind === "x" && foot.hits && foot.top >= 0 && foot.top < 120 && foot.w >= 44 && foot.h >= 44, `${width}: at the foot the X is on screen, 44px, and takes the press`, foot)
    if (width === 1280) report.upgradeRead = await page.evaluate(READ)
    await page.close()
  }

  /* Somebody on Grow: the current plan's button. */
  {
    const { page } = await open("/app/settings/billing/upgrade?current=growth&active=1", vp)
    await scrollTo(page, "[data-plan-cards]")
    await sleep(300)
    out.currentShot = await shot(page, `upgrade-current-${width}`)
    const cur = await page.evaluate(() => {
      const b = document.querySelector('[data-plan-card="growth"] [data-plan-action]')
      const cs = getComputedStyle(b)
      const pz = document.querySelector('.pz-cmp-plan[data-pz-plan="growth"] button, .pz-cmp-plan[data-pz-plan="growth"] a')
      const pcs = pz ? getComputedStyle(pz) : null
      return {
        label: b.textContent.trim(),
        bg: cs.backgroundColor,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle}`,
        disabled: b.disabled === true,
        height: Math.round(b.getBoundingClientRect().height),
        radius: cs.borderTopLeftRadius,
        compare: pcs ? { label: pz.textContent.trim(), bg: pcs.backgroundColor, disabled: pz.disabled === true } : null,
      }
    })
    out.current = cur
    const filled = (bg) => bg && !/rgba?\(255, 255, 255/.test(bg) && !/rgba\(0, 0, 0, 0\)/.test(bg)
    expect(/Current plan/.test(cur.label) && cur.disabled && filled(cur.bg) && /^0px/.test(cur.border), `${width}: Grow's card button is a filled, disabled Current plan`, cur)
    expect(!!cur.compare && /Current plan/.test(cur.compare.label) && cur.compare.disabled && filled(cur.compare.bg), `${width}: the compare table's Grow button says Current plan, filled and disabled`, cur.compare)
    await page.close()
  }
}

/* ONE SOURCE: what the two pages say. */
{
  const a = report.pricingRead
  const b = report.upgradeRead
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)
  const strip = (cards) => cards.map(({ id, name, price, summary, lines }) => ({ id, name, price, summary, lines }))
  report.source = {
    cards: same(strip(a.cards), strip(b.cards)),
    compare: same(a.compare, b.compare),
    faq: same(a.faq, b.faq),
    counts: { pricing: { cards: a.cards.length, lines: a.cards.reduce((n, c) => n + c.lines.length, 0), compare: a.compare.length, faq: a.faq.length }, upgrade: { cards: b.cards.length, lines: b.cards.reduce((n, c) => n + c.lines.length, 0), compare: b.compare.length, faq: b.faq.length } },
    prices: { pricing: a.cards.map((c) => c.price), upgrade: b.cards.map((c) => c.price) },
  }
  if (!report.source.compare) report.source.compareDiff = { pricing: a.compare.slice(0, 4), upgrade: b.compare.slice(0, 4) }
  if (!report.source.faq) report.source.faqDiff = { pricing: a.faq.map((f) => f.split(" => ")[0]), upgrade: b.faq.map((f) => f.split(" => ")[0]) }
  console.log("\n── one source ──")
  expect(report.source.cards, "the cards (names, prices, lines) are the same on both pages", report.source.prices)
  expect(report.source.compare, "the compare table is the same on both pages", report.source.counts)
  expect(report.source.faq, "the questions are the same on both pages", report.source.counts)
}

/* OPEN AND CLOSE: Billing -> Upgrade -> X. */
const RECORD = () => {
  window.__frames = []
  window.__recording = true
  const tick = (t) => {
    if (!window.__recording) return
    const layer = document.querySelector("[data-page-layer]")
    const billing = document.querySelector("[data-billing-stand-in]")
    const still = document.querySelector("[data-layer-still]")
    const anims = document.getAnimations().filter((a) => /page-layer/.test(a.effect?.pseudoElement || "") || a.effect?.target === layer || (still && a.effect?.target === still))
    const ty = (() => {
      const el = still && still.style.visibility !== "hidden" ? still : layer
      if (!el) return null
      const m = getComputedStyle(el).transform
      return m && m !== "none" ? Math.round(new DOMMatrixReadOnly(m).m42) : 0
    })()
    window.__frames.push({ t, path: window.__path, layer: !!layer, billing: !!billing, still: !!still, moving: anims.length, vt: !!document.documentElement.dataset.layerMotion, ty })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

for (const width of [390, 1280]) {
  const phone = width < 768
  const vp = { width, height: phone ? 800 : 860, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone }
  const throttle = phone ? 4 : 1
  const { page, cdp } = await open("/app/settings?tab=billing", vp, { throttle })
  const frames = []
  let shooting = false
  cdp.on("Page.screencastFrame", async (f) => {
    if (shooting) frames.push({ at: f.metadata.timestamp, data: f.data })
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  const trip = (report.trips[width] = {})
  for (const [step, sel] of [["open", "[data-probe-upgrade]"], ["close", "[data-upgrade-close], [data-upgrade-back]"]]) {
    await page.evaluate(() => (window.__shifts = []))
    await page.evaluate(RECORD)
    shooting = true
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
    const t0 = await page.evaluate(() => performance.now())
    await page.click(sel)
    await sleep(phone ? 1600 : 900)
    await cdp.send("Page.stopScreencast")
    shooting = false
    const data = await page.evaluate((t0) => {
      window.__recording = false
      const f = window.__frames.filter((x) => x.t >= t0)
      const moving = f.filter((x) => x.moving > 0)
      const gaps = moving.slice(1).map((x, i) => x.t - moving[i].t)
      return {
        path: window.__path,
        frames: f.length,
        movingFrames: moving.length,
        moveMs: moving.length ? Math.round(moving[moving.length - 1].t - moving[0].t) : 0,
        worstGapMs: gaps.length ? Math.round(Math.max(...gaps)) : 0,
        late: gaps.filter((g) => g > 20).length,
        empty: f.filter((x) => !x.layer && !x.billing && !x.still).length,
        firstChange: (() => { const i = f.findIndex((x, k) => k > 0 && (x.layer !== f[0].layer || x.still !== f[0].still || x.moving)); return i > 0 ? Math.round(f[i].t - t0) : null })(),
        ty: [...new Set(moving.map((x) => x.ty))].slice(0, 12),
        shifts: window.__shifts.filter((s) => s.t >= t0),
      }
    }, t0)
    data.cls = Math.round(data.shifts.reduce((n, s) => n + s.v, 0) * 10000) / 10000
    trip[step] = data
    /* A handful of the screencast's frames: the first, a third, two thirds, the last. */
    const pick = frames.length ? [0, Math.floor(frames.length / 3), Math.floor((2 * frames.length) / 3), frames.length - 1] : []
    data.screencast = [...new Set(pick)].map((i, k) => {
      const file = join(shots, `${LABEL}-trip-${step}-${width}-${k}.jpg`)
      writeFileSync(file, Buffer.from(frames[i].data, "base64"))
      return file
    })
    frames.length = 0
    console.log(`\n── ${step} at ${width} ──`)
    expect(data.cls === 0, `${width} ${step}: no layout shift`, { cls: data.cls, from: data.shifts.slice(0, 3) })
    expect(data.empty === 0, `${width} ${step}: no frame without a page`, data.empty)
    if (phone) expect(data.movingFrames > 6 && data.late <= 2, `${width} ${step}: the layer moves, frames on time at 4x CPU`, { moveMs: data.moveMs, frames: data.movingFrames, late: data.late, worstGapMs: data.worstGapMs })
    await sleep(400)
  }
  expect(trip.close.path === "/app/settings", `${width}: X goes back to Billing`, trip.close.path)
  await page.close()
}

/* Reduced motion: nothing moves, both ways. */
{
  const vp = { width: 390, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  const { page } = await open("/app/settings?tab=billing", vp)
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const res = {}
  for (const [step, sel] of [["open", "[data-probe-upgrade]"], ["close", "[data-upgrade-close], [data-upgrade-back]"]]) {
    await page.evaluate(RECORD)
    const t0 = await page.evaluate(() => performance.now())
    await page.click(sel)
    await sleep(900)
    res[step] = await page.evaluate((t0) => { window.__recording = false; const f = window.__frames.filter((x) => x.t >= t0); return { moving: f.filter((x) => x.moving > 0).length, empty: f.filter((x) => !x.layer && !x.billing && !x.still).length, path: window.__path } }, t0)
  }
  report.reducedMotion = res
  console.log("\n── reduced motion ──")
  expect(res.open.moving === 0 && res.close.moving === 0 && res.open.empty === 0 && res.close.empty === 0, "under reduced motion nothing moves and no frame is empty", res)
  await page.close()
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
const reportFile = join(shots, `${LABEL}-report.json`)
writeFileSync(reportFile, JSON.stringify(report, null, 2))
console.log(`\nreport: ${reportFile}`)
console.log(broken ? `\n${broken} expectation(s) failed` : STRICT ? "\nall expectations held" : "\n(before: notes only)")
process.exit(broken ? 1 : 0)
