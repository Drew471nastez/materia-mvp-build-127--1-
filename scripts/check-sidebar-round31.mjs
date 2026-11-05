/**
 * ===========================================================================
 *  ROUND 31: THE /app SIDEBAR'S COLLAPSE TOGGLE AS A ROW, AND ITS MOTION
 * ===========================================================================
 * The owner, on round 30's handle on the border that came out on hover:
 * "I don't like the collapsible one that appears on hover. Put the collapse
 * toggle above the 'Upgrade to Pro' card in the sidebar, as a line/row. It
 * must not be a hover thing: just an icon like Shopify has, always visible,
 * I click it to collapse and click again to expand."
 *
 * The real sidebar beside the real Integrations page (scripts/render-sidebar-
 * round29.tsx), in headless Chromium:
 *
 *   no hover      nothing in the sidebar is shown or hidden by the pointer
 *                 being on it: no :hover rule on the sidebar in the CSS, and
 *                 every control reads the same with the pointer on the page
 *                 and on the sidebar
 *   the toggle    a row like Settings (38px, 12px corners, no pill), seen and
 *                 clickable at rest, directly above the Upgrade card, its icon
 *                 in the same column as every other icon, "Collapse" beside
 *                 it; named, with aria-expanded, aria-controls, the ⌘B or
 *                 Ctrl+B tooltip and shortcut
 *   collapsed     the card folded, the toggle still there, over Settings
 *   the motion    filmed every frame both ways: the sidebar's width, the
 *                 page's edge and the content each move one way only, in
 *                 lockstep, over many frames; every icon in the sidebar, the
 *                 toggle's too, stays on the same pixel the whole time; the
 *                 toggle stays in sight and only moves down (collapsing) or
 *                 up (opening) as the card folds; Settings never jumps
 *   the phone     no sidebar, no toggle, no padding, whatever the cookie says
 *   reduced       motion off: there on the next frame
 *
 * ROUND 32. The owner, on the row: it must not look like a button row. Just
 * the icon, like Shopify's: no word, no background, no border, a tooltip,
 * and under the pointer only the icon's colour changes. And collapsed, the
 * page could be scrolled sideways: each label stuck out of its 63px row and
 * the nav, a vertical scroller and so a horizontal one too, scrolled them
 * into view. So, added:
 *
 *   the toggle    a bare icon: no text, no background or border at rest or
 *                 under the pointer, the icon darker under the pointer
 *   no sideways   at 1280 and 1440, open and collapsed and on every frame
 *                 between: the document, the nav, the sidebar's layer and
 *                 the page's scroller are no wider than their boxes, and a
 *                 sideways wheel over the collapsed sidebar moves nothing
 *
 *   PROBE_CSS=source node scripts/check-sidebar-round31.mjs
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
const stubs = join(root, ".sidebar-round31-probe")
const shots = process.env.SHOTS_DIR || join(tmpdir(), "round31-shots")
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
    alias: { "@": ".", "next/navigation": "./.sidebar-round31-probe/navigation.js", "next/link": "./.sidebar-round31-probe/link.jsx", "next/image": "./.sidebar-round31-probe/image.jsx" },
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
    const layout = readFileSync(join(root, "app/(storelib)/app/layout.tsx"), "utf8")
    const harness = readFileSync(join(root, "scripts/render-sidebar-round29.tsx"), "utf8")
    const cls = (src, re) => re.exec(src)?.[1]
    expect(cls(layout, /<main className="([^"]+)"/) === cls(harness, /MAIN_CLASS =\s*"([^"]+)"/), "the page's <main> has app/(storelib)/app/layout.tsx's classes")
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
      const card = aside.querySelector("[data-upgrade-card]")
      const cb = card.getBoundingClientRect()
      const settings = aside.querySelector('[data-nav-row][href="/app/settings"]')
      const sb = settings.getBoundingClientRect()
      const dash = aside.querySelector('[data-nav-row][href="/app"]').getBoundingClientRect()
      const nav = aside.querySelector("nav").getBoundingClientRect()
      const centre = (el) => { const b = el.getBoundingClientRect(); return +(b.left + b.width / 2 - ab.left).toFixed(2) }
      const icons = [...aside.querySelectorAll("[data-nav-icon]")].map(centre)
      const cs = getComputedStyle(t)
      const ss = getComputedStyle(settings)
      const word = t.querySelector("[data-nav-label]")
      /* On the icon's own centre, where a person aims. */
      const ib = t.querySelector("[data-nav-icon]").getBoundingClientRect()
      const hit = document.elementFromPoint(ib.left + ib.width / 2, ib.top + ib.height / 2)
      return {
        w: ab.width,
        inner: aside.clientWidth,
        dashTop: dash.top - ab.top,
        navTop: nav.top - ab.top,
        icons,
        toggle: {
          w: tb.width, h: tb.height, top: tb.top, bottom: tb.bottom, left: tb.left - ab.left, right: tb.right,
          iconX: centre(t.querySelector("[data-nav-icon]")),
          cy: tb.top + tb.height / 2,
          cx: ib.left + ib.width / 2,
          opacity: +cs.opacity, visibility: cs.visibility, events: cs.pointerEvents, radius: parseFloat(cs.borderRadius), bg: cs.backgroundColor, color: cs.color, font: cs.fontSize,
          word: word?.textContent ?? null, wordOpacity: word ? +getComputedStyle(word).opacity : null,
          text: t.textContent.trim(),
          border: cs.borderTopWidth + " " + cs.borderRightWidth + " " + cs.borderBottomWidth + " " + cs.borderLeftWidth,
          iconColor: getComputedStyle(t.querySelector("svg")).color,
          hitAtRest: !!hit?.closest("[data-rail-toggle]"),
          inside: tb.left >= ab.left && tb.right <= ab.right && tb.top >= ab.top && tb.bottom <= ab.bottom,
        },
        settings: { top: sb.top, h: sb.height, radius: parseFloat(ss.borderRadius), color: ss.color, font: ss.fontSize, iconX: centre(settings.querySelector("[data-nav-icon]")) },
        card: { top: cb.top, h: cb.height, shown: getComputedStyle(card.closest("[data-rail-fold]")).visibility !== "hidden" && cb.height > 0 },
        asideBottom: ab.bottom,
        label: t.getAttribute("aria-label"),
        expanded: t.getAttribute("aria-expanded"),
        controls: !!document.getElementById(t.getAttribute("aria-controls")),
        keys: t.getAttribute("aria-keyshortcuts"),
        title: t.getAttribute("title"),
        timing: [aside, document.querySelector("main")].map((el) => { const s = getComputedStyle(el); return `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}` }),
      }
    })

  /* Every control in the sidebar and how it reads: the same with the pointer away and on it, or something is a hover thing. */
  const controls = (p) =>
    p.evaluate(() =>
      [...document.querySelectorAll("[data-rail-aside] a, [data-rail-aside] button")].map((el) => {
        const cs = getComputedStyle(el)
        const b = el.getBoundingClientRect()
        return `${el.getAttribute("href") ?? el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 20)}:${cs.opacity}:${cs.visibility}:${cs.pointerEvents}:${Math.round(b.width)}x${Math.round(b.height)}`
      }),
    )

  // ── At rest: the toggle is a row above the card, and nothing is a hover thing ─
  console.log("\nAt rest: a row above the Upgrade card, no hover thing\n")
  {
    const { p, errors } = await open("/app/integrations")
    await p.mouse.move(900, 500)
    await sleep(300)
    const g = await geometry(p)
    report.open = g
    const awayControls = await controls(p)
    const hoverRules = await p.evaluate(() => {
      const found = []
      const walk = (rules) => {
        for (const r of rules) {
          if (r.cssRules) walk(r.cssRules)
          if (r.selectorText && /\[data-rail-aside\][^,]*:hover|\[data-rail-toggle\][^,]*/.test(r.selectorText) && /:hover/.test(r.selectorText)) found.push(r.selectorText)
        }
      }
      for (const sheet of document.styleSheets) { try { walk(sheet.cssRules) } catch {} }
      return found
    })
    expect(hoverRules.length === 0, "no :hover rule on the sidebar or the toggle in the CSS", hoverRules)
    expect(g.dashTop === 12 && g.navTop === 0, "Dashboard is still the first thing in the sidebar, 12px from its top", { dashboardTop: g.dashTop, navTop: g.navTop })
    expect(g.toggle.opacity === 1 && g.toggle.visibility === "visible" && g.toggle.events === "auto" && g.toggle.hitAtRest && g.toggle.inside, "the toggle, with the pointer on the page: in sight, inside the sidebar, and a click on its icon lands on it", { opacity: g.toggle.opacity, visibility: g.toggle.visibility, hit: g.toggle.hitAtRest })
    const above = g.card.top - g.toggle.bottom
    expect(above >= 0 && above <= 12 && g.card.shown, "directly above the Upgrade card", { gapPx: +above.toFixed(1) })
    /* Changed on purpose (round 32): it was "a row like Settings", the same 38px height, font and hover fill. The owner: not a button row, just the icon. */
    expect(g.toggle.text === "" && g.toggle.word === null && g.toggle.bg === "rgba(0, 0, 0, 0)" && g.toggle.border === "0px 0px 0px 0px" && g.toggle.w === 32 && g.toggle.h === 32 && g.toggle.color === g.settings.color,
      "a bare icon: no text, no background, no border, a 32px square to hit, the rows' grey", { text: g.toggle.text, bg: g.toggle.bg, border: g.toggle.border, size: `${g.toggle.w}x${g.toggle.h}`, color: g.toggle.color })
    expect(g.toggle.iconX === g.settings.iconX && g.icons.every((x) => x === g.icons[0]), "its icon in the same column as every other icon", { toggle: g.toggle.iconX, settings: g.settings.iconX, icons: [...new Set(g.icons)] })
    /* Changed on purpose (round 32): "Collapse" was beside it. No word now. */
    expect(g.toggle.word === null && g.toggle.text === "", "no word beside it", g.toggle.text)
    expect(g.timing[0] === "width 0.24s cubic-bezier(0.2, 0, 0, 1)" && g.timing[1] === "padding-left 0.24s cubic-bezier(0.2, 0, 0, 1)", "the sidebar's width and the page's edge on one duration (240ms) and one curve", g.timing)
    expect(g.label === "Collapse sidebar" && g.expanded === "true" && g.controls && g.keys === "Control+B" && !g.title, "named Collapse sidebar, aria-expanded, controls the sidebar, Control+B", { label: g.label, expanded: g.expanded, keys: g.keys })
    await p.screenshot({ path: join(shots, "open-rest.png"), clip: { x: 0, y: 0, width: 520, height: 900 }, captureBeyondViewport: false })

    /* The pointer on a row of the sidebar changes nothing about the toggle or anything else. */
    const row = await (await p.$('[data-nav-row][href="/app/orders"]')).boundingBox()
    await p.mouse.move(row.x + 40, row.y + row.height / 2)
    await sleep(300)
    const onControls = await controls(p)
    const differ = awayControls.filter((c, i) => c !== onControls[i])
    expect(differ.length === 0 && awayControls.length === onControls.length, "the pointer on the sidebar shows and hides nothing", differ)

    /* On the toggle itself: only the icon darkens, and the tooltip after a short wait. */
    await p.mouse.move(g.toggle.cx, g.toggle.cy)
    await sleep(150)
    const early = await p.evaluate(() => !!document.querySelector("[data-rail-tip]"))
    const hovered = await p.evaluate(() => { const t = document.querySelector("[data-rail-toggle]"); const cs = getComputedStyle(t); return { bg: cs.backgroundColor, border: cs.borderTopWidth, icon: getComputedStyle(t.querySelector("svg")).color } })
    report.toggleHover = { rest: g.toggle.iconColor, hovered }
    /* Changed on purpose (round 32): under the pointer it took the rows' #f3f3f3 fill. Now nothing is filled; the icon goes from #666 to #333. */
    expect(hovered.bg === "rgba(0, 0, 0, 0)" && hovered.border === "0px" && hovered.icon !== g.toggle.iconColor && /^rgb\(51, 51, 51\)$/.test(hovered.icon),
      "under the pointer: still no background or border, only the icon darker", { rest: g.toggle.iconColor, hovered })
    await sleep(450)
    const tip = await p.evaluate(() => {
      const el = document.querySelector("[data-rail-tip]")
      if (!el) return null
      const b = el.getBoundingClientRect()
      const t = document.querySelector("[data-rail-toggle]").getBoundingClientRect()
      return { text: el.textContent, gap: b.left - t.right, midDy: b.top + b.height / 2 - (t.top + t.height / 2), role: el.getAttribute("role") }
    })
    expect(!early && !!tip && tip.text === "Collapse sidebarCtrlB" && tip.role === "tooltip" && tip.gap >= 6 && tip.gap <= 10 && Math.abs(tip.midDy) <= 1, "after a short wait: Collapse sidebar, Ctrl B, beside it", tip)
    await p.screenshot({ path: join(shots, "open-toggle-hover.png"), clip: { x: 0, y: 400, width: 520, height: 500 }, captureBeyondViewport: false })
    await p.mouse.move(900, 500)
    await sleep(250)

    /* The keyboard reaches it, and sees it. */
    await p.keyboard.press("Shift")
    await p.evaluate(() => document.querySelector("[data-rail-toggle]").focus())
    await sleep(250)
    const focused = await p.evaluate(() => { const t = document.querySelector("[data-rail-toggle]"); return { visible: t.matches(":focus-visible"), ring: getComputedStyle(t).boxShadow !== "none" } })
    expect(focused.visible && focused.ring, "focused from the keyboard: a ring", focused)
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
    expect(c.icons.every((x) => Math.abs(x - c.inner / 2) <= 0.01) && c.toggle.iconX === g.toggle.iconX, "every icon, the toggle's too, exactly on the column's centre, where it was open", { column: c.inner / 2, icons: [...new Set(c.icons)] })
    const overSettings = c.settings.top - c.toggle.bottom
    expect(!c.card.shown && c.toggle.opacity === 1 && c.toggle.hitAtRest && c.toggle.inside && overSettings >= 0 && overSettings <= 6 && c.toggle.top > c.asideBottom - 140,
      "the card folded away; the toggle still in sight at the foot, over Settings", { card: c.card, gapToSettings: +overSettings.toFixed(1) })
    expect(c.toggle.text === "" && c.label === "Expand sidebar" && c.expanded === "false", "no word, Expand sidebar, aria-expanded false", { text: c.toggle.text, label: c.label })
    await p.screenshot({ path: join(shots, "collapsed-rest.png"), clip: { x: 0, y: 0, width: 420, height: 900 }, captureBeyondViewport: false })
    await p.mouse.move(c.toggle.cx, c.toggle.cy)
    await sleep(600)
    const tip2 = await p.evaluate(() => {
      const el = document.querySelector("[data-rail-tip]")
      if (!el) return null
      const b = el.getBoundingClientRect()
      const t = document.querySelector("[data-rail-toggle]").getBoundingClientRect()
      return { text: el.textContent, gap: b.left - t.right }
    })
    expect(tip2?.text === "Expand sidebarCtrlB" && tip2.gap >= 6 && tip2.gap <= 10, "its tooltip says Expand sidebar, Ctrl B, beside it", tip2)
    await p.screenshot({ path: join(shots, "collapsed-tooltip.png"), clip: { x: 0, y: 400, width: 420, height: 500 }, captureBeyondViewport: false })
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

    /* A click collapses, a second click opens. */
    await p.click("[data-rail-toggle]")
    await sleep(400)
    const once = await railOf()
    await p.click("[data-rail-toggle]")
    await sleep(400)
    const twice = await railOf()
    expect(once === "collapsed" && twice === "open", "a click collapses it, a second click opens it", { once, twice })
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
    /* The pointer on the sidebar, as it is when someone clicks the toggle. */
    await p.mouse.move(120, 400)
    await sleep(250)
    await p.evaluate(() => {
      window.__film = (ms, act) =>
        new Promise((res) => {
          const aside = document.querySelector("[data-rail-aside]")
          const main = document.querySelector("main")
          const content = document.querySelector("[data-integrations-scroll] > div:nth-child(2)") || document.querySelector("[data-integrations-scroll] > *")
          const icons = [...aside.querySelectorAll("[data-nav-icon]")]
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
              ty: tb.top,
              tShown: +getComputedStyle(toggle).opacity === 1 && getComputedStyle(toggle).visibility === "visible" && tb.left >= ab.left && tb.top >= ab.top && tb.bottom <= ab.bottom,
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
      const ty = one(frames, "ty", -dir)
      const hidden = frames.filter((f) => !f.tShown).length
      const band = Math.max(...frames.map((f) => Math.abs(f.dashTop - 12)))
      const end = frames.findIndex((f) => f.w === endW && f.pad === endW)
      const widths = frames.map((f) => +f.w.toFixed(1))
      report[name] = { frames: frames.length, settledAtMs: end >= 0 ? frames[end].t : null, widths: widths.slice(0, end + 2).join(" "), sidebarVsPageEdgeMaxPx: +lockstep.toFixed(3), iconDriftPx: iconDrift, toggleMovedPx: +(ty.to - ty.from).toFixed(1), toggleHiddenFrames: hidden, biggestWidthShare: +w.share.toFixed(2) }
      expect(w.back === 0 && pad.back === 0 && cx.back === 0, `${name}: the width, the page's edge and the content each move one way only (monotonic)`, { w: w.back, pad: pad.back, content: cx.back })
      expect(lockstep <= 0.5, `${name}:   the page's edge on the sidebar's every frame`, +lockstep.toFixed(3))
      expect(w.moving >= 8 && cx.moving >= 8 && w.share <= 0.3 && cx.share <= 0.3, `${name}:   over many frames, no frame more than 30% of the way`, { frames: w.moving, biggestShare: +Math.max(w.share, cx.share).toFixed(2) })
      expect(end >= 0 && frames[end].t <= 400 && w.to === endW, `${name}:   lands at ${endW}px`, { at: end >= 0 ? frames[end].t : null, w: w.to })
      expect(iconDrift <= 0.01, `${name}:   all ${frames[0].icons.length} icons on the same pixel every frame`, { maxDriftPx: iconDrift })
      expect(hidden === 0, `${name}:   the toggle in sight inside the sidebar every frame`, hidden)
      expect(ty.back === 0 && ty.share <= 0.3, `${name}:   the toggle only moves ${dir < 0 ? "down" : "up"}, smoothly, as the card ${dir < 0 ? "folds" : "opens"}`, { moved: +(ty.to - ty.from).toFixed(1), biggestShare: +ty.share.toFixed(2) })
      expect(band <= 0.01, `${name}:   Dashboard 12px from the top every frame`, band)
      expect(set.back === 0 && Math.abs(set.to - set.from) <= 0.01, `${name}:   Settings, at the foot, never moves as the card folds`, { moved: +(set.to - set.from).toFixed(1) })
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

  // ── Round 32: no sideways scroll, open, collapsed, and on the way ──────────
  console.log("\nNo sideways scroll\n")
  {
    const wide = (p) =>
      p.evaluate(() => {
        const de = document.documentElement
        const box = (el) => (el ? { sw: el.scrollWidth, cw: el.clientWidth } : null)
        return {
          doc: { sw: de.scrollWidth, cw: de.clientWidth },
          body: box(document.body),
          nav: box(document.querySelector("[data-rail-aside] nav")),
          layer: box(document.querySelector("[data-rail-aside] > div")),
          page: box(document.querySelector(".app-content-scroll")),
        }
      })
    const fits = (m) => Object.values(m).every((b) => !b || b.sw <= b.cw)
    report.overflow = {}
    for (const width of [1280, 1440]) {
      const { p } = await open("/app/integrations", { vp: { width, height: 900, deviceScaleFactor: 1 } })
      await p.mouse.move(width - 100, 500)
      const open1 = await wide(p)
      expect(fits(open1), `${width}px open: nothing scrolls sideways (document, nav, sidebar layer, page)`, { doc: open1.doc, nav: open1.nav })
      await p.evaluate(() => {
        window.__wide = (ms) =>
          new Promise((res) => {
            const nav = document.querySelector("[data-rail-aside] nav")
            const layer = document.querySelector("[data-rail-aside] > div")
            const page = document.querySelector(".app-content-scroll")
            const de = document.documentElement
            let worst = 0
            let frames = 0
            let t0 = 0
            const tick = (t) => {
              if (!t0) { t0 = t; document.querySelector("[data-rail-toggle]").click() }
              frames++
              for (const el of [de, document.body, nav, layer, page]) worst = Math.max(worst, el.scrollWidth - el.clientWidth)
              if (t - t0 < ms) requestAnimationFrame(tick)
              else res({ frames, worstPx: worst })
            }
            requestAnimationFrame(tick)
          })
      })
      const during1 = await p.evaluate(() => window.__wide(400))
      const shut = await wide(p)
      expect(during1.worstPx <= 0, `${width}px collapsing: no frame wider than its box`, during1)
      expect(fits(shut), `${width}px collapsed: nothing scrolls sideways`, { doc: shut.doc, nav: shut.nav, layer: shut.layer })
      /* A sideways swipe over the collapsed sidebar, and over the page. */
      for (const [x, where] of [[30, "sidebar"], [width / 2, "page"]]) {
        await p.mouse.move(x, 300)
        await p.mouse.wheel({ deltaX: 400 })
        await sleep(250)
      }
      const moved = await p.evaluate(() => ({
        window: window.scrollX,
        nav: document.querySelector("[data-rail-aside] nav").scrollLeft,
        layer: document.querySelector("[data-rail-aside] > div").scrollLeft,
        page: document.querySelector(".app-content-scroll").scrollLeft,
        root: document.querySelector("[data-app-rail]").scrollLeft,
      }))
      expect(Object.values(moved).every((v) => v === 0), `${width}px collapsed: a sideways swipe over the sidebar or the page moves nothing`, moved)
      const during2 = await p.evaluate(() => window.__wide(400))
      const back = await wide(p)
      expect(during2.worstPx <= 0 && fits(back), `${width}px expanding and open again: no frame wider than its box`, { during: during2, doc: back.doc })
      report.overflow[width] = { open: open1.doc, collapsed: shut.doc, collapsedNav: shut.nav, collapsing: during1, expanding: during2, swipe: moved }
      if (width === 1440) await p.screenshot({ path: join(shots, "open-1440.png"), clip: { x: 0, y: 500, width: 400, height: 400 }, captureBeyondViewport: false })
      await p.close()
    }
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
            requestAnimationFrame(() => res({ w: aside.getBoundingClientRect().width, pad: parseFloat(getComputedStyle(main).paddingLeft), lab: +getComputedStyle(aside.querySelector("[data-nav-label]")).opacity }))
          })
        }),
    )
    expect(f.w === COLLAPSED && f.pad === COLLAPSED && f.lab === 0, "there on the next frame, nothing animates", f)
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
      expect(m.aside === "none" && !m.toggleShown && m.pad === 0 && m.scrollW <= 390 && errors.length === 0, `cookie ${rail}: no sidebar, no toggle, no padding, no sideways scroll`, m)
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
