/**
 * ===========================================================================
 *  ROUND 37: A COMMUNITY'S ANALYTICS, ONE CHART AND ITS SWITCHERS, MEASURED
 * ===========================================================================
 * "Keep only the chart and the switchers, but very smooth clean." Mounts the
 * real AnalyticsSection (scripts/render-community-analytics-round31.tsx,
 * answered from fixtures) in headless Chromium at 1440x900 and on a 390x844
 * phone and measures:
 *
 *   LAYOUT     the period alone in its row; no overview of figures and no
 *              sections' tabs; one chart card with the figure tabs over the
 *              chart (Members, New members, Active members, Visitors, Join
 *              rate, Engagement, Churn, Revenue); one details card under it
 *   TABS       on a 1440 screen all eight in one row with nothing cut off,
 *              no number clipped; on a phone the row scrolls inside itself,
 *              never the page; each tab 64px or taller to a finger
 *   SWITCH     choosing each figure: the chart is the same element (never
 *              mounted again), the line moves through frames in between
 *              (not a jump), the plot does not move sideways, nothing on the
 *              page changes size or place (layout shift entries, the cards'
 *              boxes before and after), and the frames while it moves
 *   DETAILS    the card follows the figure (members, visitors, engagement,
 *              revenue lists), always the same height
 *   MOTION     with reduced motion the line is where it goes on the first
 *              frame
 *   NOT YET    before part 184: no Visitors, Join rate, Engagement or
 *              Revenue tab
 *
 *   node scripts/check-community-analytics-round37.mjs
 * Screenshots land in SHOTS_DIR (or a temp dir, printed at the end).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
/* esbuild from this checkout, or from the one a worktree sits in. */
const ESBUILD = (() => {
  try {
    return createRequire(join(root, "package.json")).resolve("esbuild/bin/esbuild")
  } catch {
    return null
  }
})()
const dir = join(root, ".community-analytics-r37-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-analytics-r37-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
`)
writeFileSync(join(dir, "next-navigation.js"), `
const router = { replace() {}, push() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href: String(href), ref, ...rest }, children) })
`)
writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)

/* Changed on purpose (round 38): five figures in the row, the other three in the menu at its end (scripts/check-community-analytics-round38.mjs measures the menu). */
const FIGURES = ["members", "active", "visitors", "engagement", "revenue"]
const LABELS = ["Members", "Active members", "Visitors", "Engagement", "Revenue"]
const GROUP = { members: "members", joined: "members", churn: "members", active: "active", visitors: "visitors", joinRate: "visitors", engagement: "engagement", revenue: "revenue" }

/* What the page shows now. */
const LOOK = () => {
  const vw = innerWidth
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }
  }
  const card = document.querySelector("[data-trend]")
  const strip = card?.querySelector("[role=tablist]")
  const tabs = [...(strip?.querySelectorAll("[role=tab]") ?? [])].map((el) => {
    /* MetricTab: the chosen one's line first (data-metric-tab-line), then the name, the number's row and the line under it. */
    const parts = [...el.children].filter((c) => !c.hasAttribute("data-metric-tab-line"))
    const name = parts[0]
    const value = parts[1]?.firstElementChild
    const foot = parts[2]
    return { key: el.getAttribute("data-tab"), label: name?.textContent.trim(), value: value?.textContent.trim(), foot: foot?.textContent.trim(), selected: el.getAttribute("aria-selected") === "true", ...box(el), clipped: value ? value.scrollWidth > value.clientWidth + 1 : null, labelClipped: name ? name.scrollWidth > name.clientWidth + 1 : null }
  })
  const line = card?.querySelector("[data-trend-line]")
  const details = document.querySelector("[data-card=details]")
  return {
    vw,
    scrollW: document.scrollingElement.scrollWidth,
    docH: document.scrollingElement.scrollHeight,
    controls: (() => {
      const c = document.querySelector("[data-analytics-controls]")
      return c ? { children: c.children.length } : null
    })(),
    overview: !!document.querySelector("[data-overview], [data-kpi]"),
    sections: !!document.querySelector("[data-analytics-sections]"),
    charts: document.querySelectorAll("[data-trend]").length,
    card: box(card),
    strip: strip ? { scroll: strip.scrollWidth - strip.clientWidth } : null,
    tabs,
    figure: document.querySelector("[data-analytics]")?.getAttribute("data-figure") ?? null,
    line: line?.getAttribute("d") ?? "",
    placeholder: card?.querySelector("[data-chart-loading]")?.getAttribute("data-chart-loading") === "true",
    details: box(details),
    detailsGroup: document.querySelector("[data-details]")?.getAttribute("data-details") ?? null,
    detailsTitle: details?.querySelector("h3")?.textContent.trim() ?? null,
    detailsTabs: [...(details?.querySelectorAll("[role=tab]") ?? [])].map((t) => t.textContent.trim()),
    rows: details ? details.querySelectorAll("[data-row-key]").length : 0,
    note: box(document.querySelector("[data-trend-note]")),
  }
}

/** Chooses a figure and watches what happens for 900ms: frames, the line's path on each, layout shifts, and the boxes after. */
const SWITCH = async (key) => {
  const card = document.querySelector("[data-trend]")
  const svg = card.querySelector("[data-trend-line]")?.ownerSVGElement
  svg.__mark = svg.__mark || Math.random()
  const mark = svg.__mark
  const before = {
    card: card.getBoundingClientRect().toJSON(),
    details: document.querySelector("[data-card=details]").getBoundingClientRect().toJSON(),
    docH: document.scrollingElement.scrollHeight,
    left: Number(/^M\s*([\d.]+)/.exec(card.querySelector("[data-trend-line]").getAttribute("d"))?.[1] ?? NaN),
    d: card.querySelector("[data-trend-line]").getAttribute("d"),
  }
  const shifts = []
  const po = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) shifts.push({ value: e.value, sources: (e.sources || []).map((s) => s.node?.nodeName + "." + (s.node?.className?.baseVal ?? s.node?.className ?? "").toString().slice(0, 40)) })
  })
  po.observe({ type: "layout-shift", buffered: false })
  const frames = []
  const paths = []
  let last = performance.now()
  let run = true
  const tick = (t) => {
    frames.push(t - last)
    last = t
    paths.push(document.querySelector("[data-trend] [data-trend-line]")?.getAttribute("d") ?? "")
    if (run) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  document.querySelector(`[data-trend] [role=tab][data-tab="${key}"]`).click()
  await new Promise((r) => setTimeout(r, 900))
  run = false
  po.disconnect()
  const after = {
    card: card.getBoundingClientRect().toJSON(),
    details: document.querySelector("[data-card=details]").getBoundingClientRect().toJSON(),
    docH: document.scrollingElement.scrollHeight,
    left: Number(/^M\s*([\d.]+)/.exec(card.querySelector("[data-trend-line]").getAttribute("d"))?.[1] ?? NaN),
    d: card.querySelector("[data-trend-line]").getAttribute("d"),
  }
  const sameSvg = card.querySelector("[data-trend-line]")?.ownerSVGElement?.__mark === mark
  const distinct = new Set(paths).size
  const between = paths.filter((p) => p !== before.d && p !== after.d).length
  return { before, after, shifts, frames: frames.slice(1), distinct, between, sameSvg, firstPath: paths[1] ?? paths[0], finalPath: after.d }
}

let server
let browser
try {
  const css = await appCss(root)
  const esbuildArgs = [join(root, "scripts/render-community-analytics-round31.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "community.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://placeholder.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"placeholder"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:next/image=${join(dir, "next-image.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"]
  if (ESBUILD) execFileSync(process.execPath, [ESBUILD, ...esbuildArgs], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  else execFileSync("npx", ["--no-install", "esbuild", ...esbuildArgs], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(join(dir, "community.js"))
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/community.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.split("?")[0] === "/community.js") {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(js)
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  for (const [label, vp] of [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const phone = label.startsWith("phone")
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.goto(`${origin}/community?case=full&delay=80`, { waitUntil: "load" })
    await sleep(1500)
    const look = await p.evaluate(LOOK)

    console.log(`\n${label}: the layout`)
    expect(errors.length === 0, "the section renders without an error", errors)
    expect(look.controls?.children === 1, "the period's row holds the picker alone", look.controls)
    expect(!look.overview && !look.sections, "no overview of figures and no sections' tabs", { overview: look.overview, sections: look.sections })
    expect(look.charts === 1 && !look.placeholder && look.line.length > 10, "one chart, with a line", { charts: look.charts, placeholder: look.placeholder })
    expect(look.tabs.map((t) => t.label).join("|") === LABELS.join("|"), "its tabs (changed on purpose, round 38: five): Members, Active members, Visitors, Engagement, Revenue", look.tabs.map((t) => t.label))
    expect(look.tabs.every((t) => t.clipped === false && t.labelClipped === false), "no number or name cut off", look.tabs.filter((t) => t.clipped || t.labelClipped).map((t) => t.key))
    expect(look.tabs.every((t) => t.h >= 64), "each tab 64px or taller", Math.min(...look.tabs.map((t) => t.h)))
    if (phone) {
      expect(look.strip.scroll > 0 && look.scrollW <= look.vw, "on a phone the tabs scroll inside their row, never the page", { strip: look.strip.scroll, scrollW: look.scrollW, vw: look.vw })
      expect(look.card.x >= 0 && look.card.right <= look.vw, "the chart card fits the screen", look.card)
    } else {
      expect(look.strip.scroll <= 0 && look.tabs.every((t) => t.right <= look.card.right), "all five in one row, none off the side", { strip: look.strip.scroll, right: look.tabs.map((t) => t.right), card: look.card.right })
    }
    expect(look.details && look.details.y >= look.card.bottom + 8 && look.details.y <= look.card.bottom + 24, "one details card, 16px under the chart", { card: look.card?.bottom, details: look.details?.y })
    expect(look.detailsGroup === "members" && look.rows > 0, "Members first, with how people joined", { group: look.detailsGroup, rows: look.rows })
    expect(look.scrollW <= look.vw, "the page does not scroll sideways", { scrollW: look.scrollW, vw: look.vw })
    console.log(`  note  tabs: ${look.tabs.map((t) => `${t.key} ${t.w}x${t.h} "${t.value}" "${t.foot}"`).join(", ")}`)
    console.log(`  note  chart card ${look.card.w}x${look.card.h}, details ${look.details?.w}x${look.details?.h}`)
    await p.screenshot({ path: join(shots, `${label}-members.png`), fullPage: true })

    console.log(`\n${label}: choosing each figure`)
    const heights = new Set()
    const worst = { shift: 0, frame: 0, long: 0 }
    for (const key of [...FIGURES.slice(1), "members"]) {
      const s = await p.evaluate(SWITCH, key)
      const now = await p.evaluate(LOOK)
      const moved = Math.abs(s.after.card.top - s.before.card.top) + Math.abs(s.after.card.height - s.before.card.height) + Math.abs(s.after.details.top - s.before.details.top) + Math.abs(s.after.details.height - s.before.details.height)
      const shift = s.shifts.reduce((a, x) => a + x.value, 0)
      const maxFrame = Math.max(...s.frames)
      const long = s.frames.filter((f) => f > 34).length
      worst.shift = Math.max(worst.shift, shift)
      worst.frame = Math.max(worst.frame, maxFrame)
      worst.long = Math.max(worst.long, long)
      heights.add(Math.round(s.after.details.height))
      expect(now.figure === key && now.tabs.find((t) => t.key === key)?.selected, `${key}: chosen`, now.figure)
      expect(s.sameSvg, `${key}: the same chart, not mounted again`)
      expect(s.between >= 5, `${key}: the line moves through frames in between, not a jump`, { between: s.between, distinct: s.distinct })
      expect(Math.abs(s.after.left - s.before.left) < 0.5, `${key}: the plot does not move sideways`, { before: s.before.left, after: s.after.left })
      expect(moved === 0 && s.after.docH === s.before.docH, `${key}: nothing on the page moves or changes size`, { moved, docH: [s.before.docH, s.after.docH] })
      expect(shift === 0, `${key}: no layout shift`, s.shifts)
      expect(now.detailsGroup === GROUP[key], `${key}: the details follow (${GROUP[key]})`, { group: now.detailsGroup, title: now.detailsTitle, tabs: now.detailsTabs })
      expect(now.scrollW <= now.vw, `${key}: no sideways scroll`, { scrollW: now.scrollW, vw: now.vw })
      console.log(`  note  ${key}: ${s.frames.length} frames, longest ${Math.round(maxFrame)}ms, ${long} over 34ms; details "${now.detailsTitle}" [${now.detailsTabs.join(", ")}] ${now.rows} rows`)
      if (key !== "members") await p.screenshot({ path: join(shots, `${label}-${key}.png`), fullPage: true })
    }
    expect(heights.size === 1, "the details card is the same height for every figure", [...heights])
    expect(worst.long <= 2, "no more than two slow frames in any switch", worst)
    await ctx.close()

    console.log(`\n${label}: with reduced motion`)
    const ctx3 = await browser.createBrowserContext()
    const r = await ctx3.newPage()
    await r.setViewport(vp)
    await r.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await r.goto(`${origin}/community?case=full&delay=80`, { waitUntil: "load" })
    await sleep(1500)
    const still = await r.evaluate(SWITCH, "visitors")
    expect(still.between === 0 && still.firstPath === still.finalPath, "the line is where it goes on the first frame", { between: still.between })
    await ctx3.close()

    console.log(`\n${label}: before part 184, a community that sells nothing`)
    const ctx2 = await browser.createBrowserContext()
    const q = await ctx2.newPage()
    await q.setViewport(vp)
    await q.goto(`${origin}/community?case=nopart&delay=80`, { waitUntil: "load" })
    await sleep(1500)
    const n = await q.evaluate(LOOK)
    expect(n.tabs.map((t) => t.key).join() === "members,joined,active,churn", "Members, New members, Active members, Churn: nothing that was not counted", n.tabs.map((t) => t.key))
    expect(n.scrollW <= n.vw && n.tabs.every((t) => t.right <= n.vw || phone), "inside the screen", { scrollW: n.scrollW, vw: n.vw })
    await q.screenshot({ path: join(shots, `${label}-nopart.png`), fullPage: true })
    await ctx2.close()
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall measured")
process.exit(broken ? 1 : 0)
