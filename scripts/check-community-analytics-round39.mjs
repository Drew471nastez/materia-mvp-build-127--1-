/**
 * ===========================================================================
 *  ROUND 39: A COMMUNITY'S REPORTS, AS /app ANALYTICS DRAWS THEM, MEASURED
 * ===========================================================================
 * The owner: "Add more important stuff to the analytics, ensure the modals
 * and tabs are similar to the /app Analytics page, smooth clean, more tabs,
 * ensure icons are smooth clean, switching between pill shapes smooth clean;
 * source, site, country, device all smooth clean, better."
 *
 * Mounts the real AnalyticsSection (scripts/render-community-analytics-
 * round31.tsx, ?long=1 for lists longer than a card shows) in headless
 * Chromium at 1440x900 and on a 390x844 phone, light and dark, and reads:
 *
 *   GRID        the reports under the chart: Visitors, Joins, Revenue,
 *               Retention, Active members, Why members left, Top posts,
 *               Top members, Event attendance, Program progress; one column
 *               on a phone, three at 1440; no page wider than the screen
 *   SWITCHES    every tab of every card pressed, filmed frame by frame: the
 *               one pill per switcher, sliding (frames between the old tab
 *               and the new), ending on the tab's own box; the card, the
 *               page and every other card not moving (box, height, layout
 *               shift); the rows there on the frame after the press
 *   MARKS       the Source rows wear a mark each, the Country rows a flag,
 *               the Device rows a device
 *   VIEW ALL    the /app dialog: every row, a search that finds Germany by
 *               "germ" and says so when nothing matches, the dialog's
 *               height the same while one types
 *   FIRST       the longest task while the section first draws
 *
 *   node scripts/check-community-analytics-round39.mjs
 * Screenshots land in SHOTS_DIR (or a temp dir, printed at the end).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const ESBUILD = (() => {
  try {
    return createRequire(join(root, "package.json")).resolve("esbuild/bin/esbuild")
  } catch {
    return null
  }
})()
const dir = join(root, ".community-analytics-r39-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-analytics-r39-")), "shots")
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

function bundle(entry, out) {
  const args = [join(root, entry),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, out)}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://placeholder.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"placeholder"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:next/image=${join(dir, "next-image.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"]
  if (ESBUILD) execFileSync(process.execPath, [ESBUILD, ...args], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  else execFileSync("npx", ["--no-install", "esbuild", ...args], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  return readFileSync(join(dir, out))
}

/** The grid: each card's name, box and its switcher's tabs. */
const GRID = () => {
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const grid = document.querySelector("[data-reports]")
  return {
    vw: innerWidth,
    scrollW: document.scrollingElement.scrollWidth,
    cards: [...(grid?.querySelectorAll(":scope > section[data-card]") ?? [])].map((c) => ({
      card: c.getAttribute("data-card"),
      title: c.querySelector("h3")?.textContent?.trim(),
      tabs: [...c.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()),
      ...box(c),
    })),
  }
}

/** Start filming: every frame, the pill of the card's switcher, the card's box, the rows on screen. */
const FILM = (card) => {
  const c = document.querySelector(`[data-reports] > section[data-card="${card}"]`)
  window.__film = { frames: [], shift: 0, on: true, clickAt: null }
  /* From the click itself: a tap reaches the page as a click some frames after the finger lifts. */
  document.addEventListener("click", () => (window.__film.clickAt = performance.now()), { capture: true, once: true })
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (window.__film?.on) window.__film.shift += e.value
    }).observe({ type: "layout-shift", buffered: false })
  } catch {}
  const all = [...document.querySelectorAll("[data-reports] > section[data-card]")]
  const tick = (now) => {
    if (!window.__film?.on) return
    const list = c.querySelector("[role=tablist]")
    const pills = list ? [...list.querySelectorAll("[data-segment-pill]")] : []
    const lb = list?.getBoundingClientRect()
    const p = pills[0]?.getBoundingClientRect()
    const chosen = list?.querySelector('[aria-selected="true"]')?.getBoundingClientRect()
    window.__film.frames.push({
      now,
      pills: pills.length,
      pill: p && lb ? [Math.round((p.left - lb.left) * 10) / 10, Math.round(p.width * 10) / 10] : null,
      chosen: chosen && lb ? [Math.round((chosen.left - lb.left) * 10) / 10, Math.round(chosen.width * 10) / 10] : null,
      boxes: all.map((x) => {
        const b = x.getBoundingClientRect()
        return [Math.round(b.left), Math.round(b.top + scrollY), Math.round(b.width), Math.round(b.height)]
      }),
      tab: c.querySelector("[data-report-tab]")?.getAttribute("data-report-tab"),
      rows: c.querySelectorAll("[data-row-key]").length,
      docH: document.scrollingElement.scrollHeight,
    })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

let server
let browser
try {
  const css = (await appCss(root)) + "\n" + readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const faces = interFaces(root)
  const community = bundle("scripts/render-community-analytics-round31.tsx", "community.js")
  const page = (dark) => `<!doctype html><html class="light"${dark ? " data-sl-dark" : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/community.js"></script></body></html>`
  server = createServer((req, res) => {
    const path = req.url.split("?")[0]
    if (path === "/community.js") {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(community)
    }
    const flag = /^\/flags\/([A-Z]{2})\.svg$/.exec(path)
    if (flag && existsSync(join(root, "public/flags", `${flag[1]}.svg`))) {
      res.writeHead(200, { "content-type": "image/svg+xml" })
      return res.end(readFileSync(join(root, "public/flags", `${flag[1]}.svg`)))
    }
    if (path.startsWith("/flags/")) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(page(req.url.includes("dark=1")))
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
    await p.evaluateOnNewDocument(() => {
      window.__long = []
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__long.push(Math.round(e.duration))
        }).observe({ type: "longtask", buffered: true })
      } catch {}
    })
    await p.goto(`${origin}/community?case=full&delay=60&long=1&access=paid`, { waitUntil: "load" })
    await sleep(1500)
    const grid = await p.evaluate(GRID)

    console.log(`\n${label}: the grid`)
    expect(errors.length === 0, "the section renders without an error", errors)
    const names = grid.cards.map((c) => c.card)
    expect(names.join() === "visitors,joins,revenue,retention,active,left,posts,contributors,events,programs", "Visitors, Joins, Revenue, Retention, Active members, Why members left, Top posts, Top members, Event attendance, Program progress", names)
    const cols = new Set(grid.cards.map((c) => c.x)).size
    expect(phone ? cols === 1 : cols === 3, phone ? "one column on a phone" : "three columns at 1440", cols)
    expect(grid.scrollW <= grid.vw, "the page is never wider than the screen", { scrollW: grid.scrollW, vw: grid.vw })
    const visitors = grid.cards.find((c) => c.card === "visitors")
    expect(visitors?.tabs.join() === "Source,Site,Country,Device", "Visitors: Source, Site, Country, Device", visitors?.tabs)
    const rows = {}
    for (const c of grid.cards) rows[c.card] = c.h
    const heights = [...new Set(grid.cards.map((c) => c.h))]
    console.log(`  cards ${grid.cards.map((c) => `${c.card} ${c.w}x${c.h}`).join(", ")}`)
    const first = await p.evaluate(() => window.__long)
    console.log(`  long tasks while the section first drew: ${JSON.stringify(first)}`)
    await p.screenshot({ path: join(shots, `${label}-light.png`), fullPage: true })

    /* Every tab of every card, pressed and filmed. */
    console.log(`\n${label}: every switch`)
    const results = []
    for (const c of grid.cards) {
      if (c.tabs.length < 2) continue
      const order = [...c.tabs.keys()].slice(1).concat([0])
      for (const i of order) {
        await p.evaluate((card) => document.querySelector(`[data-reports] > section[data-card="${card}"]`).scrollIntoView({ block: "center" }), c.card)
        await sleep(150)
        const before = await p.evaluate((card) => {
          const s = document.querySelector(`[data-reports] > section[data-card="${card}"]`)
          const list = s.querySelector("[role=tablist]")
          const lb = list.getBoundingClientRect()
          const pill = list.querySelector("[data-segment-pill]").getBoundingClientRect()
          return { pill: [Math.round((pill.left - lb.left) * 10) / 10, Math.round(pill.width * 10) / 10] }
        }, c.card)
        await p.evaluate(FILM, c.card)
        const t = await p.evaluate((card, i) => {
          const b = document.querySelector(`[data-reports] > section[data-card="${card}"]`).querySelectorAll("[role=tab]")[i].getBoundingClientRect()
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
        }, c.card, i)
        if (phone) await p.touchscreen.tap(t.x, t.y)
        else await p.mouse.click(t.x, t.y)
        await sleep(450)
        const film = await p.evaluate(() => {
          window.__film.on = false
          return window.__film
        })
        const f = film.frames.filter((x) => x.now >= (film.clickAt ?? 0) - 1)
        const end = f[f.length - 1]
        const from = before.pill[0]
        const to = end.pill?.[0]
        const between = f.filter((x) => x.pill && Math.abs(x.pill[0] - from) > 0.5 && Math.abs(x.pill[0] - to) > 0.5).length
        const b0 = f[0].boxes
        let moved = 0
        for (const x of f) for (let k = 0; k < x.boxes.length; k++) for (let j = 0; j < 4; j++) moved = Math.max(moved, Math.abs(x.boxes[k][j] - b0[k][j]))
        const rowsAt = f.findIndex((x) => x.tab === end.tab)
        results.push({
          sw: `${c.card}:${c.tabs[i]}`,
          pills: Math.max(...f.map((x) => x.pills)),
          between,
          onTab: end.pill && end.chosen ? Math.abs(end.pill[0] - end.chosen[0]) < 1 && Math.abs(end.pill[1] - end.chosen[1]) < 1 : false,
          moved,
          docH: Math.max(...f.map((x) => Math.abs(x.docH - f[0].docH))),
          shift: Math.round(film.shift * 10000) / 10000,
          rowsF: rowsAt + 1,
          rows: end.rows,
        })
      }
    }
    for (const r of results) console.log(`    ${r.sw.padEnd(34)} pill frames between ${String(r.between).padStart(2)}  pills ${r.pills}  on its tab ${r.onTab}  moved ${r.moved}px  page ${r.docH}px  shift ${r.shift}  rows on frame ${r.rowsF} (${r.rows})`)
    expect(results.length >= 18, "every tab of every card pressed", results.length)
    expect(results.every((r) => r.pills === 1), "one pill per switcher on every frame", results.filter((r) => r.pills !== 1).map((r) => r.sw))
    expect(results.every((r) => r.between >= 4), "the pill slides: at least 4 frames between the old tab and the new on every switch", results.map((r) => r.between))
    expect(results.every((r) => r.onTab), "and ends on the tab's own box, its width", results.filter((r) => !r.onTab).map((r) => r.sw))
    expect(results.every((r) => r.moved === 0 && r.docH === 0 && r.shift === 0), "no card, nor the page, moves or changes size; no layout shift", results.filter((r) => r.moved || r.docH || r.shift).map((r) => `${r.sw} ${r.moved}/${r.docH}/${r.shift}`))
    expect(results.every((r) => r.rowsF <= 2), "the rows are there on the frame after the press", results.map((r) => r.rowsF))

    /* Marks: a logo or glyph per source, a flag per country, a device per device. */
    console.log(`\n${label}: the marks`)
    const markOf = async (tab) => {
      await p.evaluate((tab) => [...document.querySelectorAll('[data-reports] > section[data-card="visitors"] [role=tab]')].find((t) => t.textContent.trim() === tab)?.click(), tab)
      await sleep(300)
      return p.evaluate(() => [...document.querySelectorAll('[data-reports] > section[data-card="visitors"] [data-row-key]')].map((row) => ({ key: row.getAttribute("data-row-key"), flag: !!row.querySelector("[data-flag] img"), mark: !!row.querySelector("svg, [data-brand], img") })))
    }
    const sources = await markOf("Source")
    expect(sources.length === 5 && sources.every((x) => x.mark), "every Source row wears a mark", sources)
    await p.evaluate(() => document.querySelector('[data-reports] > section[data-card="visitors"]').scrollIntoView({ block: "center" }))
    await p.screenshot({ path: join(shots, `${label}-visitors-source.png`), clip: await p.evaluate(() => { const b = document.querySelector('[data-reports] > section[data-card="visitors"]').getBoundingClientRect(); return { x: b.left - 8, y: b.top - 8, width: b.width + 16, height: b.height + 16 } }) })
    const countries = await markOf("Country")
    expect(countries.length === 5 && countries.every((x) => x.flag), "every Country row a flag", countries)
    await sleep(300)
    await p.screenshot({ path: join(shots, `${label}-visitors-country.png`), clip: await p.evaluate(() => { const b = document.querySelector('[data-reports] > section[data-card="visitors"]').getBoundingClientRect(); return { x: b.left - 8, y: b.top - 8, width: b.width + 16, height: b.height + 16 } }) })
    const devices = await markOf("Device")
    expect(devices.length === 3 && devices.every((x) => x.mark), "every Device row a device", devices)

    /* View all: the /app dialog, every country, a search. */
    console.log(`\n${label}: View all`)
    await markOf("Country")
    const opened = await p.evaluate(() => {
      const b = [...document.querySelectorAll('[data-reports] > section[data-card="visitors"] button')].find((x) => /^View all/.test(x.textContent.trim()))
      b?.click()
      return b?.textContent.trim() ?? null
    })
    await sleep(500)
    const dlg = () =>
      p.evaluate(() => {
        const d = document.querySelector("[data-all-rows]")
        if (!d) return null
        const b = d.getBoundingClientRect()
        return { h: Math.round(b.height), w: Math.round(b.width), x: Math.round(b.left), title: d.querySelector("h2")?.textContent, rows: [...d.querySelectorAll("[data-all-list] [data-row-key]")].map((r) => r.getAttribute("data-row-key")), search: !!d.querySelector("[data-all-search] input"), flags: d.querySelectorAll("[data-all-list] [data-flag]").length, empty: d.querySelector("[data-all-list] li:not([data-row-key])")?.textContent ?? null }
      })
    const all = await dlg()
    expect(opened === "View all 14" && all && all.rows.length === 14 && all.flags === 14, "View all 14 opens the dialog with every country, each its flag", { opened, rows: all?.rows.length, flags: all?.flags })
    expect(!!all?.search, "a search above the rows", all?.search)
    expect(all && all.x >= 0 && all.x + all.w <= vp.width, "inside the screen", all && { x: all.x, w: all.w })
    await p.screenshot({ path: join(shots, `${label}-view-all.png`) })
    await p.type("[data-all-search] input", "germ")
    await sleep(200)
    const found = await dlg()
    expect(found?.rows.join() === "DE" && found.h === all.h, "\"germ\" finds Germany, and the dialog keeps its height", { rows: found?.rows, h: [all?.h, found?.h] })
    await p.screenshot({ path: join(shots, `${label}-view-all-search.png`) })
    await p.click('[data-all-search] button[aria-label="Clear search"]')
    await sleep(100)
    await p.type("[data-all-search] input", "zzz")
    await sleep(200)
    const none = await dlg()
    expect(none?.rows.length === 0 && /Nothing matches/.test(none?.empty ?? ""), "nothing found says so", none?.empty)
    await p.keyboard.press("Escape")
    await sleep(400)
    await ctx.close()

    /* Dark. */
    const ctxD = await browser.createBrowserContext()
    const d = await ctxD.newPage()
    await d.setViewport(vp)
    await d.goto(`${origin}/community?case=full&delay=60&long=1&access=paid&dark=1`, { waitUntil: "load" })
    await sleep(1500)
    const darkPill = await d.evaluate(() => {
      const pill = document.querySelector('[data-reports] [data-segment-pill]')
      const track = pill?.parentElement
      return { pill: pill ? getComputedStyle(pill).backgroundColor : null, track: track ? getComputedStyle(track).backgroundColor : null, card: getComputedStyle(document.querySelector("[data-reports] > section")).backgroundColor }
    })
    expect(darkPill.pill && darkPill.pill !== "rgb(255, 255, 255)" && darkPill.card !== "rgb(255, 255, 255)", "dark: the cards and the pill are dark, not white", darkPill)
    await d.screenshot({ path: join(shots, `${label}-dark.png`), fullPage: true })
    await d.evaluate(() => [...document.querySelectorAll('[data-reports] > section[data-card="visitors"] [role=tab]')].find((t) => t.textContent.trim() === "Country")?.click())
    await sleep(300)
    await d.evaluate(() => [...document.querySelectorAll('[data-reports] > section[data-card="visitors"] button')].find((x) => /^View all/.test(x.textContent.trim()))?.click())
    await sleep(500)
    await d.screenshot({ path: join(shots, `${label}-view-all-dark.png`) })
    await ctxD.close()
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall measured")
process.exit(broken ? 1 : 0)
