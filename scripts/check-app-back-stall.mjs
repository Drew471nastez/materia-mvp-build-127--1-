/**
 * ===========================================================================
 *  THE SELLER'S WAY BACK, FILMED
 * ===========================================================================
 * "Sometimes trying to go back from a checkout or whatever takes too much and
 * blocks." The buyer's side was filmed and fixed in scripts/check-back-stall.mjs;
 * this is the same instrument pointed at the seller's screens, where a back
 * press does not just change a page but drops a full screen layer
 * (components/app/page-layer.tsx) that stays live until the page behind
 * commits.
 *
 * IT FILMS THE SCREEN, with the DevTools screencast, and that is the whole
 * point: a page that is not being drawn runs no animation frames either, so
 * nothing measured from inside the page can see a freeze. This bug was
 * mis-measured twice that way.
 *
 * Per case: ms from the press to the first frame that differs, ms to the list
 * behind fully painted, and the longest stretch of film with no change at all.
 *
 *   SLOW      the list behind takes 2.5s. The press must be answered, the
 *             editor must be seen to leave, and nothing may stand still
 *             waiting for the network.
 *   DEAD      `history.back()` that does nothing (an entry the browser
 *             replaced, an editor opened straight from a link, a web view
 *             that reports a length it cannot go back through). The layer
 *             used to sit there for LAYER_PRESS_KEPT_MS (8s) and then come
 *             back to life on the same editor. Something must happen, and it
 *             must be the list.
 *   NATIVE    the Android hardware key and the iOS swipe in the installed
 *             app, through the real Capacitor listener
 *             (components/app/native-back-handler.tsx), with the same back
 *             made into a no-op.
 *
 *   PROBE_CSS=source node scripts/check-app-back-stall.mjs
 *   BEFORE=<git ref> films that commit's way back instead of this one's.
 *   ONLY=products|coupons|native narrows it.
 */
import { execFileSync } from "node:child_process"
import { Buffer } from "node:buffer"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".app-back-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-app-back-")), "shots")
mkdirSync(shots, { recursive: true })
const BEFORE = process.env.BEFORE || ""
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null
const wanted = (name) => !ONLY || ONLY.includes(name)
let broken = 0
const rows = []
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The router, as far as these pages can see one: every call logged, the page for it drawn by the harness. */
writeFileSync(
  join(stubs, "navigation.js"),
  `import { useSyncExternalStore } from "react"
const subs = new Set()
const read = () => location.pathname + location.search
const commit = () => { for (const f of [...subs]) f() }
for (const m of ["pushState", "replaceState"]) {
  const original = history[m].bind(history)
  history[m] = (...a) => { original(...a); commit() }
}
window.addEventListener("popstate", () => setTimeout(commit, 0))
const log = (k, a) => (window.__router ||= []).push([k, a])
const go = (mode, href) => { log(mode, href); window.dispatchEvent(new CustomEvent("probe-nav", { detail: { mode, href } })) }
const router = {
  push: (h) => go("push", h),
  replace: (h) => go("replace", h),
  prefetch: (h) => log("prefetch", h),
  back: () => { log("back"); history.back() },
  refresh: () => log("refresh"),
}
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => location.pathname, () => "/app/products")
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => location.search, () => ""))
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
)
/* The installed app, as far as the back handler can see one: the listener it registers is handed to the probe. */
writeFileSync(
  join(stubs, "capacitor-app.js"),
  `export const App = {
  addListener: async (name, cb) => { if (name === "backButton") window.__nativeBack = cb; return { remove() {} } },
  exitApp: () => { window.__exited = true },
}
`,
)
writeFileSync(
  join(stubs, "native-bridge.js"),
  `/* lib/native-bridge, answering "yes, the installed app" and doing nothing else. */
export const isNativeApp = () => true
export const isNative = () => true
export const isIOS = () => false
export const isAndroid = () => true
export const hapticTap = () => {}
export const triggerHaptic = async () => false
export const openExternal = (u) => { window.__external = u }
export const nativeAuthStart = () => {}
export const nativeAppReady = () => {}
export const nativeAppReadyForce = () => {}
export const setNativeAuthInProgress = () => {}
export const isNativeAuthInProgress = () => false
export const sanitizeNativeHome = (d) => d || "/app"
export const cacheNativeHome = async () => {}
export const getCachedNativeHome = async () => null
export const nativeLogOut = () => {}
export const nativeLogout = async () => {}
export const startNativeGoogleOAuth = async () => ({ ok: false })
export const handleNativeOAuthCallback = async () => ({ ok: false })
`,
)

/*
  BEFORE: the way back as it was at that commit, with everything else as it is
  now. The same trick as scripts/check-back-stall.mjs, over the three modules
  the fix touched.
*/
const BEFORE_MODULES = [
  ["app/app/products/list-return.ts", /app\/app\/products\/list-return$/],
  ["app/app/coupons/list-return.ts", /app\/app\/coupons\/list-return$/],
  ["components/app/native-back-handler.tsx", /components\/app\/native-back-handler$/],
]
const beforeFiles = []
if (BEFORE) {
  mkdirSync(join(stubs, "before"), { recursive: true })
  for (const [path] of BEFORE_MODULES) {
    const file = join(stubs, "before", path.replace(/[/]/g, "__"))
    writeFileSync(file, execFileSync("git", ["show", `${BEFORE}:${path}`], { cwd: root, encoding: "utf8" }))
    beforeFiles.push(file)
  }
}

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-app-back-stall.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    "next/navigation": "./.app-back-probe/navigation.js",
    "@capacitor/app": "./.app-back-probe/capacitor-app.js",
    "@/lib/native-bridge": "./.app-back-probe/native-bridge.js",
  },
  plugins: BEFORE
    ? [
        {
          name: "before",
          setup: (b) =>
            BEFORE_MODULES.forEach(([, filter], i) => b.onResolve({ filter }, () => ({ path: beforeFiles[i] }))),
        },
      ]
    : [],
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty", ".svg": "dataurl" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const reader = await browser.newPage()

/** The list, then the editor open over it, the way the list opens one. */
const open = async (vp, query) => {
  const p = await browser.newPage()
  await p.setViewport(vp)
  p.__errors = []
  p.on("pageerror", (e) => p.__errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().startsWith("https://storelib.com/") ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.abort()))
  await p.goto(`https://storelib.com/app/products?${query}`, { waitUntil: "load" })
  await p.waitForSelector("[data-probe-list]")
  await sleep(300)
  await p.evaluate(() => window.__open())
  await p.waitForSelector("[data-probe-editor]")
  await sleep(600)
  return p
}

/* Film from now, run `act` (which returns the press's own times), film on for `ms`. */
const film = async (p, vp, act, ms) => {
  const cdp = await p.createCDPSession()
  const frames = []
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1, maxWidth: Math.round(vp.width / 2), maxHeight: Math.round(vp.height / 2) })
  await sleep(400)
  const at = await act()
  await sleep(ms)
  await cdp.send("Page.stopScreencast")
  await sleep(100)
  frames.sort((a, b) => a.t - b.t)
  return { at, frames }
}

/* Each frame against the first: how much of it differs, and how much of the list's teal band is showing. */
const measure = (frames, vp) =>
  reader.evaluate(
    async (frames, vp) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/jpeg;base64," + src })
      const cv = document.createElement("canvas")
      cv.width = vp.width
      cv.height = vp.height
      const x = cv.getContext("2d", { willReadFrequently: true })
      let base = null
      const out = []
      for (const f of frames) {
        const img = await load(f.data)
        x.drawImage(img, 0, 0, vp.width, vp.height)
        const d = x.getImageData(0, 0, vp.width, vp.height).data
        if (!base) base = d.slice()
        let diff = 0, teal = 0, bandN = 0
        for (let y = 0; y < vp.height; y += 4) for (let xx = 0; xx < vp.width; xx += 4) {
          const i = (y * vp.width + xx) * 4
          if (Math.max(Math.abs(d[i] - base[i]), Math.abs(d[i + 1] - base[i + 1]), Math.abs(d[i + 2] - base[i + 2])) > 6) diff++
          if (y >= 80 && y < 240) { teal += Math.max(0, d[i + 1] - d[i]) / 103; bandN++ }
        }
        out.push({ t: f.t, diff, list: +(teal / bandN).toFixed(2) })
      }
      return out
    },
    frames,
    vp,
  )

const press = async (p, sel) => {
  const box = await p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await p.evaluate(() => {
    window.__down = 0
    window.__click = 0
    addEventListener("pointerdown", (e) => { window.__down = performance.timeOrigin + e.timeStamp }, { capture: true, once: true })
    addEventListener("click", (e) => { window.__click = performance.timeOrigin + e.timeStamp }, { capture: true, once: true })
  })
  await p.mouse.move(box.x, box.y)
  await p.mouse.down()
  await sleep(60)
  await p.mouse.up()
  await sleep(5)
  return p.evaluate(() => ({ down: window.__down, click: window.__click }))
}

/*
  What the film says about one press: when the screen first changed, when the
  list behind was fully painted, and the longest it stood perfectly still.
*/
const read = (m, at, until) => {
  const after = m.filter((f) => f.t > at.click)
  const atClick = [...m].reverse().find((f) => f.t <= at.click) || m[0]
  /* The press is held down for 60ms before the click that answers it, as a finger is, so this includes that hold. */
  const pressed = m.find((f) => f.t > at.down && f.diff >= 6)
  const first = after.find((f) => Math.abs(f.diff - atClick.diff) >= 200)
  const full = after.find((f) => f.list > 0.95)
  const end = full ? full.t : until
  const ts = [at.click, ...after.filter((f) => f.t <= end).map((f) => f.t), end]
  let still = 0
  for (let i = 1; i < ts.length; i++) still = Math.max(still, ts[i] - ts[i - 1])
  const r = (v) => (v === undefined || v === null ? null : Math.round(v))
  return {
    firstChange: r(pressed && pressed.t - at.down),
    leaveSeen: r(first && first.t - at.click),
    painted: r(full && full.t - at.click),
    freeze: r(still),
  }
}

/** A dead history entry: back() reports nothing, because it does nothing. */
const killBack = (p) => p.evaluate(() => { history.back = () => {} })

const VPS = [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: false, deviceScaleFactor: 1 }],
  ["desktop-1280", { width: 1280, height: 860 }],
].filter(([l]) => !process.env.ONLY_VP || l.startsWith(process.env.ONLY_VP))

try {
  for (const [label, vp] of VPS) {
    for (const list of ["products", "coupons"]) {
      if (!wanted(list)) continue
      const what = list === "coupons" ? "coupon editor" : "product editor"

      /* ── SLOW ── the list behind takes 2.5s: nothing may stand still waiting for it. */
      {
        const name = `${label} ${what} Back, list behind 2500ms`
        console.log(`\n${name}`)
        const p = await open(vp, `list=${list}&delay=2500`)
        const { at, frames } = await film(p, vp, () => press(p, "[data-editor-back]"), 3400)
        const m = await measure(frames, vp)
        const got = read(m, at, at.click + 3400)
        rows.push([name, got])
        console.log("  ", JSON.stringify(got))
        const mid = m.find((f) => f.list > 0.2 && f.list < 0.85)
        if (mid) writeFileSync(join(shots, `${label}-${list}-midleave.jpg`), Buffer.from(frames.find((f) => f.t === mid.t).data, "base64"))
        await p.screenshot({ path: join(shots, `${label}-${list}-slow.png`) })
        expect(got.firstChange !== null && got.firstChange < 260, "the press shows at once (the 60ms the finger is held included)", got.firstChange)
        expect(got.freeze !== null && got.freeze < 420, "no stretch of the film stands still for the page behind", got.freeze)
        expect(got.painted !== null, "and the list behind arrives", got.painted)
        expect(p.__errors.length === 0, "no errors on the page", p.__errors)
        await p.close()
      }

      /* ── DEAD ── history.back() that does nothing at all. */
      {
        const name = `${label} ${what} Back with a dead history entry`
        console.log(`\n${name}`)
        const p = await open(vp, `list=${list}&delay=160`)
        await killBack(p)
        const { at, frames } = await film(p, vp, () => press(p, "[data-editor-back]"), 3000)
        const m = await measure(frames, vp)
        const got = read(m, at, at.click + 3000)
        const landed = await p.evaluate(() => ({ path: location.pathname, list: !!document.querySelector("[data-probe-list]"), router: (window.__router || []).map(([k]) => k) }))
        rows.push([name, got])
        console.log("  ", JSON.stringify({ ...got, ...landed }))
        await p.screenshot({ path: join(shots, `${label}-${list}-dead.png`) })
        expect(got.firstChange !== null && got.firstChange < 260, "the press shows at once (the 60ms the finger is held included)", got.firstChange)
        expect(landed.list, "a back that did nothing ends on the list itself", landed)
        expect(got.painted !== null && got.painted < 1800, "and it is painted inside two seconds", got.painted)
        expect(p.__errors.length === 0, "no errors on the page", p.__errors)
        await p.close()
      }
    }

    /* ── NATIVE ── the Android hardware key, through the real Capacitor listener, with a dead entry. */
    if (wanted("native")) {
      const name = `${label} the app's hardware back, dead history entry`
      console.log(`\n${name}`)
      const p = await open(vp, "list=products&delay=160")
      await killBack(p)
      const { at, frames } = await film(
        p,
        vp,
        async () => {
          const t = await p.evaluate(() => {
            const now = performance.timeOrigin + performance.now()
            window.__nativeBack?.({ canGoBack: true })
            return now
          })
          return { down: t, click: t }
        },
        3000,
      )
      const m = await measure(frames, vp)
      const got = read(m, at, at.click + 3000)
      const landed = await p.evaluate(() => ({ path: location.pathname, list: !!document.querySelector("[data-probe-list]"), exited: !!window.__exited }))
      rows.push([name, got])
      console.log("  ", JSON.stringify({ ...got, ...landed }))
      await p.screenshot({ path: join(shots, `${label}-native-dead.png`) })
      expect(landed.list, "a hardware back that did nothing ends on the list itself", landed)
      expect(!landed.exited, "and it never offers to leave the app from inside an editor", landed)
      expect(got.painted !== null && got.painted < 1800, "painted inside two seconds", got.painted)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.close()
    }
  }
} finally {
  await browser.close()
  try { rmSync(stubs, { recursive: true, force: true }) } catch { /* nothing to clear */ }
}

console.log("\n─ case ─────────────────────────────────────────────────  first change / painted / freeze")
for (const [name, got] of rows) console.log(`  ${name.padEnd(54)}  ${got.firstChange ?? "-"} / ${got.painted ?? "-"} / ${got.freeze ?? "-"}`)
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
