/**
 * ===========================================================================
 *  ROUND 38: FIVE FIGURES IN THE ROW, AND THE GREY FILLS, MEASURED
 * ===========================================================================
 * The owner: "too many stats in the chart, 1 2 3 4 5 6 7 8. I want to limit
 * things up to 5 maximum" and "the progress fills ... back in the day it was
 * that light gray gradient, not the purple one. Fully get rid of it."
 *
 * Mounts the real AnalyticsSection (scripts/render-community-analytics-
 * round31.tsx) and the real /app Analytics report cards (scripts/render-
 * analytics-reports.tsx) in headless Chromium, at 1440x900 and on a 390x844
 * phone, in the light look and the dark one (html[data-sl-dark] with
 * app/theme-dark.css), and measures:
 *
 *   FIVE        the row holds five figures: Members, Active members,
 *               Visitors, Engagement, Revenue for a community that sells;
 *               Join rate in Revenue's place for one before part 184 has
 *               nothing to sell; never more than five
 *   THE MENU    at the row's end, always on screen (a phone's row scrolls,
 *               the menu does not); it lists the three others with their
 *               numbers; choosing Churn puts it where the chosen figure was,
 *               chooses it, moves nothing on the page and shifts no layout;
 *               the row is kept on a reload; Default figures brings the five
 *               back
 *   FILLS       every share bar ([data-bar]) in the community's details and
 *               in /app's cards is the grey gradient (#f8f9fb to #eff1f4),
 *               none violet; dark, a graphite step (#2a2a2f), none violet
 *
 *   node scripts/check-community-analytics-round38.mjs
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
const dir = join(root, ".community-analytics-r38-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-analytics-r38-")), "shots")
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

/** What the row and the fills are now. */
const LOOK = () => {
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }
  }
  const card = document.querySelector("[data-trend]")
  const strip = card?.querySelector("[role=tablist]")
  const menu = card?.querySelector("[data-figure-menu]")
  return {
    vw: innerWidth,
    scrollW: document.scrollingElement.scrollWidth,
    docH: document.scrollingElement.scrollHeight,
    card: box(card),
    tabs: [...(strip?.querySelectorAll("[role=tab]") ?? [])].map((el) => ({ key: el.getAttribute("data-tab"), selected: el.getAttribute("aria-selected") === "true", ...box(el) })),
    strip: strip ? { scroll: strip.scrollWidth - strip.clientWidth, ...box(strip) } : null,
    menu: box(menu),
    figure: document.querySelector("[data-analytics]")?.getAttribute("data-figure") ?? null,
    details: box(document.querySelector("[data-card=details]")),
  }
}

/** Every share bar on the page: its painted gradient, and whether any of it is violet. */
const FILLS = () =>
  [...document.querySelectorAll("[data-bar]")].map((el) => {
    const cs = getComputedStyle(el)
    const paint = `${cs.backgroundImage} ${cs.backgroundColor} ${cs.boxShadow}`
    const grey = (cs.backgroundImage.includes("rgb(248, 249, 251)") && cs.backgroundImage.includes("rgb(239, 241, 244)")) || (cs.backgroundImage.includes("rgb(232, 234, 238)") && cs.backgroundImage.includes("rgb(220, 223, 228)"))
    return { grey, graphite: cs.backgroundImage.includes("rgb(42, 42, 47)"), violet: /139,\s*92,\s*246|8b5cf6|167,\s*139,\s*250/i.test(paint), w: Math.round(el.getBoundingClientRect().width) }
  })

let server
let browser
try {
  const css = (await appCss(root)) + "\n" + readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const faces = interFaces(root)
  const community = bundle("scripts/render-community-analytics-round31.tsx", "community.js")
  const reports = bundle("scripts/render-analytics-reports.tsx", "reports.js")
  const page = (src, dark) => `<!doctype html><html class="light"${dark ? " data-sl-dark" : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/${src}"></script></body></html>`
  server = createServer((req, res) => {
    const path = req.url.split("?")[0]
    const dark = req.url.includes("dark=1")
    if (path === "/community.js" || path === "/reports.js") {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(path === "/community.js" ? community : reports)
    }
    const flag = /^\/flags\/([A-Z]{2})\.svg$/.exec(path)
    if (flag && existsSync(join(root, "public/flags", `${flag[1]}.svg`))) {
      res.writeHead(200, { "content-type": "image/svg+xml" })
      return res.end(readFileSync(join(root, "public/flags", `${flag[1]}.svg`)))
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(page(path.startsWith("/reports") ? "reports.js" : "community.js", dark))
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
    await p.goto(`${origin}/community?case=full&delay=60`, { waitUntil: "load" })
    await sleep(1400)
    let look = await p.evaluate(LOOK)

    console.log(`\n${label}: five figures`)
    expect(errors.length === 0, "the section renders without an error", errors)
    expect(look.tabs.map((t) => t.key).join() === "members,active,visitors,engagement,revenue", "Members, Active members, Visitors, Engagement, Revenue", look.tabs.map((t) => t.key))
    expect(!!look.menu && look.menu.right <= look.card.right && look.menu.x >= look.strip.right - 1, "the other figures' menu at the row's end", { menu: look.menu, strip: look.strip?.right })
    expect(look.menu && look.menu.right <= look.vw && look.menu.h >= 44, "on screen and a finger's size", look.menu)
    if (phone) expect(look.strip.scroll > 0 && look.scrollW <= look.vw, "on a phone the five scroll inside their row, never the page", { strip: look.strip.scroll, scrollW: look.scrollW })
    else expect(look.strip.scroll <= 0, "all five in one row", look.strip.scroll)
    await p.screenshot({ path: join(shots, `${label}-community-light.png`), fullPage: true })

    /* The menu: the three others with their numbers, then Churn in the chosen one's place. */
    await p.click("[data-figure-menu]")
    await sleep(phone ? 500 : 250)
    const listed = await p.evaluate(() => [...document.querySelectorAll("[role=menuitem], [data-sheet] button, [role=dialog] button")].map((b) => b.textContent.trim()).filter(Boolean))
    expect(["New members", "Join rate", "Churn"].every((x) => listed.some((l) => l.startsWith(x))), "it lists New members, Join rate and Churn", listed)
    await p.screenshot({ path: join(shots, `${label}-community-menu.png`), fullPage: !phone })
    const before = await p.evaluate(() => {
      window.__shift = 0
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__shift += e.value
      }).observe({ type: "layout-shift", buffered: false })
      return { card: document.querySelector("[data-trend]").getBoundingClientRect().toJSON(), docH: document.scrollingElement.scrollHeight }
    })
    const picked = await p.evaluate(() => {
      const el = [...document.querySelectorAll("[role=menuitem], [role=dialog] button")].find((b) => b.textContent.trim().startsWith("Churn"))
      el?.click()
      return !!el
    })
    await sleep(phone ? 900 : 700)
    look = await p.evaluate(LOOK)
    const after = await p.evaluate(() => ({ card: document.querySelector("[data-trend]").getBoundingClientRect().toJSON(), docH: document.scrollingElement.scrollHeight, shift: window.__shift }))
    expect(picked && look.tabs.map((t) => t.key).join() === "churn,active,visitors,engagement,revenue" && look.figure === "churn" && look.tabs[0].selected, "Churn takes Members' place, and is the one on screen", { tabs: look.tabs.map((t) => t.key), figure: look.figure })
    expect(Math.abs(after.card.height - before.card.height) < 1 && Math.abs(after.card.top - before.card.top) < 1, "the chart card does not move or change size", { before: before.card.height, after: after.card.height })
    expect(after.shift < 0.001, "no layout shift", after.shift)
    await p.reload({ waitUntil: "load" })
    await sleep(1400)
    look = await p.evaluate(LOOK)
    expect(look.tabs.map((t) => t.key).join() === "churn,active,visitors,engagement,revenue", "kept on a reload", look.tabs.map((t) => t.key))
    await p.click("[data-figure-menu]")
    await sleep(phone ? 500 : 250)
    await p.evaluate(() => [...document.querySelectorAll("[role=menuitem], [role=dialog] button")].find((b) => b.textContent.trim() === "Default figures")?.click())
    await sleep(phone ? 900 : 600)
    look = await p.evaluate(LOOK)
    expect(look.tabs.map((t) => t.key).join() === "members,active,visitors,engagement,revenue", "Default figures brings the five back", look.tabs.map((t) => t.key))

    /* The fills, in the details: how people joined (members), where visitors came from, the top posts. */
    console.log(`\n${label}: the fills`)
    const all = []
    for (const key of ["members", "visitors", "engagement", "revenue"]) {
      await p.evaluate((k) => document.querySelector(`[data-trend] [role=tab][data-tab="${k}"]`)?.click(), key)
      await sleep(700)
      all.push(...(await p.evaluate(FILLS)))
      if (key === "visitors") await p.screenshot({ path: join(shots, `${label}-community-visitors-light.png`), fullPage: true })
    }
    expect(all.length >= 8 && all.every((f) => f.grey && !f.violet), "every share bar is the light grey gradient, none violet", { bars: all.length, notGrey: all.filter((f) => !f.grey).length, violet: all.filter((f) => f.violet).length })
    await ctx.close()

    /* Dark. */
    const ctxD = await browser.createBrowserContext()
    const d = await ctxD.newPage()
    await d.setViewport(vp)
    await d.goto(`${origin}/community?case=full&delay=60&dark=1`, { waitUntil: "load" })
    await sleep(1400)
    await d.evaluate(() => document.querySelector(`[data-trend] [role=tab][data-tab="visitors"]`)?.click())
    await sleep(800)
    const dark = await d.evaluate(FILLS)
    expect(dark.length > 0 && dark.every((f) => f.graphite && !f.violet), "dark: a graphite step, none violet", { bars: dark.length, graphite: dark.filter((f) => f.graphite).length })
    await d.screenshot({ path: join(shots, `${label}-community-visitors-dark.png`), fullPage: true })
    await ctxD.close()

    /* Before part 184, selling nothing: what there is, never more than five. */
    const ctxN = await browser.createBrowserContext()
    const q = await ctxN.newPage()
    await q.setViewport(vp)
    await q.goto(`${origin}/community?case=nopart&delay=60`, { waitUntil: "load" })
    await sleep(1400)
    const nl = await q.evaluate(LOOK)
    expect(nl.tabs.map((t) => t.key).join() === "members,joined,active,churn" && !nl.menu, "before part 184: the four there are, and no menu", { tabs: nl.tabs.map((t) => t.key), menu: !!nl.menu })
    await ctxN.close()

    /* /app Analytics: the cards' fills. */
    for (const theme of ["light", "dark"]) {
      const ctxR = await browser.createBrowserContext()
      const r = await ctxR.newPage()
      await r.emulateTimezone("Europe/Bucharest")
      await r.setViewport(vp)
      await r.goto(`${origin}/reports${theme === "dark" ? "?dark=1" : ""}`, { waitUntil: "load" })
      await r.waitForSelector("section")
      await r.evaluate(() => window.__release())
      await sleep(1200)
      const f = await r.evaluate(FILLS)
      if (theme === "light") expect(f.length >= 10 && f.every((x) => x.grey && !x.violet), "/app Analytics: every list row, funnel step and channel bar is the grey gradient, none violet", { bars: f.length, notGrey: f.filter((x) => !x.grey).length, violet: f.filter((x) => x.violet).length })
      else expect(f.length >= 10 && f.every((x) => x.graphite && !x.violet), "/app Analytics, dark: a graphite step, none violet", { bars: f.length, graphite: f.filter((x) => x.graphite).length })
      await r.screenshot({ path: join(shots, `${label}-app-reports-${theme}.png`), fullPage: true })
      await ctxR.close()
    }
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall measured")
process.exit(broken ? 1 : 0)
