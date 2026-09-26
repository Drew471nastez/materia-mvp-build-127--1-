/**
 * ===========================================================================
 *  A PRESS ON HOME MOVES LIKE A PRESS IN THE SIDEBAR OR THE PILL
 * ===========================================================================
 * "It should not be a direct animation randomly taking me to that page. It
 * should be the same as when I'm navigating throughout the app in the
 * sidebar or the mobile navigation pill."
 *
 * Home, the rail's rows and the phone pill inside the real stage and bar
 * (scripts/render-home-nav.tsx), with a router whose "server" answers a page
 * fetched ahead on the next frame and any other after 450ms. Every frame
 * from the press to 900ms after it is recorded: the address, the page on
 * screen, the landing's opacity and rise, the spinner's surface and the bar.
 *
 *   1440, a mouse   the rail's Analytics row, then Home's View Analytics
 *                   tile, each hovered and clicked: both land on the next
 *                   frame, with the same landing frame for frame, no bar, no
 *                   spinner, no document load. Getting started's "Build your
 *                   online store" (a whole document load before) and the
 *                   plan's Upgrade to Pro land the same way. For contrast, a
 *                   press on a link nothing fetched ahead: what Home's links
 *                   were.
 *   390, a finger   the pill's Analytics, then Home's View Analytics and the
 *                   next Getting started step, tapped: the same.
 *
 *   node scripts/check-home-nav.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".home-nav-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `import { useMemo, useSyncExternalStore } from "react"
const sub = (f) => { window.__listeners.add(f); return () => window.__listeners.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__address.path)
export const useSearchParams = () => { const s = useSyncExternalStore(sub, () => window.__address.search); return useMemo(() => new URLSearchParams(s), [s]) }
export const useRouter = () => window.__router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
/* Next's Link, as far as a click goes: the page's own handler, then the router, unless the page prevented it. */
writeFileSync(join(dir, "link.jsx"), `import React from "react"
const Link = React.forwardRef(function Link({ href, children, prefetch, scroll, replace, onClick, ...rest }, ref) {
  return React.createElement("a", { ref, href, ...rest, onClick: (e) => {
    if (onClick) onClick(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    window.__router.push(href)
  } }, children)
})
export default Link
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, priority, fill, sizes, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) {
  return React.createElement("img", { src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", alt: alt || "", width, height, ...rest })
}
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: [], error: null, count: 0 }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-home-nav.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:next/image=${join(dir, "image.jsx")}`, `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
let fontDir = null
const fonts = interFaces(root).replace(/url\(file:\/\/([^)]*\/static\/media)\/([^)]+)\)/g, (_, d, f) => { fontDir = d; return `url(/__font/${f})` })
const html = `<!doctype html><html class="light app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${fonts}</style><style>${await appCss(root)}</style><style>html,body{margin:0;height:100%;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const server = createServer((req, res) => {
  if (req.url.startsWith("/__font/") && fontDir) {
    try { res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(join(fontDir, req.url.slice(8)))) } catch { res.writeHead(404); res.end() }
    return
  }
  if (req.url.startsWith("/api/") || /\.(png|jpe?g|webp|svg)(\?|$)/.test(req.url)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const report = {}

/** Frames from now until `ms` after: the page showing, its first box's opacity and rise, the spinner, the bar. */
const record = (page, ms) => page.evaluate((ms) => new Promise((resolve) => {
  const frames = []
  const t0 = performance.now()
  const tick = () => {
    const scroller = document.querySelector(".app-content-scroll")
    const top = scroller?.firstElementChild
    const cs = top ? getComputedStyle(top) : null
    /* The landing itself, as the stage started it: every animation on the page's first box. */
    const anims = top ? top.getAnimations().map((a) => {
      const timing = a.effect?.getTiming?.() ?? {}
      return { duration: timing.duration, easing: timing.easing, keyframes: (a.effect?.getKeyframes?.() ?? []).map((k) => ({ opacity: k.opacity, translate: k.translate })) }
    }) : []
    frames.push({
      anims,
      t: Math.round(performance.now() - t0),
      path: window.__address.path,
      page: top?.getAttribute("data-page") ?? (top?.classList.contains("dashboard-scroll-container") ? "home" : "?"),
      opacity: cs ? +(+cs.opacity).toFixed(3) : null,
      rise: cs ? +(parseFloat((cs.translate || "0 0").split(" ")[1] || "0") || 0).toFixed(2) : null,
      spinner: !!document.querySelector("[data-app-slow-page]"),
      bar: !!document.querySelector("[data-app-nav-progress]"),
      marker: window.__marker === "same-document",
    })
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    else resolve(frames)
  }
  requestAnimationFrame(tick)
}), ms)

/**
 * What a recording says: when the page changed, how it landed (the first
 * 260ms after the commit, as [ms after the commit, opacity, rise]), what
 * else showed.
 */
function summary(frames, to) {
  const at = frames.findIndex((f) => f.page === to)
  const t0 = at < 0 ? 0 : frames[at].t
  const landing = at < 0 ? [] : frames.slice(at).filter((f) => f.t - t0 <= 260).map((f) => [f.t - t0, f.opacity, f.rise])
  const spec = at < 0 ? [] : (frames.slice(at, at + 4).find((f) => f.anims.length)?.anims ?? [])
  return {
    commitMs: at < 0 ? null : frames[at].t,
    landing,
    spec: JSON.stringify(spec),
    spinner: frames.some((f) => f.spinner),
    bar: frames.some((f) => f.bar),
    reloaded: frames.some((f) => !f.marker),
  }
}
/** A landing's opacity and rise at `ms` after its commit, between the frames either side. */
function at(landing, ms) {
  let prev = landing[0]
  for (const f of landing) {
    if (f[0] >= ms) {
      if (f[0] === prev[0]) return [f[1], f[2]]
      const k = (ms - prev[0]) / (f[0] - prev[0])
      return [prev[1] + (f[1] - prev[1]) * k, prev[2] + (f[2] - prev[2]) * k]
    }
    prev = f
  }
  return [prev[1], prev[2]]
}
/**
 * Two landings the same: the stage started the same animation on the page
 * (duration, curve and keyframes, read off the Animation itself), and every
 * frame drawn of either lies on that one curve (the rise is 2px times what
 * is left of the fade) and has settled by 260ms. Read this way rather than
 * frame against frame, because which frames a busy machine gets to draw is
 * not part of the landing.
 */
function sameLanding(a, b) {
  if (!a.spec || a.spec === "[]" || a.spec !== b.spec) return false
  const onCurve = (l) => l.length >= 6 && l.every(([, o, r]) => Math.abs(r - 2 * (1 - o)) <= 0.05) && Math.abs(l.at(-1)[1] - 1) <= 0.01
  return onCurve(a.landing) && onCurve(b.landing)
}
void at

async function goHome(page) {
  await page.evaluate(() => window.__router.push("/app"))
  await page.waitForFunction(() => window.__address.path === "/app" && !!document.getElementById("getting-started"), { timeout: 10000 })
  await wait(700)
}

try {
  /* ── A computer, with a mouse ──────────────────────────────────────────── */
  {
    console.log("\n1440, a mouse")
    const MOUSE = "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"
    const browser = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", MOUSE, "--window-size=1440,1000"], headless: true })
    const [page] = await browser.pages()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(`${base}/app`)
    await page.waitForSelector("#getting-started", { timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)
    await wait(800)

    const hoverThenClick = async (selector, dwell = 300) => {
      const handle = await page.evaluateHandle((sel) => {
        const el = typeof sel === "string" ? document.querySelector(sel) : null
        return el
      }, selector)
      const el = handle.asElement()
      if (!el) throw new Error(`nothing at ${selector}`)
      await el.evaluate((n) => n.scrollIntoView({ block: "center", behavior: "instant" }))
      await wait(600)
      const box = await el.boundingBox()
      await page.mouse.move(box.x + Math.min(40, box.width / 2), box.y + box.height / 2, { steps: 4 })
      await wait(dwell)
      const rec = record(page, 900)
      await page.mouse.down()
      await page.mouse.up()
      return await rec
    }

    /* The rail. */
    const rail = summary(await hoverThenClick("[data-rail] a[href='/app/analytics']"), "analytics")
    expect(rail.commitMs != null && rail.commitMs <= 60, "the rail: hovered, the page lands without a server wait", rail.commitMs)
    await goHome(page)

    /* Home's tile, the same page. */
    const tile = summary(await hoverThenClick("a[data-quick-action][href='/app/analytics']"), "analytics")
    expect(tile.commitMs != null && tile.commitMs <= 60, "Home's View Analytics: hovered, it lands without a server wait too", tile.commitMs)
    expect(sameLanding(rail, tile), "with the same landing: the same animation, and every frame on its curve", { spec: tile.spec, rail: rail.landing, tile: tile.landing })
    expect(!rail.spinner && !tile.spinner && !rail.bar && !tile.bar, "no spinner and no bar, either way", { rail, tile })
    expect(!rail.reloaded && !tile.reloaded, "no document load, either way")
    report.desktop = { spec: JSON.parse(rail.spec), rail: { commitMs: rail.commitMs, landing: rail.landing }, tile: { commitMs: tile.commitMs, landing: tile.landing, sameSpec: rail.spec === tile.spec } }
    await goHome(page)

    /* Getting started's website step: a whole document load before. */
    const store = summary(await hoverThenClick("#getting-started a[href='/app/website-builder']"), "website-builder")
    expect(store.commitMs != null && store.commitMs <= 60 && !store.reloaded, "Publish your website lands in the shell without a server wait, no document load", store.commitMs)
    expect(sameLanding(rail, store), "  with the rail's landing", store.landing)
    await goHome(page)

    /* The plan's button: the plans page is drawn over the shell; it lands, with no spinner by design. */
    const upgrade = summary(await hoverThenClick("[aria-labelledby=your-plan-title] a[href='/app/settings/billing/upgrade']"), "settings-billing-upgrade")
    expect(upgrade.commitMs != null && upgrade.commitMs <= 60 && !upgrade.reloaded && !upgrade.spinner, "Upgrade to Pro lands without a server wait, no document load", upgrade.commitMs)
    await goHome(page)

    /* For contrast: a link nothing fetched ahead, which is what every link on Home was. */
    const cold = await (async () => {
      const rec = record(page, 900)
      await page.evaluate(() => {
        /* Forgotten by the router's stand-in, and pressed without a hover: nothing fetched ahead. */
        window.__forget("/app/settings")
        const a = document.querySelector("#getting-started a[href='/app/settings?tab=domains']")
        a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))
      })
      return summary(await rec, "settings")
    })()
    console.log(`  ..    a link nothing fetched ahead waits for the server: lands at ${cold.commitMs}ms, bar ${cold.bar ? "shown" : "not shown"}`)
    report.desktop.cold = { commitMs: cold.commitMs, bar: cold.bar }
    expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
    await browser.close()
  }

  /* ── A phone, with a finger ─────────────────────────────────────────────── */
  {
    console.log("\n390, a finger")
    const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    await page.goto(`${base}/app`)
    await page.waitForSelector("#getting-started", { timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)
    await wait(900)

    const tapOn = async (selector) => {
      const el = await page.$(selector)
      if (!el) throw new Error(`nothing at ${selector}`)
      await el.evaluate((n) => n.scrollIntoView({ block: "center", behavior: "instant" }))
      await wait(700)
      const box = await el.boundingBox()
      const rec = record(page, 900)
      await page.touchscreen.tap(box.x + Math.min(40, box.width / 2), box.y + box.height / 2)
      return await rec
    }

    /* A tap is two touch events sent over the wire and a frame drawn at 3x: what matters is no wait for a server (450ms here) and no slower than the pill. */
    const pill = summary(await tapOn("[data-app-nav-pill] a[aria-label='Analytics']"), "analytics")
    expect(pill.commitMs != null && pill.commitMs < 200, "the pill's Analytics lands without waiting for the server (fetched when the pill mounted)", pill.commitMs)
    await goHome(page)

    const tile = summary(await tapOn("a[data-quick-action][href='/app/analytics']"), "analytics")
    expect(tile.commitMs != null && tile.commitMs <= pill.commitMs + 20, "Home's View Analytics, tapped, lands as soon as the pill's does", { tile: tile.commitMs, pill: pill.commitMs })
    expect(sameLanding(pill, tile), "with the same landing: the same animation, and every frame on its curve", { spec: tile.spec, pill: pill.landing, tile: tile.landing })
    expect(!pill.spinner && !tile.spinner && !pill.reloaded && !tile.reloaded, "no spinner, no document load, either way")
    await goHome(page)

    /* The next step: fetched ahead once Getting started was seen. */
    const nextHref = await page.$eval("#getting-started [data-next-step]", (a) => a.getAttribute("href"))
    const nextId = (nextHref || "").replace(/^\/app\//, "").replace(/[?#].*$/, "").replace(/\//g, "-")
    await page.$eval("#getting-started", (n) => n.scrollIntoView({ block: "center" }))
    await wait(400)
    const step = nextHref ? summary(await tapOn("#getting-started [data-next-step]"), nextId) : null
    expect(!!step && step.commitMs != null && step.commitMs <= pill.commitMs + 20 && !step.reloaded, `the next step (${nextHref}), fetched once the card was seen, lands as soon as the pill's does`, step?.commitMs)
    expect(!!step && sameLanding(pill, step), "  with the pill's landing", step?.landing)
    report.phone = { pill: { commitMs: pill.commitMs, landing: pill.landing }, tile: { commitMs: tile.commitMs, landing: tile.landing }, step: { href: nextHref, commitMs: step?.commitMs } }
    expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
    await browser.close()
  }
} finally {
  server.close()
}
console.log(`\n${JSON.stringify(report)}`)
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
