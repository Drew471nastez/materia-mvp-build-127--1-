/**
 * ===========================================================================
 *  ROUND 29: THE /app SIDEBAR'S COLLAPSE, AND THE INTEGRATIONS PILLS, MEASURED
 * ===========================================================================
 * The real sidebar beside the real Integrations page (scripts/render-sidebar-
 * round29.tsx), in headless Chromium:
 *
 *   the control   an icon in the sidebar's top corner, lined up with the
 *                 chevrons open and with the icons collapsed; a tooltip after
 *                 a short hover with what it does and ⌘B (Mac) or Ctrl+B;
 *                 the shortcut toggles, and does nothing while typing
 *   the motion    every frame of a collapse and an expand: the sidebar's
 *                 width, the page's edge, the content's left, the icons, the
 *                 labels and Settings each move one way only, over many
 *                 frames, and land where they should; reduced motion lands
 *                 at once
 *   the pills     each pill's number is the cards it shows, no card twice,
 *                 each category holds exactly its integrations, working ones
 *                 before Coming soon; a switch crossfades (the two layers add
 *                 up to one every frame), the height eases instead of
 *                 jumping, and no logo is loaded or mounted again
 *
 *   PROBE_CSS=source node scripts/check-sidebar-round29.mjs
 *
 * Pictures go to SHOTS_DIR (.round29-shots) to look at.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".sidebar-round29-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round29-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* What the store has, for the stubbed /api answers, and so what Installed must hold. */
const API = {
  "/api/store/integrations/installed": { installed: [] },
  "/api/store/integrations": { tracking: { ga4: "G-TEST123" }, ready: true },
  "/api/physical/integrations": {
    integrations: [
      { provider: "printful", status: "connected", url: null, keyHint: "1234", secretHint: null, lastSyncAt: null, lastError: null },
      { provider: "custom_webhook", status: "disconnected", url: null, keyHint: null, secretHint: null, lastSyncAt: null, lastError: null },
    ],
  },
  "/api/store/integrations/marketing": { marketing: [{ provider: "klaviyo", connected: true, keyHint: "abcd", account: "Mara", listId: "L1", listName: "News", lastError: null }] },
  "/api/store/integrations/apps": { states: { "storelib-email-marketing": "on", "storelib-markets": "setup", "storelib-code": "off", "storelib-bundles": "on", "storelib-reviews": "on", "courier-tracking": "on" }, hrefs: {} },
  "/api/store/integrations/catalog": { overrides: [] },
  "/api/store/reviews-app": { settings: { enabled: true } },
  "/api/store/tracking-app": { tracking: { own: { provider: "aftership", providerName: "AfterShip" } } },
}
const EXPECTED_INSTALLED = ["storelib-reviews", "courier-tracking", "storelib-email-marketing", "storelib-bundles", "google-analytics", "klaviyo", "aftership", "printful"].sort()
/* Storelib's own apps that fit a category (the rest only under Storelib apps and All). */
const APP_IN = { "storelib-email-marketing": "email" }

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => location.pathname
const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }
  return {
    channel() { const ch = { on() { return ch }, subscribe() { return ch } }; return ch },
    removeChannel() {},
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from() { return q },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  const common = {
    bundle: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.sidebar-round29-probe/navigation.js", "next/link": "./.sidebar-round29-probe/link.jsx", "next/image": "./.sidebar-round29-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    loader: { ".css": "empty" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  }
  await build({ ...common, entryPoints: [join(root, "scripts/render-sidebar-round29.tsx")], format: "iife", outfile: join(stubs, "page.js"), banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" } })
  /* The catalog itself, for what each category must hold. */
  writeFileSync(join(stubs, "catalog-entry.ts"), `export { visibleIntegrations, CATEGORY_ORDER, CATEGORY_NAMES } from "@/lib/integrations/catalog"\nexport { storelibApps } from "@/lib/integrations/storelib-apps"\nexport { hasBuiltInArt } from "@/components/app/settings/integration-mark"\n`)
  await build({ ...common, entryPoints: [join(stubs, "catalog-entry.ts")], format: "esm", platform: "node", outfile: join(stubs, "catalog.mjs"), external: ["react", "react-dom", "lucide-react"] })
  const catalog = await import(pathToFileURL(join(stubs, "catalog.mjs")).href)

  const css = await appCss(root)
  const fonts = interFaces(root)
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  /* The harness draws the shell with the layout's own classes. */
  console.log("\nThe harness is the layout\n")
  {
    const layout = readFileSync(join(root, "app/app/layout.tsx"), "utf8")
    const harness = readFileSync(join(root, "scripts/render-sidebar-round29.tsx"), "utf8")
    const cls = (src, re) => re.exec(src)?.[1]
    const mainL = cls(layout, /<main className="([^"]+)"/)
    const mainH = cls(harness, /MAIN_CLASS =\s*"([^"]+)"/)
    const rootL = cls(layout, /<div className="([^"]+)" data-app-rail=\{rail\}/)
    const rootH = cls(harness, /ROOT_CLASS = "([^"]+)"/)
    expect(!!mainL && mainL === mainH, "the page's <main> has app/app/layout.tsx's classes", mainL === mainH ? undefined : { mainL, mainH })
    expect(!!rootL && rootL === rootH, "and so has the shell's root", rootL === rootH ? undefined : { rootL, rootH })
  }

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, { vp = DESK, mac = false, reducedMotion = false } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    if (mac) await p.evaluateOnNewDocument(() => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" })
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => ({ platform: "macOS" }) })
    })
    else await p.evaluateOnNewDocument(() => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "Linux x86_64" })
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => ({ platform: "Linux" }) })
    })
    if (reducedMotion) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "").split("?")[0]
        const body = API[short] ?? {}
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      /* The logos are the real files in /public. */
      if (url.startsWith(`${ORIGIN}/integrations/`)) {
        const file = join(root, "public", decodeURIComponent(new URL(url).pathname))
        const ext = file.split(".").pop()
        const type = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[ext] ?? "application/octet-stream"
        try {
          return void r.respond({ status: 200, contentType: type, body: readFileSync(file), headers: { "cache-control": "max-age=3600" } })
        } catch {
          return void r.respond({ status: 404, body: "" })
        }
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("file:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(900)
    if (!(await p.$("[data-rail-aside]"))) throw new Error(`the shell did not draw: ${errors.join(" | ") || (await p.evaluate(() => document.body.innerHTML.slice(0, 400)))}`)
    return { p, errors }
  }

  // ── The control ────────────────────────────────────────────────────────────
  console.log("\nThe collapse control\n")
  {
    const { p, errors } = await open("/app/integrations")
    const g = await p.evaluate(() => {
      const aside = document.querySelector("[data-rail-aside]")
      const t = aside.querySelector("[data-rail-toggle]")
      const tb = t.getBoundingClientRect()
      const ab = aside.getBoundingClientRect()
      const chev = aside.querySelector("[data-nav-chevron]").getBoundingClientRect()
      const dash = aside.querySelector('[data-nav-row][href="/app"]').getBoundingClientRect()
      const settings = aside.querySelector('[data-nav-row][href="/app/settings"]')
      const below = settings.parentElement.querySelectorAll("[data-rail-toggle]").length
      return {
        w: tb.width, h: tb.height, top: tb.top - ab.top, centre: tb.left + tb.width / 2 - ab.left, chevCentre: chev.left + chev.width / 2 - ab.left,
        dashTop: dash.top - ab.top, gapToDash: dash.top - tb.bottom, text: t.textContent.trim(), label: t.getAttribute("aria-label"), expanded: t.getAttribute("aria-expanded"),
        controls: !!document.getElementById(t.getAttribute("aria-controls")), keys: t.getAttribute("aria-keyshortcuts"), title: t.getAttribute("title"), belowSettings: below,
        svg: !!t.querySelector("svg"),
        timing: [aside, document.querySelector("main")].map((el) => { const cs = getComputedStyle(el); return `${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}` }),
      }
    })
    report.control = g
    expect(g.w === 30 && g.h === 30 && g.svg && g.text === "", "an icon, 30 by 30, no words on it", { w: g.w, h: g.h, text: g.text })
    expect(g.belowSettings === 0, "no longer under Settings")
    expect(g.timing[0] === "width 0.22s cubic-bezier(0.2, 0, 0, 1)" && g.timing[1] === "padding-left 0.22s cubic-bezier(0.2, 0, 0, 1)", "the sidebar's width and the page's edge on one duration and one curve (--rail-ms, --rail-ease)", g.timing)
    expect(g.top < 20 && g.gapToDash >= 0, "in the sidebar's top corner, above the rows, overlapping none", { top: g.top, gapToDash: g.gapToDash, dashboardRowTop: g.dashTop })
    expect(Math.abs(g.centre - g.chevCentre) <= 0.5, "open, it lines up with the rows' chevrons", { centre: g.centre, chevron: g.chevCentre })
    expect(g.label === "Collapse sidebar" && g.expanded === "true" && g.controls && g.keys === "Control+B" && !g.title, "named Collapse sidebar, aria-expanded, controls the sidebar, Control+B, no native title", { label: g.label, expanded: g.expanded, keys: g.keys })

    /* The tooltip: not on a pass, there after a short hover, with the shortcut. */
    const t = await p.$("[data-rail-toggle]")
    const tb = await t.boundingBox()
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
    await sleep(150)
    const early = await p.evaluate(() => !!document.querySelector("[data-rail-tip]"))
    await sleep(400)
    const tip = await p.evaluate(() => {
      const el = document.querySelector("[data-rail-tip]")
      if (!el) return null
      const b = el.getBoundingClientRect()
      const t = document.querySelector("[data-rail-toggle]").getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { text: el.textContent, keys: [...el.querySelectorAll("kbd")].map((k) => k.textContent), role: el.getAttribute("role"), left: b.left - t.right, midDy: b.top + b.height / 2 - (t.top + t.height / 2), h: b.height, w: b.width, onScreen: b.right <= innerWidth && b.top >= 0, bg: cs.backgroundColor, fs: cs.fontSize, radius: cs.borderRadius, opacity: cs.opacity }
    })
    report.tooltip = tip
    expect(!early, "not shown on a pointer passing over (150ms)")
    expect(!!tip && tip.text.startsWith("Collapse sidebar") && tip.keys.join("+") === "Ctrl+B" && tip.role === "tooltip", "after a short hover: Collapse sidebar, Ctrl B (not a Mac)", tip && { text: tip.text, keys: tip.keys })
    expect(!!tip && tip.left >= 6 && tip.left <= 10 && Math.abs(tip.midDy) <= 1 && tip.onScreen && tip.h <= 30, "beside the icon, centred on it, small, on screen", tip && { gap: tip.left, midDy: tip.midDy, h: tip.h, w: tip.w })
    await p.screenshot({ path: join(shots, "control-open-tooltip.png"), clip: { x: 0, y: 0, width: 520, height: 300 } })
    await p.mouse.move(700, 600)
    await sleep(80)
    expect(!(await p.evaluate(() => !!document.querySelector("[data-rail-tip]"))), "and gone as the pointer leaves")

    /* The shortcut. */
    const railOf = () => p.evaluate(() => document.querySelector("[data-app-rail]").getAttribute("data-app-rail"))
    await p.keyboard.down("Control"); await p.keyboard.press("b"); await p.keyboard.up("Control")
    await sleep(400)
    const afterCtrl = await railOf()
    const cookie = await p.evaluate(() => document.cookie)
    await p.keyboard.down("Meta"); await p.keyboard.press("b"); await p.keyboard.up("Meta")
    await sleep(300)
    const afterMeta = await railOf()
    await p.focus("[data-integrations-search]")
    await p.keyboard.down("Control"); await p.keyboard.press("b"); await p.keyboard.up("Control")
    await sleep(300)
    const whileTyping = await railOf()
    await p.evaluate(() => document.activeElement.blur())
    expect(afterCtrl === "collapsed" && /sl_rail=collapsed/.test(cookie), "Ctrl+B collapses it, and the choice is kept", { afterCtrl, cookie })
    expect(afterMeta === "collapsed", "⌘B does nothing off a Mac", afterMeta)
    expect(whileTyping === "collapsed", "and Ctrl+B in the search box is the box's, not the sidebar's", whileTyping)

    const c = await p.evaluate(() => {
      const aside = document.querySelector("[data-rail-aside]")
      const ab = aside.getBoundingClientRect()
      const inner = aside.clientWidth
      const t = aside.querySelector("[data-rail-toggle]")
      const tb = t.getBoundingClientRect()
      const icons = [...aside.querySelectorAll("[data-nav-row] [data-nav-icon]")].map((i) => { const b = i.getBoundingClientRect(); return b.left + b.width / 2 - ab.left })
      const labels = [...aside.querySelectorAll("[data-nav-row] [data-nav-label]")].map((l) => +getComputedStyle(l).opacity)
      const chev = [...aside.querySelectorAll("[data-nav-chevron]")].map((c) => getComputedStyle(c).visibility)
      const folds = [...aside.querySelectorAll("[data-rail-fold]")].map((f) => ({ h: f.getBoundingClientRect().height, v: getComputedStyle(f).visibility }))
      return { w: ab.width, inner, centreOfColumn: inner / 2, icons, toggle: tb.left + tb.width / 2 - ab.left, labels, chev, folds, label: t.getAttribute("aria-label"), expanded: t.getAttribute("aria-expanded") }
    })
    report.collapsed = c
    expect(c.w === 68, "collapsed: 68px", c.w)
    expect(c.icons.every((x) => Math.abs(x - c.centreOfColumn) <= 0.5) && Math.abs(c.toggle - c.centreOfColumn) <= 0.5, "every icon and the control centred on the column", { column: c.centreOfColumn, icons: [...new Set(c.icons)], toggle: c.toggle })
    expect(c.labels.every((o) => o === 0) && c.chev.every((v) => v === "hidden") && c.folds.every((f) => f.h === 0 && f.v === "hidden"), "labels gone, chevrons hidden, the Upgrade card folded shut")
    expect(c.label === "Expand sidebar" && c.expanded === "false", "and the control now says Expand sidebar, aria-expanded false", { label: c.label, expanded: c.expanded })
    const t2 = await p.$("[data-rail-toggle]")
    const tb2 = await t2.boundingBox()
    await p.mouse.move(tb2.x + tb2.width / 2, tb2.y + tb2.height / 2)
    await sleep(550)
    const tip2 = await p.evaluate(() => document.querySelector("[data-rail-tip]")?.textContent ?? null)
    expect(tip2 === "Expand sidebarCtrlB", "its tooltip says Expand sidebar, Ctrl B", tip2)
    await p.screenshot({ path: join(shots, "control-collapsed-tooltip.png"), clip: { x: 0, y: 0, width: 520, height: 900 } })
    await p.mouse.move(700, 600)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  // ── On a Mac ───────────────────────────────────────────────────────────────
  console.log("\nOn a Mac\n")
  {
    const { p } = await open("/app/integrations", { mac: true })
    const t = await p.$("[data-rail-toggle]")
    const tb = await t.boundingBox()
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
    await sleep(550)
    const keys = await p.evaluate(() => [...document.querySelectorAll("[data-rail-tip] kbd")].map((k) => k.textContent))
    const aria = await p.evaluate(() => document.querySelector("[data-rail-toggle]").getAttribute("aria-keyshortcuts"))
    expect(keys.join(" ") === "⌘ B" && aria === "Meta+B", "the tooltip says ⌘ B, and aria-keyshortcuts Meta+B", { keys, aria })
    await p.mouse.move(700, 600)
    const railOf = () => p.evaluate(() => document.querySelector("[data-app-rail]").getAttribute("data-app-rail"))
    await p.keyboard.down("Control"); await p.keyboard.press("b"); await p.keyboard.up("Control")
    await sleep(300)
    const ctrl = await railOf()
    await p.keyboard.down("Meta"); await p.keyboard.press("b"); await p.keyboard.up("Meta")
    await sleep(300)
    const meta = await railOf()
    expect(ctrl === "open" && meta === "collapsed", "⌘B toggles it; Ctrl+B does not", { ctrl, meta })
    await p.close()
  }

  // ── The motion ─────────────────────────────────────────────────────────────
  console.log("\nThe motion, frame by frame\n")
  {
    const { p } = await open("/app/integrations")
    await p.evaluate(() => {
      window.__film = (ms, act) =>
        new Promise((res) => {
          const aside = document.querySelector("[data-rail-aside]")
          const main = document.querySelector("main")
          const content = document.querySelector("[data-integrations-scroll] > div:nth-child(2)")
          const dash = aside.querySelector('[data-nav-row][href="/app"] [data-nav-icon]')
          const label = aside.querySelector('[data-nav-row][href="/app"] [data-nav-label]')
          const settings = aside.querySelector('[data-nav-row][href="/app/settings"]')
          const toggle = aside.querySelector("[data-rail-toggle]")
          const frames = []
          let t0 = 0
          const tick = (t) => {
            if (!t0) { t0 = t; act() }
            const tb = toggle.getBoundingClientRect()
            frames.push({ t: Math.round(t - t0), w: aside.getBoundingClientRect().width, pad: parseFloat(getComputedStyle(main).paddingLeft), cx: content.getBoundingClientRect().left, icon: dash.getBoundingClientRect().left, lab: +getComputedStyle(label).opacity, set: settings.getBoundingClientRect().top, tog: tb.left + tb.width / 2 })
            if (t - t0 < ms) requestAnimationFrame(tick)
            else res(frames)
          }
          requestAnimationFrame(tick)
        })
      /* Only the clock, no reads: how long the frames are while it moves. */
      window.__clock = (ms, act) =>
        new Promise((res) => {
          const times = []
          let t0 = 0
          const tick = (t) => {
            if (!t0) { t0 = t; act() }
            times.push(t)
            if (t - t0 < ms) requestAnimationFrame(tick)
            else res(times.slice(1).map((x, i) => x - times[i]))
          }
          requestAnimationFrame(tick)
        })
    })
    const one = (frames, key, dir) => {
      let back = 0
      for (let i = 1; i < frames.length; i++) {
        const d = frames[i][key] - frames[i - 1][key]
        if (dir < 0 ? d > 0.01 : d < -0.01) back = Math.max(back, Math.abs(d))
      }
      const total = Math.abs(frames.at(-1)[key] - frames[0][key])
      const steps = frames.slice(1).map((f, i) => Math.abs(f[key] - frames[i][key]))
      const moving = steps.filter((s) => s > 0.01).length
      return { from: frames[0][key], to: frames.at(-1)[key], back, biggestStep: Math.max(...steps), share: total ? Math.max(...steps) / total : 0, moving }
    }
    const judge = (name, frames, dir, endW) => {
      const w = one(frames, "w", dir)
      const pad = one(frames, "pad", dir)
      const cx = one(frames, "cx", dir)
      const icon = one(frames, "icon", -dir)
      const set = one(frames, "set", -dir)
      const tog = one(frames, "tog", dir)
      const lab = one(frames, "lab", dir)
      const lockstep = Math.max(...frames.map((f) => Math.abs(f.w - f.pad)))
      const end = frames.findIndex((f) => f.w === endW && f.pad === endW)
      report[name] = { frames: frames.length, settledAtMs: end >= 0 ? frames[end].t : null, w, pad, cx, icon, set, tog, lab, sidebarVsPageEdgeMaxPx: lockstep }
      expect(w.back === 0 && pad.back === 0 && cx.back === 0, `${name}: the sidebar, the page's edge and the content each move one way only`, { w: w.back, pad: pad.back, content: cx.back })
      expect(lockstep <= 0.5, `${name}:   the page's edge stays on the sidebar's every frame`, lockstep)
      expect(w.moving >= 8 && cx.moving >= 8 && w.share <= 0.3 && cx.share <= 0.3, `${name}:   over many frames, no frame more than 30% of the way`, { frames: w.moving, biggestShare: Math.max(w.share, cx.share).toFixed(2) })
      expect(end >= 0 && frames[end].t <= 400 && w.to === endW, `${name}:   lands at ${endW}px`, { at: end >= 0 ? frames[end].t : null, w: w.to })
      expect(icon.back === 0 && Math.abs(icon.to - icon.from) <= 2.6 && icon.biggestStep <= 1, `${name}:   the icons hold still but for the last 2.5px, on the same curve`, { moved: +(icon.to - icon.from).toFixed(2), biggestStep: +icon.biggestStep.toFixed(2) })
      expect(set.back === 0 && set.share <= 0.3, `${name}:   Settings, at the foot, never jumps as the card folds`, { moved: +(set.to - set.from).toFixed(1), biggestShare: +set.share.toFixed(2) })
      expect(tog.back === 0 && tog.share <= 0.3, `${name}:   the control rides the edge`, { from: tog.from, to: tog.to })
      expect(lab.back === 0, `${name}:   the labels only fade ${dir < 0 ? "out" : "in"}`, { from: lab.from, to: lab.to })
    }
    const collapse = await p.evaluate(() => window.__film(420, () => document.querySelector("[data-rail-toggle]").click()))
    judge("collapse", collapse, -1, 68)
    const expand = await p.evaluate(() => window.__film(420, () => document.querySelector("[data-rail-toggle]").click()))
    judge("expand", expand, 1, 240)

    /* What a toggle costs: frame lengths with nothing reading the layout, and the browser's own layout time. */
    const m0 = await p.metrics()
    const clockC = await p.evaluate(() => window.__clock(400, () => document.querySelector("[data-rail-toggle]").click()))
    const m1 = await p.metrics()
    const clockE = await p.evaluate(() => window.__clock(400, () => document.querySelector("[data-rail-toggle]").click()))
    const m2 = await p.metrics()
    /* The first frame is the press (the click, the commit, the new style); the ones after it are the motion. */
    const longest = Math.max(...clockC.slice(1), ...clockE.slice(1))
    report.cost = {
      collapseFramesMs: clockC.map((x) => Math.round(x)).join(" "),
      expandFramesMs: clockE.map((x) => Math.round(x)).join(" "),
      longestFrameMs: +longest.toFixed(1),
      medianFrameMs: +[...clockC, ...clockE].sort((a, b) => a - b)[Math.floor((clockC.length + clockE.length) / 2)].toFixed(1),
      layoutMsCollapse: +((m1.LayoutDuration - m0.LayoutDuration) * 1000).toFixed(1),
      layoutMsExpand: +((m2.LayoutDuration - m1.LayoutDuration) * 1000).toFixed(1),
      styleMsCollapse: +((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000).toFixed(1),
      layoutsCollapse: m1.LayoutCount - m0.LayoutCount,
    }
    expect(longest < 34, "no long frame while it moves (headless, software drawn: at most one missed vsync)", report.cost)

    /* Stopped partway, to look at: each running animation held at the same moment. */
    for (const [name, at] of [["collapse-40ms", 40], ["collapse-90ms", 90], ["collapsed", null], ["expand-60ms", 60], ["expand-120ms", 120], ["open", null]]) {
      if (at === null) {
        await p.evaluate(() => document.getAnimations().filter((a) => isFinite(a.effect?.getComputedTiming().endTime)).forEach((a) => a.finish()))
        await sleep(100)
        await p.screenshot({ path: join(shots, `${name}.png`) })
        continue
      }
      if (name.endsWith("40ms") || name.endsWith("60ms")) await p.evaluate(() => document.querySelector("[data-rail-toggle]").click())
      await p.evaluate((ms) => new Promise((r) => requestAnimationFrame(() => { document.getAnimations().filter((a) => isFinite(a.effect?.getComputedTiming().endTime)).forEach((a) => { a.pause(); a.currentTime = ms }); r() })), at)
      await sleep(60)
      if (process.env.DEBUG_FILM) console.log(name, await p.evaluate(() => ({ aside: document.querySelector("[data-rail-aside]").getBoundingClientRect().width, pad: getComputedStyle(document.querySelector("main")).paddingLeft, anims: document.getAnimations().map((a) => `${a.effect?.target?.tagName}.${a.transitionProperty ?? a.animationName}@${Math.round(a.currentTime)}:${a.playState}`).slice(0, 12) })))
      await p.screenshot({ path: join(shots, `${name}.png`), clip: { x: 0, y: 0, width: 760, height: 900 }, captureBeyondViewport: false })
    }
    await p.close()
  }
  {
    const { p } = await open("/app/integrations", { reducedMotion: true })
    const frames = await p.evaluate(
      () =>
        new Promise((res) => {
          const aside = document.querySelector("[data-rail-aside]")
          const main = document.querySelector("main")
          const out = []
          requestAnimationFrame(() => {
            document.querySelector("[data-rail-toggle]").click()
            requestAnimationFrame(() => {
              out.push({ w: aside.getBoundingClientRect().width, pad: parseFloat(getComputedStyle(main).paddingLeft), lab: +getComputedStyle(aside.querySelector("[data-nav-label]")).opacity })
              res(out)
            })
          })
        }),
    )
    expect(frames[0].w === 68 && frames[0].pad === 68 && frames[0].lab === 0, "reduced motion: there on the next frame, nothing animates", frames[0])
    await p.close()
  }

  // ── The pills ──────────────────────────────────────────────────────────────
  console.log("\nThe Integrations pills\n")
  {
    const { p, errors } = await open("/app/integrations")
    await sleep(600)
    const all = catalog.visibleIntegrations(true)
    const apps = catalog.storelibApps(true).filter((a) => !a.core)
    const own = (id) => catalog.hasBuiltInArt(id)
    const expected = {
      all: [...all.map((i) => i.id), ...apps.map((a) => a.id)],
      storelib: [...all.filter((i) => own(i.id)).map((i) => i.id), ...apps.map((a) => a.id)],
      installed: EXPECTED_INSTALLED,
    }
    for (const c of catalog.CATEGORY_ORDER) expected[c] = [...all.filter((i) => i.category === c).map((i) => i.id), ...apps.filter((a) => APP_IN[a.id] === c).map((a) => a.id)]
    const soon = new Set(all.filter((i) => i.comingSoon).map((i) => i.id))
    const pills = await p.evaluate(() => [...document.querySelectorAll("[data-integration-pill]")].map((b) => ({ id: b.getAttribute("data-integration-pill"), label: b.textContent, count: Number(b.lastElementChild.textContent) })))
    report.pills = {}
    const seenPills = pills.map((x) => x.id)
    /* Changed on purpose (round 30): the owner's order, All, Reviews, Analytics, Installed, Storelib apps, Advertising, Email marketing, Automation, then the rest (scripts/check-integrations-round30.mjs measures it in full). */
    const head = ["all", "reviews", "analytics", "installed", "storelib", "advertising", "email", "automation"]
    const shouldHave = [...head, ...catalog.CATEGORY_ORDER.filter((c) => !head.includes(c))].filter((x) => ["all", "installed", "storelib"].includes(x) || expected[x].length > 0)
    expect(seenPills.join() === shouldHave.join(), "a pill for All, Installed, Storelib apps and every category with something in it", seenPills)
    for (const pill of pills) {
      await p.evaluate((id) => document.querySelector(`[data-integration-pill="${id}"]`).click(), pill.id)
      await sleep(450)
      const shown = await p.evaluate(() => ({
        ids: [...document.querySelectorAll("[data-integration-grid] > li")].filter((li) => !li.hidden && li.offsetParent !== null).map((li) => li.querySelector("[data-integration-card]").getAttribute("data-integration-card")),
        stills: document.querySelectorAll("[data-integration-still]").length,
        badges: [...document.querySelectorAll("[data-integration-grid] > li")].filter((li) => !li.hidden).map((li) => li.textContent.includes("Coming soon")),
      }))
      const want = expected[pill.id] ?? []
      const dupes = shown.ids.filter((id, i) => shown.ids.indexOf(id) !== i)
      const missing = want.filter((id) => !shown.ids.includes(id))
      const extra = shown.ids.filter((id) => !want.includes(id))
      /* Working before Coming soon among the services (Storelib's own first, none of them coming soon). */
      const services = shown.ids.filter((id) => !own(id) && !apps.some((a) => a.id === id))
      const firstSoon = services.findIndex((id) => soon.has(id))
      const workingAfterSoon = firstSoon < 0 ? [] : services.slice(firstSoon).filter((id) => !soon.has(id))
      const ownFirst = shown.ids.findIndex((id) => !own(id) && !apps.some((a) => a.id === id))
      const ownAfter = ownFirst < 0 ? [] : shown.ids.slice(ownFirst).filter((id) => own(id) || apps.some((a) => a.id === id))
      report.pills[pill.id] = { count: pill.count, shown: shown.ids.length, order: shown.ids }
      expect(
        pill.count === shown.ids.length && dupes.length === 0 && missing.length === 0 && extra.length === 0 && shown.stills === 0,
        `${pill.label.replace(/\d+$/, "").padEnd(16)} ${String(pill.count).padStart(2)} on the pill, ${String(shown.ids.length).padStart(2)} cards, exactly its own`,
        missing.length || extra.length || dupes.length ? { missing, extra, dupes } : undefined,
      )
      /* Changed on purpose (round 30): All, Installed and Storelib apps are mixed across the categories, so Storelib's own come first only inside a category. */
      const mixed = pill.id === "all" || pill.id === "storelib" || pill.id === "installed"
      expect(workingAfterSoon.length === 0 && (mixed || ownAfter.length === 0), `${" ".repeat(19)}${mixed ? "" : "Storelib's own first, "}working services before Coming soon`, workingAfterSoon.length || ownAfter.length ? { workingAfterSoon, ownAfter } : undefined)
    }
    /* Changed on purpose (round 30, the owner: All must be mixed): no longer category by category. Its first four cards come from four lanes, and Storelib's own are not one block at the top. */
    await p.evaluate(() => document.querySelector('[data-integration-pill="all"]').click())
    await sleep(450)
    const allLanes = report.pills.all.order.filter((id) => !soon.has(id)).map((id) => all.find((i) => i.id === id)?.category ?? APP_IN[id] ?? "storelib")
    expect(new Set(allLanes.slice(0, 4)).size === 4 && !report.pills.all.order.slice(0, 7).every((id) => own(id) || apps.some((a) => a.id === id)), "All: mixed, its first four cards from four lanes, Storelib's own not a block at the top", allLanes.slice(0, 6).join())

    /* A switch, frame by frame: scrolled to the bottom of All, then Reviews (much shorter). */
    await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-scroll]")
      /* Scrolled down until the pills are near the top, where a thumb on them would be, with All's cards filling the screen under them. */
      const pills = document.querySelector("[data-integration-pills]")
      box.scrollTop += pills.getBoundingClientRect().top - box.getBoundingClientRect().top - 80
      window.__imgs = [...document.querySelectorAll("[data-integration-grid] img")]
      window.__loads = 0
      document.addEventListener("load", (e) => { if (e.target.tagName === "IMG" && e.target.closest("[data-integration-grid]")) window.__loads++ }, true)
    })
    await sleep(200)
    const film = await p.evaluate(
      (pillId) =>
        new Promise((res) => {
          const scroller = document.querySelector("[data-integrations-scroll]")
          const box = document.querySelector("[data-integration-grid-box]")
          const pills = document.querySelector("[data-integration-pills]")
          const frames = []
          let t0 = 0
          const tick = (t) => {
            if (!t0) { t0 = t; document.querySelector(`[data-integration-pill="${pillId}"]`).click() }
            const still = box.querySelector("[data-integration-still]")
            const live = box.querySelector("[data-integration-grid]")
            /* The layer the new cards are in: the list, or the empty card when nothing matches. */
            const layer = [live, box.querySelector("[data-integration-empty]")].find((el) => !el.hidden)
            frames.push({ t: Math.round(t - t0), h: box.getBoundingClientRect().height, still: still ? +getComputedStyle(still).opacity : null, live: +getComputedStyle(layer).opacity, top: scroller.scrollTop, pills: pills.getBoundingClientRect().top })
            if (t - t0 < 420) requestAnimationFrame(tick)
            else res(frames)
          }
          requestAnimationFrame(tick)
        }),
      "reviews",
    )
    if (process.env.DEBUG_FILM) console.log(film)
    const during = film.filter((f) => f.still !== null)
    const sums = during.map((f) => f.still + f.live)
    const hBack = film.slice(1).some((f, i) => f.h > film[i].h + 0.01)
    const hSteps = film.slice(1).map((f, i) => film[i].h - f.h)
    const hTotal = film[0].h - film.at(-1).h
    const pillSteps = film.slice(1).map((f, i) => Math.abs(f.pills - film[i].pills))
    const kept = await p.evaluate(() => window.__imgs.every((img) => img.isConnected) && document.querySelectorAll("[data-integration-grid] img").length === window.__imgs.length)
    const loads = await p.evaluate(() => window.__loads)
    report.crossfade = { frames: film.length, fadeFrames: during.length, first: film[0], last: film.at(-1), minSum: Math.min(...sums), maxSum: Math.max(...sums), heightFrom: film[0].h, heightTo: film.at(-1).h, biggestHeightShare: hTotal ? +(Math.max(...hSteps) / hTotal).toFixed(2) : 0, biggestPillsStep: Math.max(...pillSteps) }
    /* Frame 0 is the press itself, before React has drawn anything: the first frame drawn after it is the one the eye sees. */
    const firstDrawn = during[0]
    expect(during.length >= 8 && Math.abs(firstDrawn.still - 1) < 0.05 && firstDrawn.live < 0.05, "the first frame after the press still shows the old cards whole: no flash, no drop to half", firstDrawn)
    expect(sums.every((s) => Math.abs(s - 1) <= 0.02), "old out, new in, adding up to one every frame", { min: Math.min(...sums).toFixed(3), max: Math.max(...sums).toFixed(3) })
    expect(!hBack && hTotal > 100 && Math.max(...hSteps) / hTotal <= 0.3 && film.at(-1).still === null, "the height eases down, never all at once, and the still is gone after", { from: film[0].h, to: film.at(-1).h, biggestShare: report.crossfade.biggestHeightShare })
    expect(Math.max(...pillSteps) <= 0.5 && film.every((f) => f.top === film[0].top), "the pills and the page do not move at all under the thumb (the scroll never clamps)", { biggestPillsStep: Math.max(...pillSteps), scrollTops: [...new Set(film.map((f) => f.top))] })
    expect(kept && loads === 0, "no card mounted again, no logo loaded again", { kept, loads })
    /* The room left under the short category goes as the page is scrolled back up, with nothing seen to move. */
    const up = await p.evaluate(
      () =>
        new Promise((res) => {
          const scroller = document.querySelector("[data-integrations-scroll]")
          const pills = document.querySelector("[data-integration-pills]")
          const box = document.querySelector("[data-integration-grid-box]")
          const out = []
          const tick = () => {
            out.push({ top: scroller.scrollTop, sum: pills.getBoundingClientRect().top + scroller.scrollTop, h: box.getBoundingClientRect().height, min: box.style.minHeight })
            if (scroller.scrollTop > 0) {
              scroller.scrollTop -= 40
              requestAnimationFrame(() => requestAnimationFrame(tick))
            } else res(out)
          }
          tick()
        }),
    )
    const drift = Math.max(...up.map((f) => Math.abs(f.sum - up[0].sum)))
    report.scrollUp = { steps: up.length, drift, heightFrom: up[0].h, heightTo: up.at(-1).h, minHeightAtTop: up.at(-1).min }
    expect(drift <= 0.5 && up.at(-1).min === "" && up.at(-1).h < up[0].h, "scrolled back up, the room under the cards goes and nothing on screen shifts", report.scrollUp)
    /* And back to All: taller, the new cards fade in where they land. */
    const back = await p.evaluate(
      () =>
        new Promise((res) => {
          const box = document.querySelector("[data-integration-grid-box]")
          const frames = []
          let t0 = 0
          const tick = (t) => {
            if (!t0) { t0 = t; document.querySelector('[data-integration-pill="all"]').click() }
            const still = box.querySelector("[data-integration-still]")
            const live = box.querySelector("[data-integration-grid]")
            frames.push({ t: Math.round(t - t0), still: still ? +getComputedStyle(still).opacity : null, live: +getComputedStyle(live).opacity })
            if (t - t0 < 300) requestAnimationFrame(tick)
            else res(frames)
          }
          requestAnimationFrame(tick)
        }),
    )
    const backSums = back.filter((f) => f.still !== null).map((f) => f.still + f.live)
    expect(backSums.length >= 8 && backSums.every((s) => Math.abs(s - 1) <= 0.02) && back.at(-1).still === null, "back to All the same way", { frames: backSums.length })

    /* Stopped halfway through a crossfade, to look at. */
    await p.evaluate(() => { const s = document.querySelector("[data-integrations-scroll]"); s.scrollTop = 520 })
    await sleep(200)
    await p.evaluate(() => document.querySelector('[data-integration-pill="analytics"]').click())
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => { document.getAnimations().filter((a) => isFinite(a.effect?.getComputedTiming().endTime)).forEach((a) => { a.pause(); a.currentTime = 90 }); r() })))
    await sleep(60)
    await p.screenshot({ path: join(shots, "pills-crossfade-midway.png"), captureBeyondViewport: false })
    await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "paused").forEach((a) => a.play()))
    await sleep(600)
    await p.screenshot({ path: join(shots, "pills-analytics.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* A phone: one card of rows, a hairline between the rows shown, none above the first. */
  {
    const { p } = await open("/app/integrations", { vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } })
    await sleep(400)
    const check = async (pill) => {
      await p.evaluate((id) => document.querySelector(`[data-integration-pill="${id}"]`).click(), pill)
      await sleep(450)
      return p.evaluate(() => {
        const lis = [...document.querySelectorAll("[data-integration-grid] > li")].filter((li) => !li.hidden)
        return lis.map((li) => parseFloat(getComputedStyle(li).borderTopWidth))
      })
    }
    const a = await check("all")
    const r = await check("shipping")
    expect(a[0] === 0 && a.slice(1).every((w) => w === 1) && r[0] === 0 && r.slice(1).every((w) => w === 1), "phone: a hairline between the rows shown, none above the first, in every pill", { all: a.length, shipping: r })
    await p.screenshot({ path: join(shots, "phone-shipping.png") })
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n${JSON.stringify(report, (k, v) => (k === "order" ? undefined : v), 1).slice(0, 4000)}\n`)
console.log(broken ? `${broken} FAILED` : "all ok")
process.exit(broken ? 1 : 0)
