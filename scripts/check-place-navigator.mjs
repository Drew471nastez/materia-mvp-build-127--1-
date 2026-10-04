/**
 * ===========================================================================
 *  THE NAVIGATOR, THE ACCOUNT MENU, THE SEARCH FIELD AND THE BELL, MEASURED
 * ===========================================================================
 * Renders the real PlatformHeaderClient (light, as storelib.com has it) and
 * the real PlaceNavigator in a community bar (scripts/render-place-navigator
 * .tsx), at 1440x900 and 390x844, and checks round 3's asks 8, 9 and 10 as
 * numbers:
 *
 *   THE NAVIGATOR. Right of the logo (round 4, ask 7; right of the name in a
 *   community's bar), a little bigger; it opens Recently opened (my own
 *   digital products and courses with their covers, round 4 ask 9, and no
 *   such section when there are none), my communities (the current one
 *   marked), Discover communities, Explore and Start creating or Dashboard;
 *   signed out Explore, Discover communities, Log in and Start creating. A popover on a computer that comes and goes
 *   on opacity, scale and translate only, a sheet on a phone. A second
 *   click, a click outside and Escape close it; reduced motion does not move.
 *   THE ACCOUNT MENU. The photo opens it, in the owner's order.
 *   THE SEARCH FIELD. Focused, nothing is laid over it: the page's scrim is
 *   the size of the window (on storelib.com it measured 576 by 42px, the
 *   field's own box), and the field keeps a soft halo.
 *   THE BELL. A second click and a click outside close it; its opacity only
 *   ever goes down once a close begins (no snap back), the popover is the
 *   same height before and after the list arrives, and its pictures are
 *   asked for at their drawn size, lazily.
 *   FRAMES. Every open and close is sampled once per animation frame with the
 *   CPU slowed four times, and the longest gap between frames is reported.
 *
 * Screenshots go to SHOTS_DIR (or a temp folder, printed at the end).
 *
 *   PROBE_CSS=source node scripts/check-place-navigator.mjs
 */
import { build } from "esbuild"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".place-navigator-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-place-navigator-")), "shots")
mkdirSync(shots, { recursive: true })

const STUBS = {
  "next/navigation": `import { useSyncExternalStore } from "react"
const router = { push: (h) => (window.__pushed ||= []).push(h), replace() {}, prefetch() {}, back() {}, refresh() {} }
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})`,
  /* A click on a link is kept, not followed, so the page stays to be measured. */
  "next/link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, onClick, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, onClick: (e) => { onClick?.(e); e.preventDefault(); (window.__clicked ||= []).push(typeof href === "string" ? href : "#") }, ...rest }, children)
})
export const useLinkStatus = () => ({ pending: false })`,
  "next/image": `import React from "react"
const PUBLIC = ${JSON.stringify("file://" + join(root, "public"))}
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, className, style, ...rest }) {
  const url = typeof src === "string" ? (src.startsWith("/") ? PUBLIC + src : src) : ""
  return React.createElement("img", { src: url, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}`,
  "supabase-client": `const who = () => window.__who
const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
const rowFor = (table) => {
  if (table === "profiles") return { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: who() === "seller" }
  if (table === "creators") return who() === "seller" ? { id: "c1", slug: "ava", onboarding_completed: true } : null
  return null
}
const chain = (table) => new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (r) => r({ data: rowFor(table), error: null }) : chain(table),
  apply: () => chain(table),
})
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: who() === "guest" ? null : USER }, error: null }),
      getSession: async () => ({ data: { session: who() === "guest" ? null : { user: USER, access_token: "t" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    realtime: { setAuth: async () => {} },
    from: (table) => chain(table),
    rpc: () => chain(null),
    /* Realtime channels, counted: which are open right now, and how many were ever opened. */
    channel: (name) => {
      const ch = { name, on() { return ch }, subscribe() { (window.__channels ||= new Set()).add(ch); window.__opened = (window.__opened || 0) + 1; return ch } }
      return ch
    },
    removeChannel(ch) { window.__channels?.delete(ch) },
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k.replace(/\//g, "-")}.jsx`), v)

try {
  await build({
    entryPoints: [join(root, "scripts/render-place-navigator.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({ path: join(stubs, `${a.path.replace(/\//g, "-")}.jsx`) }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  fail(`The probe did not bundle: ${e.message}`)
}
const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

async function open(vp, hash, { reduced = false } = {}) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  if (reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await p.goto(`file://${join(stubs, "index.html")}#${hash}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(900)
  if (errors.length) fail(`The page threw (${hash}): ${errors[0]}`)
  return p
}

/*
  ONE SAMPLE PER FRAME of whatever `sel` finds (it may mount and unmount):
  opacity, scale, translate, height, and when the frame ran. Started before
  the action, read after it.
*/
const startSampling = (p, sel) => p.evaluate((sel) => {
  window.__samples = []
  window.__sampling = true
  const tick = (t) => {
    const el = document.querySelector(sel)
    /* A kept panel (the navigator's) is in the page while closed, hidden: that counts as gone. */
    if (el && getComputedStyle(el).visibility !== "hidden") {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      /* offsetHeight: the box's own height, not the scaled one the screen shows mid fade. Pictures as they are first drawn, before a failed load can take one out. */
      for (const i of el.querySelectorAll("img")) (window.__imgs ||= new Map()).set(i.getAttribute("src"), { loading: i.getAttribute("loading"), box: Math.round(i.parentElement.getBoundingClientRect().width / (parseFloat(cs.scale) || 1)) })
      window.__samples.push({ t, present: true, opacity: +cs.opacity, scale: cs.scale, translate: cs.translate, h: el.offsetHeight, state: el.getAttribute("data-state") })
    } else window.__samples.push({ t, present: false })
    if (window.__sampling) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}, sel)
const stopSampling = (p) => p.evaluate(() => { window.__sampling = false; return window.__samples })
const gaps = (s) => { let max = 0; for (let i = 1; i < s.length; i++) max = Math.max(max, s[i].t - s[i - 1].t); return Math.round(max * 10) / 10 }
/* The frames of the motion itself: from the first frame the panel is drawn, so the click's own work (React building it) is reported apart. */
const motionGaps = (s) => { const i = s.findIndex((x) => x.present); return i < 0 ? null : { mount: Math.round((s[i].t - s[Math.max(0, i - 1)].t) * 10) / 10, motion: gaps(s.slice(i)) } }
/** Once a close has begun, the opacity only goes down until the panel is gone. */
const monotonicDown = (s) => {
  const i = s.findIndex((x) => x.present && x.state === "closed")
  if (i < 0) return { ok: false, why: "never closed" }
  let last = Infinity
  for (const x of s.slice(i)) {
    if (!x.present) return { ok: true, frames: s.length - i, gone: true }
    if (x.opacity > last + 0.001) return { ok: false, why: `rose from ${last} to ${x.opacity}` }
    last = x.opacity
  }
  return { ok: false, why: "still there", last }
}
/*
  A SCREENSHOT TAKEN TWICE. Headless Chromium draws no frames while nothing
  asks for one, so the first capture after a transition can be the last frame
  it did draw, mid fade (measured: computed opacity 1, captured at about
  0.7). The first capture asks for a fresh frame; the second is the picture.
*/
const shot = async (p, opts) => { await p.screenshot({ ...opts, path: undefined }); await p.screenshot(opts) }

/* The visible one of several matches (the header draws a phone row and a computer row; one is display: none). */
/* The pointer arrives first and the press comes a moment later, as a hand does; the frames sampled are the press's. */
const clickVisible = async (p, sel, { hoverFirst = false } = {}) => {
  const pt = await p.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, sel)
  if (!pt) throw new Error(`nothing visible for ${sel}`)
  if (hoverFirst) {
    await p.mouse.move(pt.x, pt.y)
    await sleep(300)
  }
  await p.mouse.click(pt.x, pt.y)
}
const throttle = async (p, rate) => { const c = await p.target().createCDPSession(); await c.send("Emulation.setCPUThrottlingRate", { rate }); return c }

const NAV_PANEL = '[data-place-navigator-panel="popover"]'
/* Closed: not in the page, or kept there invisible and inert. */
const navClosed = (p) => p.evaluate((sel) => { const el = document.querySelector(sel); return !el || (getComputedStyle(el).visibility === "hidden" && el.hasAttribute("inert")) }, NAV_PANEL)
const navRows = (p, scope = NAV_PANEL) => p.evaluate((scope) => {
  const root = document.querySelector(scope)
  if (!root) return null
  /* The words a person reads: not the initials drawn in a picture's place (aria-hidden). */
  const words = (e) => { const c = e.cloneNode(true); c.querySelectorAll("[aria-hidden]").forEach((x) => x.remove()); return c.textContent.trim() }
  return [...root.querySelectorAll("p, [data-navigator-row]")].map((e) => ({ text: words(e), href: e.getAttribute("href"), current: e.hasAttribute("data-current"), aria: e.getAttribute("aria-current"), h: Math.round(e.getBoundingClientRect().height) }))
}, scope)

/* ------------------------------------------------------------------ */
console.log("\ncomputer 1440, Explore, signed in buyer: the bar")
{
  const p = await open(DESK, "path=/explore&who=buyer")
  const bar = await p.evaluate(() => {
    const root = document.getElementById("platform-header-root")
    const trig = root.querySelector("[data-place-navigator-trigger]")
    const lines = trig.querySelector("[data-navigator-lines]")
    const logo = [...root.querySelectorAll("[data-header-logo]")].find((i) => i.getBoundingClientRect().width > 0)
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), cy: Math.round(r.top + r.height / 2) } }
    return { bg: getComputedStyle(root).backgroundColor, trigger: box(trig), lines: box(lines), logo: logo && box(logo), categories: !!root.querySelector("[data-categories-dropdown], [data-header-categories]"), overflow: document.documentElement.scrollWidth - innerWidth }
  })
  await shot(p, { path: join(shots, "desk-1440-explore-bar.png"), clip: { x: 0, y: 0, width: 1440, height: 110 } })
  /* Chromium reports a colour with alpha in oklab: #fcfcfd is L 0.991, the old #f7f8f9 was L 0.979. */
  const L = Number(bar.bg.match(/oklab\(([\d.]+)/)?.[1] ?? NaN)
  expect(L > 0.988 && L < 1, "the bar is a little whiter (#fcfcfd, lightness 0.991 where #f7f8f9 was 0.979)", bar.bg)
  expect(!!bar.logo && bar.trigger.x >= bar.logo.right, "the navigator sits RIGHT of the logo and its wordmark", { trigger: bar.trigger, logo: bar.logo })
  expect(!!bar.logo && bar.lines.x - bar.logo.right >= 8 && bar.lines.x - bar.logo.right <= 20 && Math.abs(bar.trigger.cy - bar.logo.cy) <= 2, "close beside it (the lines 8 to 20px after the wordmark) and centred on the same line", { gap: bar.logo && bar.lines.x - bar.logo.right, dy: bar.logo && bar.trigger.cy - bar.logo.cy })
  expect(bar.trigger.w === 40 && bar.trigger.h === 40 && bar.lines.w === 22, "a 40px button with 22px lines (the old icon was an 18px glyph)", { trigger: bar.trigger, lines: bar.lines.w })
  expect(!bar.categories && bar.overflow <= 0, "no category menu in the bar, and nothing wider than the window", bar)

  console.log("\n  the navigator opens, CPU slowed 4x")
  const cdp = await throttle(p, 4)
  await startSampling(p, NAV_PANEL)
  await p.click("[data-place-navigator-trigger]")
  await sleep(700)
  let s = await stopSampling(p)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const firstSeen = s.find((x) => x.present)
  const settled = s.filter((x) => x.present).at(-1)
  expect(firstSeen && firstSeen.opacity < 0.6, "it fades in from nothing rather than appearing at full strength", firstSeen)
  expect(settled && settled.opacity === 1 && settled.scale === "1" , "and settles fully open", settled)
  const props = await p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).transitionProperty, NAV_PANEL)
  expect(props === "opacity, scale, translate", "it moves by opacity, scale and translate only (visibility only flips, at the end of the way out)", props)
  console.log(`        frames while opening: ${JSON.stringify(motionGaps(s))} (ms: the frame that builds it, then the longest during the fade), ${s.length} frames`)
  if (process.env.DEBUG_FRAMES) console.log(s.map((x, i) => i ? `${Math.round(x.t - s[i - 1].t)}${x.present ? ":" + x.opacity.toFixed(2) : ""}` : "").join(" "))
  const rows = await navRows(p)
  await shot(p, { path: join(shots, "desk-1440-explore-navigator.png"), clip: { x: 0, y: 0, width: 520, height: 520 } })
  const texts = rows.map((r) => r.text).join(" | ")
  expect(texts === "Recently opened | Color Grading for Film: the complete course | Ambience Kit Vol. 1 | Your communities | Mara Club | Film School Collective | Morning Runners | Discover communities | Explore | Start creating", "Recently opened first (a course and a download), then my communities in order, Discover communities, Explore, Start creating", texts)
  expect(rows.find((r) => r.text.startsWith("Color Grading"))?.href === "/account/library/courses/k-grade" && rows.find((r) => r.text === "Ambience Kit Vol. 1")?.href === "/account/library/products/p-amb", "the course opens its player, the download its page in the library")
  const things = await p.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-navigator-product]`)].map((a) => { const pic = a.querySelector("[data-app-avatar]").getBoundingClientRect(); const t = a.querySelector("span.truncate"); return { kind: a.getAttribute("data-navigator-product"), pic: Math.round(pic.width), radius: getComputedStyle(a.querySelector("[data-app-avatar]")).borderTopLeftRadius, truncates: t.scrollWidth > t.clientWidth, h: Math.round(a.getBoundingClientRect().height) } }), NAV_PANEL)
  expect(things.length === 2 && things.every((t) => t.pic === 32 && t.radius === "8px" && t.h >= 44), "each with its 32px cover (squared at 8px, not a round avatar), at least 44px tall", things)
  expect(things[0]?.truncates === true, "a long title ends in an ellipsis on one line rather than wrapping", things[0])
  expect(rows.find((r) => r.text === "Start creating")?.href === "/sell" && rows.find((r) => r.text === "Discover communities")?.href === "/explore?type=communities", "Start creating goes to /sell, Discover communities to /explore?type=communities")
  expect(rows.filter((r) => r.current).length === 0, "nothing is marked current on Storelib's own pages")
  const focus = await p.evaluate(() => document.activeElement?.getAttribute("data-place-navigator-panel"))
  expect(focus === "popover", "the panel takes focus, so arrows and Escape work from the first key", focus)
  await p.keyboard.press("ArrowDown")
  const down = await p.evaluate(() => document.activeElement?.textContent?.trim())
  expect(/Color Grading for Film: the complete course$/.test(down), "ArrowDown moves to the first row", down)

  console.log("\n  a second click on the button closes it")
  await throttle(p, 4)
  await startSampling(p, NAV_PANEL)
  await p.click("[data-place-navigator-trigger]")
  await sleep(800)
  s = await stopSampling(p)
  const m = monotonicDown(s)
  expect(m.ok, "it fades out without snapping back, then is hidden", m)
  console.log(`        longest frame while closing: ${gaps(s)}ms`)

  console.log("\n  a click outside, and Escape")
  await p.click("[data-place-navigator-trigger]")
  await sleep(400)
  await p.mouse.click(900, 600)
  await sleep(700)
  expect(await navClosed(p), "a click on the page closes it")
  await p.click("[data-place-navigator-trigger]")
  await sleep(400)
  await p.keyboard.press("Escape")
  await sleep(700)
  const back = await p.evaluate(() => document.activeElement?.hasAttribute("data-place-navigator-trigger"))
  expect((await navClosed(p)) && back, "Escape closes it and puts focus back on the button", { back })
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\ncomputer 1440, a community's bar: the same navigator, the community marked")
{
  const p = await open(DESK, "mode=community&who=buyer")
  await p.click("[data-place-navigator-trigger]")
  await sleep(500)
  const rows = await navRows(p)
  await shot(p, { path: join(shots, "desk-1440-community-navigator.png"), clip: { x: 0, y: 0, width: 760, height: 520 } })
  const cur = rows.filter((r) => r.current)
  expect(cur.length === 1 && cur[0].text === "Mara Club" && cur[0].aria === "page", "Mara Club is marked as where I am", cur)
  const place = await p.evaluate(() => { const t = document.querySelector("[data-place-navigator-trigger]").getBoundingClientRect(); const id = document.querySelector("[data-community-identity]").getBoundingClientRect(); const mark = document.querySelector("[data-community-mark-stand-in]").getBoundingClientRect(); return { trigger: Math.round(t.left), name: Math.round(id.right), mark: Math.round(mark.right) } })
  expect(place.trigger >= place.name && place.name > place.mark, "the hamburger sits right of the community's picture and name", place)
  const panel = await p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: Math.round(r.left), right: Math.round(r.right) } }, NAV_PANEL)
  expect(panel.x >= 12 && panel.right <= 1440, "it hangs under the button, inside the window", panel)
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\ncomputer 1440, signed out")
{
  const p = await open(DESK, "path=/explore&who=guest")
  await p.click("[data-place-navigator-trigger]")
  await sleep(500)
  const rows = await navRows(p)
  await shot(p, { path: join(shots, "desk-1440-guest-navigator.png"), clip: { x: 0, y: 0, width: 520, height: 360 } })
  const texts = rows.map((r) => r.text).join(" | ")
  expect(texts === "Explore | Discover communities | Log in | Start creating", "Explore, Discover communities, Log in, Start creating", texts)
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\ncomputer 1440, a seller who bought nothing")
{
  const p = await open(DESK, "path=/explore&who=seller")
  await p.click("[data-place-navigator-trigger]")
  await sleep(500)
  const rows = await navRows(p)
  const texts = rows.map((r) => r.text).join(" | ")
  await shot(p, { path: join(shots, "desk-1440-seller-navigator.png"), clip: { x: 0, y: 0, width: 520, height: 420 } })
  expect(texts === "Your communities | Mara Club | Film School Collective | Morning Runners | Discover communities | Explore | Dashboard", "no Recently opened at all (no heading, no empty box), then my communities and Dashboard", texts)
  expect(!(await p.$(`${NAV_PANEL} [data-navigator-products]`)), "the section is not in the page")
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\ncomputer 1440, reduced motion")
{
  const p = await open(DESK, "path=/explore&who=buyer", { reduced: true })
  await startSampling(p, NAV_PANEL)
  await p.click("[data-place-navigator-trigger]")
  await sleep(300)
  let s = await stopSampling(p)
  const first = s.find((x) => x.present)
  expect(first && first.opacity === 1, "it is simply there, with no fade", first)
  await startSampling(p, NAV_PANEL)
  await p.click("[data-place-navigator-trigger]")
  await sleep(200)
  s = await stopSampling(p)
  const after = s.filter((x) => x.present && x.state === "closed")
  expect(s.at(-1) && !s.at(-1).present && after.length === 0, "and simply gone: hidden from the first closed frame", after.map((x) => x.opacity))
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\nthe account menu from the photo")
for (const who of ["buyer", "seller"]) {
  const p = await open(DESK, `path=/explore&who=${who}`)
  await p.click("[data-header-avatar]")
  await sleep(450)
  const menu = await p.evaluate(() => {
    const m = document.querySelector("[data-account-menu]")
    if (!m) return null
    const r = m.getBoundingClientRect()
    return { items: [...m.querySelectorAll('[role="menuitem"]')].map((e) => [e.textContent.trim(), e.getAttribute("href")]), right: Math.round(innerWidth - r.right), w: Math.round(r.width), who: m.querySelector("[data-account-who]")?.textContent.trim() }
  })
  await shot(p, { path: join(shots, `desk-1440-account-${who}.png`), clip: { x: 1440 - 420, y: 0, width: 420, height: 520 } })
  const first = who === "seller" ? ["Dashboard", "/app"] : ["Start creating", "/sell"]
  const want = [first, ["Profile", "/account"], ["Settings", "/account/settings"], ["Language", null], ["Help", "/help"], ["Discover", "/explore"], ["Log out", null]]
  expect(menu && JSON.stringify(menu.items) === JSON.stringify(want), `${who}: ${want.map((x) => x[0]).join(", ")}`, menu?.items)
  expect(menu && menu.right >= 16, `${who}: it stays inside the window`, menu?.right)
  if (who === "buyer") {
    await p.click("[data-header-avatar]")
    await sleep(700)
    expect(!(await p.$("[data-account-menu]")), "a second click on the photo closes it")
    await p.click("[data-header-avatar]")
    await sleep(400)
    await p.keyboard.press("Escape")
    await sleep(700)
    const back = await p.evaluate(() => document.activeElement?.hasAttribute("data-header-avatar"))
    expect(!(await p.$("[data-account-menu]")) && back, "Escape closes it, focus back on the photo")
    await p.click("[data-header-avatar]")
    await sleep(400)
    await p.click('[data-account-item="language"]')
    await sleep(600)
    const lang = await p.evaluate(() => !![...document.querySelectorAll('[role="dialog"]')].find((d) => /language/i.test(d.textContent)))
    expect(lang, "Language opens the language picker")
  }
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\nthe search field, focused (a page where the header carries it)")
{
  const p = await open(DESK, "path=/help&who=buyer")
  const before = await p.evaluate(() => { const i = document.querySelector("[data-header-search-field] input"); const cs = getComputedStyle(i); return { shadow: cs.boxShadow, border: cs.borderTopColor } })
  await p.click("[data-header-search-field] input")
  await sleep(500)
  const r = await p.evaluate(() => {
    const i = document.querySelector("[data-header-search-field] input")
    const b = i.getBoundingClientRect()
    const scrim = document.querySelector("[data-header-search-scrim]")
    const sr = scrim?.getBoundingClientRect()
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    const cs = getComputedStyle(i)
    return { focused: document.activeElement === i, scrim: sr && { w: Math.round(sr.width), h: Math.round(sr.height), x: Math.round(sr.left), y: Math.round(sr.top), parent: scrim.parentElement.tagName }, hitIsField: hit === i, shadow: cs.boxShadow, border: cs.borderTopColor, outline: cs.outlineStyle }
  })
  await shot(p, { path: join(shots, "desk-1440-search-focused.png"), clip: { x: 0, y: 0, width: 1440, height: 420 } })
  await shot(p, { path: join(shots, "desk-1440-search-focused-zoom.png"), clip: { x: 360, y: 0, width: 720, height: 80 } })
  expect(r.focused && r.hitIsField, "the field is focused and nothing is drawn over it", r)
  expect(r.scrim && r.scrim.w === 1440 && r.scrim.h === 900 && r.scrim.parent === "BODY", "the page's scrim is the window, not a box the size of the field (live: 576x42)", r.scrim)
  expect(r.shadow !== before.shadow && /0px 0px 0px 4px/.test(r.shadow) && r.border !== before.border && r.outline === "none", "a soft focus state: a darker hairline and a 4px halo, no ring or outline box", { before, after: { shadow: r.shadow, border: r.border } })
  await p.keyboard.press("Escape")
  await sleep(400)
  /* By keyboard: the halo is the visible focus. */
  await p.focus("[data-header-search-field] input")
  await sleep(300)
  const kb = await p.evaluate(() => getComputedStyle(document.querySelector("[data-header-search-field] input")).boxShadow)
  expect(/0px 0px 0px 4px/.test(kb), "reached by keyboard, it shows the same halo", kb)
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\nthe bell")
{
  const p = await open(DESK, "path=/help&who=buyer")
  const BELL = "[data-notification-bell]"
  const bell = () => clickVisible(p, BELL)
  const PANEL = '[data-notification-panel="popover"]'
  const kept = await p.evaluate((sel) => { const b = document.querySelector(sel); return b ? { visibility: getComputedStyle(b).visibility, inert: b.hasAttribute("inert") } : null }, PANEL)
  expect(kept && kept.visibility === "hidden" && kept.inert, "built while the page was idle, before any click: in the page, invisible and inert", kept)
  const cdp = await throttle(p, 4)
  await p.mouse.move(1300, 30)
  await sleep(300)
  await startSampling(p, PANEL)
  await clickVisible(p, BELL, { hoverFirst: true })
  await sleep(900)
  let s = await stopSampling(p)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const shown = s.filter((x) => x.present)
  expect(shown[0] && shown[0].opacity < 0.6 && shown.at(-1).opacity === 1, "it fades in and settles", { first: shown[0], last: shown.at(-1) })
  const heights = [...new Set(shown.map((x) => x.h))]
  expect(heights.length === 1, "the same height while the list loads and once it is there", heights)
  console.log(`        frames while opening: ${JSON.stringify(motionGaps(s))} (ms: the frame that builds it, then the longest during the fade), ${s.length} frames`)
  if (process.env.DEBUG_FRAMES) console.log(s.map((x, i) => i ? `${Math.round(x.t - s[i - 1].t)}${x.present ? ":" + x.opacity.toFixed(2) : ""}` : "").join(" "))
  const props = await p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).transitionProperty, PANEL)
  expect(props === "opacity, translate, scale", "it moves by opacity, translate and scale only (visibility only flips, at the end of the way out)", props)
  const panels = await p.evaluate(() => document.querySelectorAll("[data-notification-panel]").length)
  expect(panels === 1, "one list in the page: the hidden phone row's bell builds none", panels)
  const pics = await p.evaluate(() => [...(window.__imgs ?? new Map()).entries()].map(([src, v]) => ({ src: decodeURIComponent(src), ...v })))
  expect(pics.length >= 2 && pics.every((x) => x.src.startsWith("/_next/image?url=https://abc.supabase.co") && x.loading === "lazy"), "every picture is asked for through the optimizer, lazily", pics)
  expect(pics.every((x) => /&w=96&/.test(x.src) && x.box === 40), "at its drawn size: 40px boxes ask for 96px files (2x, the next size the optimizer has)", pics.map((x) => [x.box, x.src.match(/&w=(\d+)/)?.[1]]))
  await shot(p, { path: join(shots, "desk-1440-bell-open.png"), clip: { x: 1440 - 520, y: 0, width: 520, height: 640 } })

  console.log("\n  a second click on the bell closes it, CPU slowed 4x")
  await throttle(p, 4)
  await startSampling(p, PANEL)
  await bell()
  await sleep(900)
  s = await stopSampling(p)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const m = monotonicDown(s)
  expect(m.ok, "it fades out without snapping back, then is hidden", m)
  console.log(`        longest frame while closing: ${gaps(s)}ms`)

  console.log("\n  a click outside")
  await bell()
  await sleep(500)
  await throttle(p, 4)
  await startSampling(p, PANEL)
  await p.mouse.click(500, 600)
  await sleep(900)
  s = await stopSampling(p)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const m2 = monotonicDown(s)
  expect(m2.ok, "a click on the page closes it the same way", m2)
  console.log(`        longest frame while closing: ${gaps(s)}ms`)
  await bell()
  await sleep(500)
  await p.click("[data-header-avatar]")
  await sleep(700)
  const both = await p.evaluate((sel) => { const b = document.querySelector(sel); return { bell: !!b && getComputedStyle(b).visibility !== "hidden", menu: !!document.querySelector("[data-account-menu]") } }, PANEL)
  expect(!both.bell && both.menu, "a click on the photo while it is open closes it and opens the photo's menu (nothing swallows the click)", both)
  await p.keyboard.press("Escape")
  await sleep(500)
  await bell()
  await sleep(500)
  await p.keyboard.press("Escape")
  await sleep(700)
  expect(await p.evaluate((sel) => { const b = document.querySelector(sel); return !b || (getComputedStyle(b).visibility === "hidden" && b.hasAttribute("inert")) }, PANEL), "Escape closes it")
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\nphone 390")
for (const hash of ["path=/explore&who=buyer", "path=/explore&who=guest", "mode=community&who=buyer"]) {
  const tag = hash.replace(/&/g, " ")
  const p = await open(PHONE, hash)
  const bar = await p.evaluate(() => {
    const trig = document.querySelector("[data-place-navigator-trigger]")
    const t = trig.getBoundingClientRect()
    const lines = trig.querySelector("[data-navigator-lines]").getBoundingClientRect()
    const logo = [...document.querySelectorAll("[data-header-logo], [data-community-identity]")].find((i) => i.getBoundingClientRect().width > 0)?.getBoundingClientRect()
    return { trigger: { x: Math.round(t.left), right: Math.round(t.right), w: Math.round(t.width) }, lines: Math.round(lines.width), linesX: Math.round(lines.left), logoX: logo ? Math.round(logo.left) : null, logoRight: logo ? Math.round(logo.right) : null, overflow: document.documentElement.scrollWidth - innerWidth, triggers: document.querySelectorAll("[data-place-navigator-trigger]").length }
  })
  await shot(p, { path: join(shots, `phone-390-${hash.includes("community") ? "community" : hash.includes("guest") ? "guest" : "buyer"}-bar.png`), clip: { x: 0, y: 0, width: 390, height: 100 } })
  expect(bar.overflow <= 0 && bar.triggers === 1, `${tag}: one navigator, nothing wider than the window`, bar)
  expect(bar.lines === 25 && bar.trigger.w >= 40, `${tag}: 25px lines in a 40px button`, bar)
  expect(bar.logoX !== null && bar.trigger.x >= bar.logoRight - 0.5 && bar.logoX >= 12, `${tag}: right of the ${hash.includes("community") ? "community's name" : "logo"}, which keeps its place at the edge`, bar)
  await p.tap("[data-place-navigator-trigger]")
  await sleep(800)
  const sheet = await p.evaluate(() => {
    const root = document.querySelector('[data-app-sheet] [data-place-navigator-panel="sheet"]')
    if (!root) return null
    const panel = root.closest("[data-sheet-panel]")?.getBoundingClientRect()
    const words = (e) => { const c = e.cloneNode(true); c.querySelectorAll("[aria-hidden]").forEach((x) => x.remove()); return c.textContent.trim() }
    return { rows: [...root.querySelectorAll("[data-navigator-row]")].map((e) => ({ text: words(e), h: Math.round(e.getBoundingClientRect().height), current: e.hasAttribute("data-current") })), bottom: panel && Math.round(panel.bottom), h: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth }
  })
  await shot(p, { path: join(shots, `phone-390-${hash.includes("community") ? "community" : hash.includes("guest") ? "guest" : "buyer"}-navigator.png`) })
  expect(!!sheet && sheet.rows.length >= 3, `${tag}: the sheet opens`, sheet?.rows.map((r) => r.text))
  if (sheet) {
    expect(sheet.rows.every((r) => r.h >= 44), `${tag}: every row is at least 44px to a thumb`, sheet.rows.map((r) => r.h))
    if (hash.includes("community")) expect(sheet.rows.find((r) => r.current)?.text === "Mara Club", `${tag}: Mara Club marked`)
    if (hash.includes("guest")) expect(sheet.rows.map((r) => r.text).join(" | ") === "Explore | Discover communities | Log in | Start creating", `${tag}: the signed out rows`, sheet.rows.map((r) => r.text))
    else expect(sheet.rows.slice(0, 3).map((r) => r.text).join(" | ") === "Color Grading for Film: the complete course | Ambience Kit Vol. 1 | Mara Club", `${tag}: Recently opened first, then my communities`, sheet.rows.slice(0, 3).map((r) => r.text))
  }
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\none bell asks and listens, at either width")
{
  const p = await open(DESK, "path=/help&who=buyer")
  await sleep(600)
  const read = () => p.evaluate(() => ({
    channels: [...(window.__channels ?? [])].map((c) => c.name).sort(),
    opened: window.__opened || 0,
    summaries: window.__fetches.filter((u) => u.includes("summary=1")).length,
    badges: [...document.querySelectorAll("[data-notification-bell]")].filter((b) => b.getClientRects().length).map((b) => b.querySelector("[data-bell-badge]")?.textContent ?? null),
    bells: document.querySelectorAll("[data-notification-bell]").length,
    active: [...document.querySelectorAll("[data-notification-bell]")].map((b) => [b.getClientRects().length > 0, b.hasAttribute("data-bell-active")]),
  }))
  const SET = "bell:community_notifications:u1,bell:user_notifications:u1"
  /* Headless Chromium draws no frame unless one is asked for, and a resize and a ResizeObserver are both delivered in a frame: ask for two. */
  const frames = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const d = await read()
  expect(d.bells === 2 && d.channels.join() === SET && d.opened === 2 && d.summaries === 1, "computer: two bells in the header, one set of channels (two) and one count read", d)
  expect(d.badges.join() === "2", "the bell on screen shows the count", d.badges)
  /* Not isMobile or hasTouch: changing either makes puppeteer reload the page, which is not a layout switch. */
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  await frames()
  const mid = await read()
  expect(mid.badges.join() === "2", "the moment the layout switches, the bell that appears already shows the count", mid.badges)
  await sleep(600)
  const ph = await read()
  expect(ph.channels.join() === SET && ph.channels.length === 2 && ph.opened === 4 && ph.summaries === 2, "phone: still one set of channels open (the hidden bell let its two go as the visible one opened its own), the count read once more", ph)
  await p.setViewport(DESK)
  await frames()
  await sleep(600)
  const back = await read()
  expect(back.channels.join() === SET && back.badges.join() === "2", "and back on a computer: one set, the same badge", back)
  await p.close()
}

/* ------------------------------------------------------------------ */
console.log("\nphone 390: the account sheet from the photo has the computer menu's rows")
for (const who of ["buyer", "seller"]) {
  const p = await open(PHONE, `path=/explore&who=${who}`)
  await p.tap('button[aria-label="Open profile menu"]')
  await sleep(800)
  const rows = await p.evaluate(() => {
    const sheet = document.querySelector("[data-app-sheet] [data-account-sheet]")?.closest("[data-sheet-panel]")
    if (!sheet) return null
    return [...sheet.querySelectorAll("[data-account-item]")].map((e) => ({ item: e.getAttribute("data-account-item"), href: e.getAttribute("href"), text: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height) }))
  })
  await shot(p, { path: join(shots, `phone-390-account-${who}.png`) })
  const want = [who === "seller" ? ["dashboard", "/app"] : ["start-creating", "/sell"], ["profile", "/account"], ["settings", "/account/settings"], ["language", null], ["help", "/help"], ["discover", "/explore"], ["log-out", null]]
  expect(rows && JSON.stringify(rows.map((r) => [r.item, r.href])) === JSON.stringify(want), `${who}: ${want.map((x) => x[0]).join(", ")}, and no My Library`, rows?.map((r) => [r.item, r.href]))
  expect(rows && rows.every((r) => r.h >= 44), `${who}: every row at least 44px`, rows?.map((r) => r.h))
  await p.close()
}

await browser.close()
if (!process.env.KEEP_PROBE) rmSync(stubs, { recursive: true, force: true })
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
