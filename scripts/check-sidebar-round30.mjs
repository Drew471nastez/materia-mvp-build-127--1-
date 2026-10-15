/**
 * ===========================================================================
 *  ROUND 30: THE /app SIDEBAR'S COLLAPSE HANDLE AND ITS MOTION, MEASURED
 * ===========================================================================
 * The owner, on round 29's control in a band of its own above Dashboard:
 * "I don't like that you put the collapsible sidebar icon above the
 * Dashboard and created that empty space above the Dashboard menu link.
 * Come up with another solution, more smooth, subtle, clean. Make sure the
 * collapsible animation is very smooth, clean and accurate."
 *
 * The real sidebar beside the real Integrations page (scripts/render-sidebar-
 * round29.tsx), in headless Chromium:
 *
 *   the band      gone: Dashboard is 12px from the sidebar's top, open and
 *                 collapsed, the same gutter as everywhere else in it
 *   the handle    a 24px circle on the border, level with Dashboard; out of
 *                 sight and letting clicks through until the pointer is on
 *                 the sidebar or the keyboard focuses it; named, with
 *                 aria-expanded, and the ⌘B or Ctrl+B tooltip and shortcut
 *   the motion    filmed every frame both ways: the sidebar's width, the
 *                 page's edge and the content each move one way only, in
 *                 lockstep, over many frames; every icon in the sidebar stays
 *                 on the same pixel the whole time; the handle stays on the
 *                 border; Settings never jumps; the labels only fade
 *   the phone     no sidebar, no handle, no padding, whatever the cookie says
 *   reduced       motion off: there on the next frame
 *
 *   PROBE_CSS=source node scripts/check-sidebar-round30.mjs
 *
 * Pictures go to SHOTS_DIR (a temporary directory by default) to look at.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".sidebar-round30-probe")
const shots = process.env.SHOTS_DIR || join(tmpdir(), "round30-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
const OPEN = 240
const COLLAPSED = 63
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const API = {
  "/api/store/integrations/installed": { installed: [] },
  "/api/store/integrations": { tracking: {}, ready: true },
  "/api/physical/integrations": { integrations: [] },
  "/api/store/integrations/marketing": { marketing: [] },
  "/api/store/integrations/apps": { states: {}, hrefs: {} },
  "/api/store/integrations/catalog": { overrides: [] },
  "/api/store/reviews-app": { settings: { enabled: false } },
  "/api/store/tracking-app": { tracking: {} },
}

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
  await build({
    bundle: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.sidebar-round30-probe/navigation.js", "next/link": "./.sidebar-round30-probe/link.jsx", "next/image": "./.sidebar-round30-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    loader: { ".css": "empty" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    entryPoints: [join(root, "scripts/render-sidebar-round29.tsx")],
    format: "iife",
    outfile: join(stubs, "page.js"),
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  })

  const css = await appCss(root)
  const fonts = interFaces(root)
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  console.log("\nThe harness is the layout\n")
  {
    const layout = readFileSync(join(root, "app/app/layout.tsx"), "utf8")
    const harness = readFileSync(join(root, "scripts/render-sidebar-round29.tsx"), "utf8")
    const cls = (src, re) => re.exec(src)?.[1]
    expect(cls(layout, /<main className="([^"]+)"/) === cls(harness, /MAIN_CLASS =\s*"([^"]+)"/), "the page's <main> has app/app/layout.tsx's classes")
    expect(cls(layout, /<div className="([^"]+)" data-app-rail=\{rail\}/) === cls(harness, /ROOT_CLASS = "([^"]+)"/), "and so has the shell's root")
  }

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, { vp = DESK, mac = false, reducedMotion = false } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    const platform = mac ? ["MacIntel", "macOS"] : ["Linux x86_64", "Linux"]
    await p.evaluateOnNewDocument((pf, uad) => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => pf })
      Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => ({ platform: uad }) })
    }, ...platform)
    if (reducedMotion) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "").split("?")[0]
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(API[short] ?? {}) })
      }
      if (url.startsWith(`${ORIGIN}/integrations/`)) {
        try {
          const file = join(root, "public", decodeURIComponent(new URL(url).pathname))
          const type = { svg: "image/svg+xml", png: "image/png", webp: "image/webp" }[file.split(".").pop()] ?? "application/octet-stream"
          return void r.respond({ status: 200, contentType: type, body: readFileSync(file) })
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
    if (!(await p.$("[data-rail-aside]"))) throw new Error(`the shell did not draw: ${errors.join(" | ")}`)
    return { p, errors }
  }

  /* Where everything is, relative to the sidebar. */
  const geometry = (p) =>
    p.evaluate(() => {
      const aside = document.querySelector("[data-rail-aside]")
      const ab = aside.getBoundingClientRect()
      const t = aside.querySelector("[data-rail-toggle]")
      const tb = t.getBoundingClientRect()
      const dash = aside.querySelector('[data-nav-row][href="/app"]').getBoundingClientRect()
      const nav = aside.querySelector("nav").getBoundingClientRect()
      const icons = [...aside.querySelectorAll("[data-nav-row] [data-nav-icon]")].map((i) => { const b = i.getBoundingClientRect(); return +(b.left + b.width / 2 - ab.left).toFixed(2) })
      const cs = getComputedStyle(t)
      return {
        w: ab.width,
        inner: aside.clientWidth,
        dashTop: dash.top - ab.top,
        navTop: nav.top - ab.top,
        dashMid: dash.top + dash.height / 2,
        icons,
        toggle: { w: tb.width, h: tb.height, cx: tb.left + tb.width / 2, cy: tb.top + tb.height / 2, offBorder: tb.left + tb.width / 2 - (ab.right - 0.5), opacity: +cs.opacity, events: cs.pointerEvents, radius: cs.borderRadius, text: t.textContent.trim(), svg: !!t.querySelector("svg"), turn: getComputedStyle(t.querySelector("svg")).transform },
        label: t.getAttribute("aria-label"),
        expanded: t.getAttribute("aria-expanded"),
        controls: !!document.getElementById(t.getAttribute("aria-controls")),
        keys: t.getAttribute("aria-keyshortcuts"),
        title: t.getAttribute("title"),
        timing: [aside, document.querySelector("main")].map((el) => { const s = getComputedStyle(el); return `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}` }),
      }
    })

  // ── No band, and the handle ────────────────────────────────────────────────
  console.log("\nNo band above Dashboard; the handle on the edge\n")
  {
    const { p, errors } = await open("/app/integrations")
    await p.mouse.move(900, 500)
    await sleep(250)
    const g = await geometry(p)
    report.open = g
    expect(g.dashTop === 12 && g.navTop === 0, "Dashboard is the first thing in the sidebar, 12px from its top: no band above it", { dashboardTop: g.dashTop, navTop: g.navTop })
    expect(g.toggle.w === 24 && g.toggle.h === 24 && parseFloat(g.toggle.radius) >= 12 && g.toggle.svg && g.toggle.text === "", "the handle: a 24px circle with a chevron, no words", { w: g.toggle.w, h: g.toggle.h, radius: g.toggle.radius })
    expect(Math.abs(g.toggle.offBorder) <= 0.5 && Math.abs(g.toggle.cy - g.dashMid) <= 0.5, "centred on the border, level with Dashboard", { offBorder: g.toggle.offBorder, dy: g.toggle.cy - g.dashMid })
    expect(g.toggle.opacity === 0 && g.toggle.events === "none", "at rest, with the pointer on the page: out of sight", { opacity: g.toggle.opacity, events: g.toggle.events })
    const through = await p.evaluate((x, y) => !document.elementFromPoint(x, y)?.closest("[data-rail-toggle]"), g.toggle.cx + 8, g.toggle.cy)
    expect(through, "and its half over the page takes no clicks from the page")
    expect(g.timing[0] === "width 0.24s cubic-bezier(0.2, 0, 0, 1)" && g.timing[1] === "padding-left 0.24s cubic-bezier(0.2, 0, 0, 1)", "the sidebar's width and the page's edge on one duration and one curve", g.timing)
    expect(g.label === "Collapse sidebar" && g.expanded === "true" && g.controls && g.keys === "Control+B" && !g.title, "named Collapse sidebar, aria-expanded, controls the sidebar, Control+B", { label: g.label, expanded: g.expanded, keys: g.keys })
    await p.screenshot({ path: join(shots, "open-rest.png"), clip: { x: 0, y: 0, width: 520, height: 420 }, captureBeyondViewport: false })

    /* The pointer on a row of the sidebar brings it out. */
    const row = await (await p.$('[data-nav-row][href="/app/orders"]')).boundingBox()
    await p.mouse.move(row.x + 40, row.y + row.height / 2)
    await sleep(250)
    const shown = await geometry(p)
    expect(shown.toggle.opacity === 1 && shown.toggle.events === "auto", "the pointer anywhere on the sidebar brings it out", { opacity: shown.toggle.opacity })
    await p.screenshot({ path: join(shots, "open-hover.png"), clip: { x: 0, y: 0, width: 520, height: 420 }, captureBeyondViewport: false })

    /* On the handle itself: the tooltip, after a short wait. */
    await p.mouse.move(g.toggle.cx - 4, g.toggle.cy)
    await sleep(150)
    const early = await p.evaluate(() => !!document.querySelector("[data-rail-tip]"))
    await sleep(450)
    const tip = await p.evaluate(() => {
      const el = document.querySelector("[data-rail-tip]")
      if (!el) return null
      const b = el.getBoundingClientRect()
      const t = document.querySelector("[data-rail-toggle]").getBoundingClientRect()
      return { text: el.textContent, gap: b.left - t.right, midDy: b.top + b.height / 2 - (t.top + t.height / 2), role: el.getAttribute("role") }
    })
    expect(!early && !!tip && tip.text === "Collapse sidebarCtrlB" && tip.role === "tooltip" && tip.gap >= 6 && tip.gap <= 10 && Math.abs(tip.midDy) <= 1, "on the handle, after a short wait: Collapse sidebar, Ctrl B, beside it", tip)
    await p.screenshot({ path: join(shots, "open-tooltip.png"), clip: { x: 0, y: 0, width: 520, height: 420 }, captureBeyondViewport: false })
    await p.mouse.move(900, 500)
    await sleep(250)

    /* The keyboard reaches it, and sees it. */
    await p.keyboard.press("Shift")
    await p.evaluate(() => document.querySelector("[data-rail-toggle]").focus())
    await sleep(250)
    const focused = await p.evaluate(() => { const t = document.querySelector("[data-rail-toggle]"); return { visible: t.matches(":focus-visible"), opacity: +getComputedStyle(t).opacity, ring: getComputedStyle(t).boxShadow !== "none" } })
    expect(focused.visible && focused.opacity === 1 && focused.ring, "focused from the keyboard: shown, with a ring", focused)
    await p.keyboard.press("Enter")
    await sleep(400)
    const afterEnter = await p.evaluate(() => document.querySelector("[data-app-rail]").getAttribute("data-app-rail"))
    expect(afterEnter === "collapsed", "and Enter on it collapses the sidebar", afterEnter)
    await p.evaluate(() => document.activeElement.blur())

    /* Collapsed. */
    await p.mouse.move(900, 500)
    await sleep(250)
    const c = await geometry(p)
    report.collapsed = c
    expect(c.w === COLLAPSED && c.dashTop === 12, `collapsed: ${COLLAPSED}px, Dashboard still 12px from the top`, { w: c.w, dashTop: c.dashTop })
    expect(c.icons.every((x) => Math.abs(x - c.inner / 2) <= 0.01), "every icon exactly on the column's centre", { column: c.inner / 2, icons: [...new Set(c.icons)] })
    expect(Math.abs(c.toggle.offBorder) <= 0.5 && c.toggle.turn !== "none" && c.label === "Expand sidebar" && c.expanded === "false", "the handle on the border, its chevron turned over, Expand sidebar, aria-expanded false", { offBorder: c.toggle.offBorder, turn: c.toggle.turn, label: c.label })
    const icon = await (await p.$('[data-nav-row][href="/app/orders"]')).boundingBox()
    await p.mouse.move(icon.x + icon.width / 2, icon.y + icon.height / 2)
    await sleep(250)
    await p.screenshot({ path: join(shots, "collapsed-hover.png"), clip: { x: 0, y: 0, width: 420, height: 900 }, captureBeyondViewport: false })
    await p.mouse.move(c.toggle.cx - 4, c.toggle.cy)
    await sleep(600)
    const tip2 = await p.evaluate(() => document.querySelector("[data-rail-tip]")?.textContent ?? null)
    expect(tip2 === "Expand sidebarCtrlB", "its tooltip says Expand sidebar, Ctrl B", tip2)
    await p.mouse.move(900, 500)

    /* The shortcut, and not while typing. */
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
    const typing = await railOf()
    await p.evaluate(() => document.activeElement.blur())
    expect(afterCtrl === "open" && /sl_rail=open/.test(cookie), "Ctrl+B opens it again, and the choice is kept", { afterCtrl, cookie })
    expect(afterMeta === "open" && typing === "open", "⌘B does nothing off a Mac, and Ctrl+B in the search box is the box's", { afterMeta, typing })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  console.log("\nOn a Mac\n")
  {
    const { p } = await open("/app/integrations", { mac: true })
    const aria = await p.evaluate(() => document.querySelector("[data-rail-toggle]").getAttribute("aria-keyshortcuts"))
    const railOf = () => p.evaluate(() => document.querySelector("[data-app-rail]").getAttribute("data-app-rail"))
    await p.keyboard.down("Control"); await p.keyboard.press("b"); await p.keyboard.up("Control")
    await sleep(300)
    const ctrl = await railOf()
    await p.keyboard.down("Meta"); await p.keyboard.press("b"); await p.keyboard.up("Meta")
    await sleep(300)
    const meta = await railOf()
    expect(aria === "Meta+B" && ctrl === "open" && meta === "collapsed", "Meta+B, ⌘B toggles it, Ctrl+B does not", { aria, ctrl, meta })
    await p.close()
  }

  // ── The motion ─────────────────────────────────────────────────────────────
  console.log("\nThe motion, frame by frame\n")
  {
    const { p } = await open("/app/integrations")
    /* The pointer on the sidebar, as it is when someone clicks the handle. */
    await p.mouse.move(120, 400)
    await sleep(250)
    await p.evaluate(() => {
      window.__film = (ms, act) =>
        new Promise((res) => {
          const aside = document.querySelector("[data-rail-aside]")
          const main = document.querySelector("main")
          const content = document.querySelector("[data-integrations-scroll] > div:nth-child(2)") || document.querySelector("[data-integrations-scroll] > *")
          const icons = [...aside.querySelectorAll("[data-nav-row] [data-nav-icon]")]
          const label = aside.querySelector('[data-nav-row][href="/app"] [data-nav-label]')
          const dash = aside.querySelector('[data-nav-row][href="/app"]')
          const settings = aside.querySelector('[data-nav-row][href="/app/settings"]')
          const toggle = aside.querySelector("[data-rail-toggle]")
          const frames = []
          let t0 = 0
          const tick = (t) => {
            if (!t0) { t0 = t; act() }
            const ab = aside.getBoundingClientRect()
            const tb = toggle.getBoundingClientRect()
            frames.push({
              t: Math.round(t - t0),
              w: ab.width,
              pad: parseFloat(getComputedStyle(main).paddingLeft),
              cx: content.getBoundingClientRect().left,
              icons: icons.map((i) => i.getBoundingClientRect().left),
              dashTop: dash.getBoundingClientRect().top - ab.top,
              lab: +getComputedStyle(label).opacity,
              set: settings.getBoundingClientRect().top,
              onBorder: tb.left + tb.width / 2 - (ab.right - 0.5),
            })
            if (t - t0 < ms) requestAnimationFrame(tick)
            else res(frames)
          }
          requestAnimationFrame(tick)
        })
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
      return { from: frames[0][key], to: frames.at(-1)[key], back, share: total ? Math.max(...steps) / total : 0, moving: steps.filter((s) => s > 0.01).length }
    }
    const judge = (name, frames, dir, endW) => {
      const w = one(frames, "w", dir)
      const pad = one(frames, "pad", dir)
      const cx = one(frames, "cx", dir)
      const set = one(frames, "set", -dir)
      const lab = one(frames, "lab", dir)
      const lockstep = Math.max(...frames.map((f) => Math.abs(f.w - f.pad)))
      const iconDrift = Math.max(...frames.flatMap((f) => f.icons.map((x, i) => Math.abs(x - frames[0].icons[i]))))
      const borderDrift = Math.max(...frames.map((f) => Math.abs(f.onBorder)))
      const band = Math.max(...frames.map((f) => Math.abs(f.dashTop - 12)))
      const end = frames.findIndex((f) => f.w === endW && f.pad === endW)
      const widths = frames.map((f) => +f.w.toFixed(1))
      report[name] = { frames: frames.length, settledAtMs: end >= 0 ? frames[end].t : null, widths: widths.slice(0, end + 2).join(" "), sidebarVsPageEdgeMaxPx: +lockstep.toFixed(3), iconDriftPx: iconDrift, handleOffBorderMaxPx: +borderDrift.toFixed(3), biggestWidthShare: +w.share.toFixed(2) }
      expect(w.back === 0 && pad.back === 0 && cx.back === 0, `${name}: the width, the page's edge and the content each move one way only (monotonic)`, { w: w.back, pad: pad.back, content: cx.back })
      expect(lockstep <= 0.5, `${name}:   the page's edge on the sidebar's every frame`, +lockstep.toFixed(3))
      expect(w.moving >= 8 && cx.moving >= 8 && w.share <= 0.3 && cx.share <= 0.3, `${name}:   over many frames, no frame more than 30% of the way`, { frames: w.moving, biggestShare: +Math.max(w.share, cx.share).toFixed(2) })
      expect(end >= 0 && frames[end].t <= 400 && w.to === endW, `${name}:   lands at ${endW}px`, { at: end >= 0 ? frames[end].t : null, w: w.to })
      expect(iconDrift <= 0.01, `${name}:   all ${frames[0].icons.length} icons on the same pixel every frame`, { maxDriftPx: iconDrift })
      expect(borderDrift <= 0.5, `${name}:   the handle on the border every frame`, +borderDrift.toFixed(3))
      expect(band <= 0.01, `${name}:   Dashboard 12px from the top every frame`, band)
      expect(set.back === 0 && set.share <= 0.3, `${name}:   Settings, at the foot, never jumps as the card folds`, { moved: +(set.to - set.from).toFixed(1), biggestShare: +set.share.toFixed(2) })
      expect(lab.back === 0, `${name}:   the labels only fade ${dir < 0 ? "out" : "in"}`, { from: lab.from, to: lab.to })
    }
    const collapse = await p.evaluate(() => window.__film(440, () => document.querySelector("[data-rail-toggle]").click()))
    judge("collapse", collapse, -1, COLLAPSED)
    const expand = await p.evaluate(() => window.__film(440, () => document.querySelector("[data-rail-toggle]").click()))
    judge("expand", expand, 1, OPEN)

    const m0 = await p.metrics()
    const clockC = await p.evaluate(() => window.__clock(420, () => document.querySelector("[data-rail-toggle]").click()))
    const m1 = await p.metrics()
    const clockE = await p.evaluate(() => window.__clock(420, () => document.querySelector("[data-rail-toggle]").click()))
    const longest = Math.max(...clockC.slice(1), ...clockE.slice(1))
    report.cost = { collapseFramesMs: clockC.map((x) => Math.round(x)).join(" "), longestFrameMs: +longest.toFixed(1), layoutMsCollapse: +((m1.LayoutDuration - m0.LayoutDuration) * 1000).toFixed(1), layoutsCollapse: m1.LayoutCount - m0.LayoutCount }
    expect(longest < 34, "no long frame while it moves (headless, software drawn: at most one missed vsync)", report.cost)

    /* Stopped partway, to look at, each from its own press (a picture lets a paused transition go). Also checks the stopped frame is still in lockstep. */
    await p.mouse.move(1300, 880)
    await sleep(200)
    const finish = () => p.evaluate(() => document.getAnimations().filter((a) => isFinite(a.effect?.getComputedTiming().endTime)).forEach((a) => a.finish()))
    const railNow = () => p.evaluate(() => document.querySelector("[data-app-rail]").getAttribute("data-app-rail"))
    const stills = {}
    for (const [name, from, at] of [["collapse-60ms", "open", 60], ["collapse-120ms", "open", 120], ["collapsed", "open", null], ["expand-60ms", "collapsed", 60], ["expand-120ms", "collapsed", 120], ["open", "collapsed", null]]) {
      if ((await railNow()) !== from) {
        await p.evaluate(() => document.querySelector("[data-rail-toggle]").click())
        await sleep(30)
        await finish()
        await sleep(60)
      }
      await p.evaluate(() => document.querySelector("[data-rail-toggle]").click())
      if (at === null) {
        await finish()
      } else {
        await p.evaluate((ms) => new Promise((r) => requestAnimationFrame(() => { document.getAnimations().filter((a) => isFinite(a.effect?.getComputedTiming().endTime)).forEach((a) => { a.pause(); a.currentTime = ms }); r() })), at)
      }
      await sleep(60)
      stills[name] = await p.evaluate(() => ({ aside: +document.querySelector("[data-rail-aside]").getBoundingClientRect().width.toFixed(1), pad: +parseFloat(getComputedStyle(document.querySelector("main")).paddingLeft).toFixed(1) }))
      await p.screenshot({ path: join(shots, `${name}.png`), clip: { x: 0, y: 0, width: 760, height: 900 }, captureBeyondViewport: false })
      await finish()
      await sleep(60)
    }
    report.stills = stills
    expect(Object.values(stills).every((s) => Math.abs(s.aside - s.pad) <= 0.5), "stopped partway, the page's edge is still on the sidebar's", stills)
    await p.close()
  }

  console.log("\nReduced motion\n")
  {
    const { p } = await open("/app/integrations", { reducedMotion: true })
    const f = await p.evaluate(
      () =>
        new Promise((res) => {
          const aside = document.querySelector("[data-rail-aside]")
          const main = document.querySelector("main")
          requestAnimationFrame(() => {
            document.querySelector("[data-rail-toggle]").click()
            requestAnimationFrame(() => res({ w: aside.getBoundingClientRect().width, pad: parseFloat(getComputedStyle(main).paddingLeft), lab: +getComputedStyle(aside.querySelector("[data-nav-label]")).opacity, turn: getComputedStyle(aside.querySelector("[data-rail-toggle] svg")).transform }))
          })
        }),
    )
    expect(f.w === COLLAPSED && f.pad === COLLAPSED && f.lab === 0 && f.turn !== "none", "there on the next frame, nothing animates", f)
    await p.close()
  }

  console.log("\nA phone\n")
  {
    for (const rail of ["open", "collapsed"]) {
      const { p, errors } = await open(`/app/integrations?rail=${rail}`, { vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } })
      const m = await p.evaluate(() => ({
        aside: getComputedStyle(document.querySelector("[data-rail-aside]")).display,
        toggleShown: document.querySelector("[data-rail-toggle]").getClientRects().length > 0,
        pad: parseFloat(getComputedStyle(document.querySelector("main")).paddingLeft),
        scrollW: document.documentElement.scrollWidth,
      }))
      expect(m.aside === "none" && !m.toggleShown && m.pad === 0 && m.scrollW <= 390 && errors.length === 0, `cookie ${rail}: no sidebar, no handle, no padding, no sideways scroll`, m)
      if (rail === "collapsed") await p.screenshot({ path: join(shots, "phone.png") })
      await p.close()
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n${JSON.stringify(report, null, 1).slice(0, 5000)}\n`)
console.log(`Pictures: ${shots}`)
console.log(broken ? `${broken} FAILED` : "all ok")
process.exit(broken ? 1 : 0)
