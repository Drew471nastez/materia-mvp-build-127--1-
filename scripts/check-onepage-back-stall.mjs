/**
 * ===========================================================================
 *  A HELD BACK OUT OF THE ONEPAGE EDITOR, FILMED
 * ===========================================================================
 * "Sometimes trying to go back from a checkout or whatever takes too much and
 * blocks." With work unsaved the OnePage editor holds Back and asks
 * (lib/ui/leave-guard.ts, components/onepage/onepage-editor.tsx): the hold
 * puts the editor's own entry back, and Discard then pops from it.
 *
 * THAT POP DOES NOT ALWAYS GO ANYWHERE. An entry the browser replaced, the
 * editor opened straight from a link or the app's start screen, a web view
 * that reports a length it cannot go back through: `history.back()` reports
 * nothing when it does nothing, so Discard left the editor sitting there with
 * the question gone and nothing else happening for LEAVE_REVIVE_MS (12s), and
 * then simply held Back again.
 *
 * This films the screen with the DevTools screencast, as the other back
 * probes do, because a page that is not being drawn runs no animation frames
 * of its own and nothing measured from inside it can see a freeze. It reports
 * ms from the press on Discard to the first frame that differs, ms to the
 * navigation that takes the editor away, and the longest stretch of film with
 * no change at all.
 *
 * The real editor, the real leave guard, stubs for the network and Supabase
 * (the same ones as scripts/check-onepage-editor.mjs). The full journey with
 * a real Next build is scripts/check-onepage-leave.mjs.
 *
 *   PROBE_CSS=source node scripts/check-onepage-back-stall.mjs
 *   BEFORE=<git ref> films that commit's editor instead of this one's.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || "/opt/pw-browsers/chromium"
const BEFORE = process.env.BEFORE || ""
const dir = join(root, ".onepage-back-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), "storelib-onepage-back-"))
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The router, as far as the editor can see one: every call logged with the moment it was made. */
writeFileSync(
  join(dir, "navigation.js"),
  `const at = () => performance.timeOrigin + performance.now()
/* Kept in sessionStorage, because the way out ends in a real document load when the soft one does not land (navigate-ceiling). */
const log = (k, h) => {
  const all = JSON.parse(sessionStorage.getItem("__router") || "[]")
  all.push({ kind: k, href: h, at: at() })
  sessionStorage.setItem("__router", JSON.stringify(all))
  window.dispatchEvent(new CustomEvent("probe-nav", { detail: h }))
}
export const usePathname = () => "/app/onepage"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, refresh: () => {}, back: () => { log("back"); history.back() } })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
)
writeFileSync(
  join(dir, "link.jsx"),
  `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`,
)
writeFileSync(
  join(dir, "image.jsx"),
  `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`,
)
writeFileSync(
  join(dir, "supabase.js"),
  `const result = { data: { onboarding_completed: true }, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`,
)

/* BEFORE: the editor's way out as it was at that commit, everything else as it is now. */
let beforeFile = ""
if (BEFORE) {
  /* Beside the real one, so its own relative imports (./live-preview, ./tabs/...) still resolve. */
  beforeFile = join(root, "components/onepage/.probe-back-editor.tsx")
  writeFileSync(beforeFile, execFileSync("git", ["show", `${BEFORE}:components/onepage/onepage-editor.tsx`], { cwd: root, encoding: "utf8" }))
}

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-onepage-editor.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_APP_URL": '"https://storelib.com"',
    "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://placeholder.supabase.co"',
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"placeholder"',
  },
  alias: {
    "@": ".",
    "next/navigation": "./.onepage-back-probe/navigation.js",
    "next/link": "./.onepage-back-probe/link.jsx",
    "next/image": "./.onepage-back-probe/image.jsx",
    "@/lib/supabase/client": "./.onepage-back-probe/supabase.js",
  },
  plugins: BEFORE
    ? [{ name: "before", setup: (b) => b.onResolve({ filter: /components\/onepage\/onepage-editor$/ }, () => ({ path: beforeFile })) }]
    : [],
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
  outfile: join(dir, "probe.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const css = await appCss(root)
const js = readFileSync(join(dir, "probe.js"), "utf8")
/*
  The page the editor leaves for, drawn where the router would draw it: a teal
  band, so the film can say when it is painted, `delay` after the push. The
  editor's own /app is a page of the shell this probe does not mount.
*/
const stand = `<script>window.__delay = 160
addEventListener("probe-nav", (e) => {
  if (typeof e.detail !== "string") return
  setTimeout(() => {
    const d = document.createElement("div")
    d.setAttribute("data-probe-landed", "")
    d.style.cssText = "position:fixed;inset:0;z-index:2147483600;background:#fff"
    d.innerHTML = '<div style="height:320px;background:#0f766e"></div>'
    document.body.append(d)
  }, window.__delay)
})</script>`
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>${stand}<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const reader = await browser.newPage()
const rows = []

const open = async (vp) => {
  const p = await browser.newPage()
  await p.setViewport(vp)
  p.__errors = []
  p.on("pageerror", (e) => p.__errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (!url.startsWith("https://storelib.com/")) return r.abort()
    if (url.includes("/api/billing/subscription")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ currentPlan: { id: "pro" } }) })
    if (url.includes("/api/")) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
    return r.respond({ status: 200, contentType: "text/html", body: html })
  })
  await p.goto("https://storelib.com/app/onepage#settings", { waitUntil: "load" })
  await p.waitForSelector("[data-scroll-container]")
  await sleep(1200)
  return p
}

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
        let diff = 0
        for (let y = 0; y < vp.height; y += 4) for (let xx = 0; xx < vp.width; xx += 4) {
          const i = (y * vp.width + xx) * 4
          if (Math.max(Math.abs(d[i] - base[i]), Math.abs(d[i + 1] - base[i + 1]), Math.abs(d[i + 2] - base[i + 2])) > 6) diff++
        }
        out.push({ t: f.t, diff })
      }
      return out
    },
    frames,
    vp,
  )

/** Something typed in Settings: the page's name, which marks the editor unsaved. */
const edit = async (p) => {
  const input = await p.waitForSelector("input[placeholder='Your name or brand']", { visible: true, timeout: 8000 })
  await input.click()
  await p.keyboard.type(" x")
  await sleep(500)
  const dirty = await p.evaluate(() => [...document.querySelectorAll("[data-onepage-editor] header span")].some((s) => s.textContent.trim() === "Unsaved"))
  if (!dirty) throw new Error("typing the name did not mark the editor unsaved")
}

/*
  The press on Discard, on the control itself. A synthetic mouse press at the
  middle of its box lands on the question's scrim instead when the question is
  still settling, and closing the question is not the case under test.
*/
const press = async (p, sel) =>
  p.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) throw new Error(`no ${sel}`)
    const t = performance.timeOrigin + performance.now()
    el.click()
    return { down: t, click: t }
  }, sel)

const VPS = [
  ["desktop-1280", { width: 1280, height: 860 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }],
].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))

try {
  for (const [label, vp] of VPS) {
    /*
      The way out is the app's home. Soft first, and, when that does not land,
      the address loaded for real at NAVIGATE_CEILING_MS
      (lib/website-builder/navigate-ceiling). Both endings are filmed: neither
      may leave the editor sitting there.
    */
    const CASES = [["a dead history entry", 160], ["a dead history entry and a page out that never comes", -1]].filter(([, d]) => !process.env.ONLY_DELAY || String(d) === process.env.ONLY_DELAY)
    for (const [name, delay] of CASES) {
      const title = `${label} Discard after a held Back, ${name}`
      console.log(`\n${title}`)
      const p = await open(vp)
      await p.evaluate((d) => { window.__delay = d }, delay)
      /*
        The entry the editor sits on, as the router leaves it: its own marker
        in the state (the guard puts an unmarked entry back untouched), with
        one entry behind it to go back to.
      */
      await p.evaluate(() => {
        history.replaceState({ __NA: true }, "", location.href)
        history.pushState({ __NA: true }, "", location.href)
      })
      await edit(p)
      /* The Back the guard holds: a real one, so the question comes up. */
      await p.evaluate(() => history.back())
      await p.waitForSelector("[data-unsaved-discard]", { visible: true, timeout: 5000 })
      await sleep(400)
      /* And from here the entry behind is dead: back() reports nothing, because it does nothing. */
      await p.evaluate(() => { history.back = () => {} })
      const until = delay < 0 ? 4200 : delay + 2400
      const { at, frames } = await film(p, vp, () => press(p, "[data-unsaved-discard]"), until)
      const m = await measure(frames, vp)
      const after = m.filter((f) => f.t > at.click)
      const atClick = [...m].reverse().find((f) => f.t <= at.click) || m[0]
      const pressed = m.find((f) => f.t > at.down && f.diff >= 6)
      const nav = await p.evaluate(() => JSON.parse(sessionStorage.getItem("__router") || "[]").find((r) => r.kind === "push" || r.kind === "replace") || null)
      /* Arrived: the stand-in page the router drew, or the document the ceiling loaded when it did not. */
      const landed = await p.evaluate(() => !!document.querySelector("[data-probe-landed]") || location.pathname === "/app")
      const end = nav ? nav.at : at.click + until
      const ts = [at.click, ...after.filter((f) => f.t <= end).map((f) => f.t), end]
      let still = 0
      for (let i = 1; i < ts.length; i++) still = Math.max(still, ts[i] - ts[i - 1])
      const r = (v) => (v === undefined || v === null ? null : Math.round(v))
      const got = {
        firstChange: r(pressed && pressed.t - at.down),
        leftFor: nav ? nav.href : null,
        navMs: nav ? r(nav.at - at.click) : null,
        freeze: r(still),
        landed,
      }
      rows.push([title, got])
      console.log("  ", JSON.stringify(got))
      if (process.env.PROBE_DEBUG) console.log("   debug:", JSON.stringify(await p.evaluate(() => ({ router: window.__router, asking: !!document.querySelector("[data-unsaved-discard]"), leaving: !!document.querySelector("[data-onepage-leaving]"), len: history.length, path: location.pathname + location.hash }))))
      await p.screenshot({ path: join(shots, `${label}-${delay}-dead.png`) })
      expect(got.firstChange !== null && got.firstChange < 300, "the press shows at once (the 60ms the finger is held included)", got.firstChange)
      expect(got.navMs !== null, "a back that did nothing is followed by somewhere real", { nav })
      expect(got.leftFor === "/app", "and that somewhere is the app", got.leftFor)
      expect(got.navMs !== null && got.navMs < 1600, "inside a second and a half, not twelve seconds of nothing", got.navMs)
      expect(got.freeze !== null && got.freeze < 2700, "and nothing stands still longer than the watch and the ceiling", got.freeze)
      expect(got.landed, "the page it left for arrives, softly or as a document", got.landed)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.close()
    }
  }
} finally {
  await browser.close()
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* nothing to clear */ }
  if (beforeFile) try { rmSync(beforeFile, { force: true }) } catch { /* nothing to clear */ }
}

console.log("\n─ case ──────────────────────────────────────────────────────  first change / left at / freeze")
for (const [name, got] of rows) console.log(`  ${name.padEnd(58)}  ${got.firstChange ?? "-"} / ${got.navMs ?? "-"} / ${got.freeze ?? "-"}`)
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
