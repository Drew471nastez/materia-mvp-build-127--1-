/**
 * ===========================================================================
 *  ROUND 17: THE ACCOUNT PAGE'S PILLS AND SETTINGS' SECTION PILLS, FRAME BY FRAME
 * ===========================================================================
 * The owner: "Paid communities, library, settings: switching in between pill
 * shapes is not smooth there, fully fix it all complete." The library has its
 * own probe (scripts/check-library-switch.mjs); this one presses the profile's
 * pills (Activity, Posts, Communities) and Settings' sections (Profile,
 * Account, Privacy, Notifications, Preferences) in the real components
 * (scripts/render-pills17.tsx), at a quarter of the CPU's speed, and reads
 * every frame from the finger landing:
 *
 *   WAIT       from the press to the first frame the next content is on the
 *              glass. A page the router was not asked to read ahead waits
 *              for the server (350ms here), the old page on screen
 *   NO BLANK   the content under the pills is never under 0.5 opacity (a
 *              fade from nothing is a blank frame)
 *   ONE        never two panels or sections on the glass at once
 *   NO SKELETON  a section once read is never drawn as its skeleton again,
 *              and Notifications is read ahead, so its pill draws it at once
 *   THE PILL   its own fill only rises, in place, nothing on it scales; a
 *              finger's tap at the phone size switches on the first try
 *   STILL      the pill row does not move; the scroll stays where it was
 *
 * At 390x844 (touch) and 1440x900. A filmstrip of one press on each surface
 * at each size is written to SHOTS_DIR.
 *
 *   PROBE_CSS=source node scripts/check-pills17.mjs
 *   ROOT=dir        render another checkout (the base, for the before frames)
 *   REPORT_ONLY=1   print the numbers, do not fail
 *   SIZES=390 SURFACES=account,settings
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const here = process.cwd()
const root = process.env.ROOT || here
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const faces = interFaces(root)
const fontDir = (faces.match(/url\(file:\/\/([^)]*\/static\/media)\//) ?? [])[1]
const inter = fontDir ? faces.split(`file://${fontDir}/`).join("/font/") : ""
const stubs = join(root, ".pills17-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-pills17-")), "shots")
mkdirSync(shots, { recursive: true })
const REPORT_ONLY = !!process.env.REPORT_ONLY
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : REPORT_ONLY ? "--  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `import { createContext, useContext } from "react"
const PathContext = (window.__PathContext ||= createContext(null))
const note = (h) => { try { (window.__prefetched ||= new Set()).add(String(h).split("?")[0]) } catch {} }
const router = { push: (h) => window.__navigate && window.__navigate(h), replace: (h) => window.__navigate && window.__navigate(h), prefetch: (h) => note(h), back: () => history.back(), refresh: () => {}, forward: () => {} }
export const usePathname = () => useContext(PathContext) ?? location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`)
/* A Link with prefetch={true} is read whole when it is on screen, as Next does; prefetch false or unset (a dynamic page) is not. */
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  React.useEffect(() => { if (prefetch === true) (window.__prefetched ||= new Set()).add(String(href).split("?")[0]) }, [href, prefetch])
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); window.__navigate && window.__navigate(href) } } }, children)
})
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, preload, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }
`)
writeFileSync(join(stubs, "supabase.js"), `const USER = { id: "u1", email: "alex@example.com", user_metadata: {} }
const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : chain(), apply: () => chain() })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: USER } }), getSession: async () => ({ data: { session: { user: USER } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: chain, rpc: chain, channel: () => { const c = { on: () => c, subscribe: () => c }; return c }, removeChannel() {} } }
export function isNativePlatform() { return false }
export const capacitorStorage = {}
`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(here, "scripts/render-pills17.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(here, "node_modules")],
  plugins: [
    {
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({ path: join(stubs, { "next/navigation": "navigation.js", "next/link": "link.jsx", "next/image": "image.jsx" }[a.path]) }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase.js") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    },
  ],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`

/* The Notifications section's own read, answered after a moment, as the server does. */
const PUSH = { enabled: true, devices: 1, kinds: {}, emails: {}, communities: [], tz: "Europe/Lisbon", quiet: null }
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (fontDir && url.pathname.startsWith("/font/")) {
    try {
      res.writeHead(200, { "content-type": "font/woff2" })
      return res.end(readFileSync(join(fontDir, decodeURIComponent(url.pathname.slice(6)))))
    } catch {
      res.writeHead(404)
      return res.end()
    }
  }
  if (url.pathname.startsWith("/api/")) {
    const body = url.pathname.includes("push") || url.pathname.includes("notification") ? PUSH : { items: [], posts: [], next: null }
    return setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(body))
    }, 250)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] })

async function open(vp, path) {
  const page = await browser.newPage()
  page.errors = []
  page.on("pageerror", (e) => page.errors.push(String(e)))
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && page.errors.push(`console: ${m.text()}`))
  await page.setViewport(vp)
  await page.goto(`${origin}${path}`, { waitUntil: "load" })
  await page.waitForSelector("[data-probe-path]")
  return page
}

/* Every frame from the finger landing, read in the frame (rAF), for `ms`. */
async function sample(page, kind, target, ms) {
  await page.evaluate(
    (kind, target, ms) => {
      window.__sample = new Promise((resolve) => {
        const out = []
        let t0 = 0
        let shift = 0
        const po = new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            if (e.hadRecentInput) continue
            const nodes = (e.sources || []).map((x) => x.node).filter(Boolean)
            if (nodes.length && nodes.every((n) => n.closest?.("footer, [data-fake-footer]") || n.matches?.("footer"))) continue
            shift += e.value
          }
        })
        po.observe({ type: "layout-shift", buffered: false })
        const eff = (el) => {
          let o = 1
          for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const s = getComputedStyle(n)
            if (s.display === "none" || (s.visibility === "hidden" && n === el)) return 0
            o *= parseFloat(s.opacity)
          }
          return o
        }
        const step = () => {
          const t = performance.now() - t0
          const f = { t: Math.round(t), scrollY: Math.round(window.scrollY) }
          if (kind === "account") {
            const shown = [...document.querySelectorAll("[data-probe-path]")].filter((n) => eff(n) > 0.02)
            f.screens = shown.length
            f.path = shown[0]?.getAttribute("data-probe-path") ?? null
            f.op = shown.length ? Math.round(Math.min(...shown.map(eff)) * 1000) / 1000 : 0
            const pill = document.querySelector(`[data-profile-owner-pill="${target}"]`)
            const fill = pill?.querySelector("[data-profile-owner-pill-fill]") ?? pill?.querySelector("span[aria-hidden]:not([data-pill-press])")
            f.fill = fill ? Math.round(parseFloat(getComputedStyle(fill).opacity) * 1000) / 1000 : null
            f.rowTop = Math.round((document.querySelector("[data-profile-owner-pills]")?.getBoundingClientRect().top ?? 0) * 10) / 10
            f.scaled = [...document.querySelectorAll("[data-profile-owner-pill], [data-profile-owner-pill] span")].filter((n) => !["none", "1"].includes(getComputedStyle(n).scale)).length
            f.on = document.querySelector('[data-profile-owner-pill][data-active="true"]')?.getAttribute("data-profile-owner-pill") ?? null
          } else {
            const panes = [...document.querySelectorAll("[data-account-section-pane], [data-account-panel-swap]")].filter((n) => eff(n) > 0.02 && n.getBoundingClientRect().height > 0)
            f.screens = panes.length
            const pane = panes[0]
            f.path = pane ? pane.getAttribute("data-account-section-pane") || pane.getAttribute("data-account-panel") : null
            f.op = panes.length ? Math.round(Math.min(...panes.map(eff)) * 1000) / 1000 : 0
            f.skeleton = !!document.querySelector('[data-account-card="notifications-loading"]') && eff(document.querySelector('[data-account-card="notifications-loading"]')) > 0.02
            const pill = [...document.querySelectorAll(`[data-account-section="${target}"]`)].find((n) => n.getBoundingClientRect().height > 0)
            const fill = pill?.querySelector("[data-account-section-fill]")
            f.fill = fill ? Math.round(parseFloat(getComputedStyle(fill).opacity) * 1000) / 1000 : null
            f.rowTop = Math.round(((document.querySelector("[data-account-sections]") || document.querySelector("[data-account-section-list]"))?.getBoundingClientRect().top ?? 0) * 10) / 10
            f.scaled = [...document.querySelectorAll("[data-account-section], [data-account-section] span")].filter((n) => !["none", "1"].includes(getComputedStyle(n).scale)).length
            f.on = [...document.querySelectorAll('[data-account-section][data-active="true"]')].find((n) => n.getBoundingClientRect().height > 0)?.getAttribute("data-account-section") ?? null
          }
          out.push(f)
          if (t < ms) requestAnimationFrame(step)
          else {
            po.disconnect()
            resolve({ f: out, cls: shift })
          }
        }
        document.addEventListener(
          "pointerdown",
          () => {
            t0 = performance.now()
            step()
          },
          { capture: true, once: true },
        )
      })
    },
    kind,
    target,
    ms,
  )
}

async function press(page, vp, selector) {
  /* The visible one: Settings draws its sections twice, a row on a phone and a list on a computer. */
  const handle = await page.evaluateHandle((sel) => [...document.querySelectorAll(sel)].find((n) => n.getBoundingClientRect().height > 0), selector)
  if (vp.hasTouch) await handle.tap()
  else await handle.click()
}

/* The compositor's own frames from the press, as pictures (the trace's screenshots). */
async function filmstrip(page, vp, run, name) {
  await page.tracing.start({ screenshots: true, categories: ["disabled-by-default-devtools.screenshot", "devtools.timeline"] })
  const result = await run()
  const buf = await page.tracing.stop()
  const trace = JSON.parse(Buffer.from(buf).toString("utf8"))
  const pics_ = trace.traceEvents.filter((e) => e.name === "Screenshot" && e.args?.snapshot)
  const down = trace.traceEvents.find((e) => e.name === "EventDispatch" && ["pointerdown", "mousedown", "touchstart"].includes(e.args?.data?.type))
  const base = down ? down.ts : pics_[0]?.ts ?? 0
  const before = pics_.filter((e) => e.ts < base).at(-1)
  const after = pics_.filter((e) => e.ts >= base && e.ts <= base + 900_000)
  const all = [...(before ? [before] : []), ...after]
  const used = all.length <= 24 ? all : Array.from({ length: 24 }, (_, i) => all[Math.round((i * (all.length - 1)) / 23)])
  const w = vp.width > 600 ? 360 : 195
  const pics = await Promise.all(used.map((f) => sharp(Buffer.from(f.args.snapshot, "base64")).resize({ width: w }).png().toBuffer()))
  if (!pics.length) return result
  const meta = await sharp(pics[0]).metadata()
  const cols = Math.min(vp.width > 600 ? 4 : 6, pics.length)
  const rows = Math.ceil(pics.length / cols)
  const gap = 6
  const labelH = 18
  const composites = []
  pics.forEach((p, i) => {
    const x = (i % cols) * (w + gap)
    const y = Math.floor(i / cols) * (meta.height + labelH + gap)
    const ms = Math.round((used[i].ts - base) / 1000)
    composites.push({ input: p, left: x, top: y + labelH })
    composites.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${labelH}"><text x="2" y="13" font-family="Arial" font-size="12" fill="#111">#${i} ${ms < 0 ? "before press" : `+${ms}ms`}</text></svg>`), left: x, top: y })
  })
  await sharp({ create: { width: cols * (w + gap), height: rows * (meta.height + labelH + gap), channels: 3, background: "#ffffff" } }).composite(composites).png().toFile(join(shots, `${name}.png`))
  console.log(`    filmstrip: ${join(shots, `${name}.png`)} (${after.length} frames in the 900ms after the press)`)
  return result
}

const rises = (xs) => xs.filter((v, i) => i > 0 && v > xs[i - 1] + 0.002).length
const summary = []

const SURFACES = (process.env.SURFACES || "account,settings").split(",")
const SIZES = (process.env.SIZES || "390,1440").split(",")
const PLAN = {
  account: { path: "/account", moves: [["activity", "posts"], ["posts", "communities"], ["communities", "activity"], ["activity", "posts"]], sel: (k) => `[data-profile-owner-pill="${k}"]`, pathOf: { activity: "/account", posts: "/account/posts", communities: "/account/communities" } },
  settings: { path: "/account/settings", moves: [["profile", "notifications"], ["notifications", "privacy"], ["privacy", "notifications"], ["notifications", "profile"]], sel: (k) => `[data-account-section="${k}"]`, pathOf: null },
}

for (const [label, vp] of [["390", PHONE], ["1440", DESK]].filter(([l]) => SIZES.includes(l))) {
  for (const surface of SURFACES) {
    const plan = PLAN[surface]
    let page = await open(vp, plan.path)
    /* The page settles and reads ahead whatever it reads ahead when idle. */
    await sleep(2400)
    await page.evaluate(() => window.scrollTo(0, 60))
    await sleep(150)
    let cdp = await page.createCDPSession()
    console.log(`\n${surface} pills at ${label}, CPU 4x`)
    for (const [from, to] of plan.moves) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await sample(page, surface, to, 900)
      await press(page, vp, plan.sel(to))
      const { f, cls } = await page.evaluate(() => window.__sample)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      await sleep(400)
      const want = plan.pathOf ? plan.pathOf[to] : to
      const arrived = f.find((x) => x.path === want)
      const blank = f.filter((x, i) => i > 0 && x.op < 0.5)
      const two = f.filter((x) => x.screens > 1)
      const skeleton = f.filter((x) => x.skeleton)
      const fills = f.map((x) => x.fill).filter((v) => v !== null && v !== undefined)
      const rowTops = [...new Set(f.map((x) => x.rowTop))]
      const scrolls = [...new Set(f.map((x) => x.scrollY))]
      const lit = f.findIndex((x) => x.on === to)
      const line = { surface, label, from, to, waitMs: arrived?.t ?? null, litFrame: lit, minOpacity: Math.min(...f.slice(1).map((x) => x.op)), blankFrames: blank.length, twoAtOnce: two.length, skeletonFrames: skeleton.length, scrolls, cls: Math.round(cls * 10000) / 10000 }
      summary.push(line)
      console.log(`    ${from} -> ${to}: pill lit at frame ${lit}; next content on the glass at ${line.waitMs}ms; lowest opacity ${line.minOpacity}; ${blank.length} blank frames; ${two.length} frames with two at once; ${skeleton.length} skeleton frames; scroll ${JSON.stringify(scrolls)}; CLS ${line.cls}`)
      expect(!!arrived, "one tap: the next content arrives", f.at(-1))
      /* A server answer here is 350ms and then the render (150 to 300ms at a quarter speed): anything past 350ms waited for it. */
      expect(arrived && arrived.t < 350, "it never waits for the server: on the glass in under 350ms of the finger landing at a quarter speed", arrived?.t)
      expect(lit >= 0 && lit <= 3, "the pill lights in the press's own frames", lit)
      expect(blank.length === 0, "no blank frame: the content under the pills never drops under half", blank.slice(0, 4).map((x) => `${x.t}:${x.op}`))
      expect(two.length === 0, "never two panels at once", two.length)
      expect(skeleton.length === 0, "no skeleton: a section is drawn whole when its pill is pressed", skeleton.length)
      /* Settings on a computer is a list beside the section, not pills: it has no fill of its own to read. */
      if (fills.length || surface !== "settings" || vp.width < 1024) expect(fills.length > 1 && fills.every((v, i) => i === 0 || v >= fills[i - 1] - 0.002) && fills.at(-1) >= 0.999 && rises(fills) >= 1, "the pill's own fill fades in where it is, only up", fills.slice(0, 8))
      expect(f.every((x) => !x.scaled), "nothing on a pill scales", f.filter((x) => x.scaled).length)
      expect(rowTops.length === 1, "the pill row does not move", rowTops)
      expect(scrolls.length === 1, "the scroll stays where it was", scrolls)
    }
    expect(page.errors.length === 0, "no page errors", page.errors.slice(0, 3))
    await page.close()

    /* The filmstrip: the first move again on a fresh page (a first press, as the owner makes it), with the trace's own pictures. Tracing costs frames, so it is pictured, not timed. */
    page = await open(vp, plan.path)
    await sleep(2400)
    await page.evaluate(() => window.scrollTo(0, 60))
    await sleep(150)
    cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const [, to] = plan.moves[0]
    await filmstrip(
      page,
      vp,
      async () => {
        await sample(page, surface, to, 900)
        await press(page, vp, plan.sel(to))
        return page.evaluate(() => window.__sample)
      },
      `${surface}-${label}`,
    )
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await page.close()
  }
}

writeFileSync(join(shots, "summary.json"), JSON.stringify(summary, null, 2))
await browser.close()
server.close()
console.log(`\nShots and summary.json: ${shots}`)
if (broken && !REPORT_ONLY) {
  console.error(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log(broken ? `\n${broken} check(s) not met (REPORT_ONLY)` : "\nAll pill checks passed")
