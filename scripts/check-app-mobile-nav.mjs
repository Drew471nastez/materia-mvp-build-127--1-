/**
 * ===========================================================================
 *  THE PHONE'S NAVIGATION, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The hamburger left the top left corner and the menu became a pill at the
 * bottom with a page behind it. Every claim in that sentence is geometry or
 * motion, so none of it is settled by reading the source:
 *
 *   IS IT REACHABLE. The reason it moved is that the old control sat in the
 *     corner of a 390x844 screen furthest from a thumb. The new one has to be
 *     near the bottom, centred, and clear of the home indicator, and every
 *     target in it has to be at least 44px.
 *
 *   IS IT GLASS. "Very frosty, glass like" is a backdrop-filter that is
 *     actually applied and actually masked — a blur that ends on a hard line
 *     is the thing that reads as a panel bolted to the bottom of the screen.
 *
 *   IS IT LIGHT. Explicitly not the dark menu in the reference. So the menu
 *     page is measured against the page it covers, not described.
 *
 *   DOES IT MOVE ON THE COMPOSITOR. "Open smooth, close smooth, extremely
 *     200fps" is transform and opacity and nothing else. A transition that
 *     lists `height`, `top` or `width` relayouts every frame.
 *
 *   AND IS ANYTHING LEFT UNDERNEATH IT. A fixed pill takes no space in the
 *     flow, so the last row of every list would sit under it without a rule
 *     that says otherwise.
 *
 * It also writes a picture of both states, because the last line of CLAUDE.md
 * is to look at the result.
 *
 *   pnpm build && node scripts/check-app-mobile-nav.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const VIEW_W = 390
const VIEW_H = 844
const shots = join(root, ".nav-probe")
mkdirSync(shots, { recursive: true })

/* The stubs live INSIDE the repo: esbuild resolves "react" from the nearest
   node_modules, and a file in /tmp has none above it. */
const out = mkdtempSync(join(tmpdir(), "storelib-navpill-"))
writeFileSync(join(shots, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(shots, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-app-mobile-nav.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(shots, "link.jsx")}`,
  `--alias:next/navigation=${join(shots, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

writeFileSync(join(out, "index.html"),
  `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>` +
  `<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});` +
  `window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="probe.js"></script></body></html>`)

/* ── the browser ─────────────────────────────────────────────────────────── */
const profile = mkdtempSync(join(tmpdir(), "storelib-navpill-profile-"))
const chrome = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--allow-file-access-from-files",
  `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
  `--window-size=${VIEW_W},${VIEW_H}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] })
const reap = () => { try { chrome.kill("SIGKILL") } catch {} }
for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, reap)

const portFile = join(profile, "DevToolsActivePort")
let port = null
for (let i = 0; i < 80 && !port; i++) {
  if (existsSync(portFile)) {
    const first = readFileSync(portFile, "utf8").split("\n")[0].trim()
    if (first) port = Number(first)
  }
  if (!port) await sleep(250)
}
if (!port) { reap(); fail("Chromium never reported a debugging port.") }
let version = null
for (let i = 0; i < 40 && !version; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() } catch { await sleep(250) }
}
if (!version) { reap(); fail("Chromium did not answer on its port.") }

const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }) })
let id = 0
const pending = new Map()
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id) }
})
let sessionId = null
const send = (method, params = {}, session = sessionId) =>
  new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
const ev = async (expr) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
  if (exceptionDetails) fail(`the page threw: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`)
  return result?.value
}
const shoot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" })
  if (data) writeFileSync(join(shots, name), Buffer.from(data, "base64"))
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true })
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
await send("Page.navigate", { url: `file://${join(out, "index.html")}` })
await sleep(1600)

const ran = await ev("!!window.__ran")
if (!ran) { const t = await ev("window.__threw || (window.__err||[])[0] || null"); reap(); fail(`the harness never rendered: ${t}`) }

/* ── what is on screen with the menu shut ────────────────────────────────── */
const READ_PILL = `(() => {
  const pill = document.querySelector('nav[aria-label="Main"]')
  const band = pill?.parentElement?.querySelector('[aria-hidden="true"]')
  const b = pill.getBoundingClientRect()
  const bandBox = band.getBoundingClientRect()
  const bs = getComputedStyle(band)
  const ps = getComputedStyle(pill)
  const targets = [...pill.children].map((c) => {
    const r = c.getBoundingClientRect()
    return { label: c.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height) }
  })
  /* What a finger at the middle of each target would actually hit. */
  const hits = [...pill.children].map((c) => {
    const r = c.getBoundingClientRect()
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return { label: c.getAttribute("aria-label"), reaches: !!(el && c.contains(el)) }
  })
  const scroller = document.querySelector(".app-content-scroll")
  return {
    pill: { x: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height),
            bottomGap: Math.round(window.innerHeight - b.bottom),
            centred: Math.abs((b.left + b.right) / 2 - window.innerWidth / 2) <= 1,
            radius: ps.borderRadius, bg: ps.backgroundColor, shadow: ps.boxShadow.slice(0, 120) },
    band: { h: Math.round(bandBox.height),
            backdrop: bs.backdropFilter || bs.webkitBackdropFilter,
            mask: (bs.maskImage || bs.webkitMaskImage || "none").slice(0, 90) },
    targets, hits,
    scrollPadBottom: scroller ? getComputedStyle(scroller).paddingBottom : null,
    /* Is the last card clear of the pill when the list is scrolled to its end? */
    lastCardClear: (() => {
      const s = document.querySelector(".app-content-scroll")
      s.scrollTop = s.scrollHeight
      const cards = document.querySelectorAll("[data-card]")
      const last = cards[cards.length - 1].getBoundingClientRect()
      const p = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
      return Math.round(p.top - last.bottom)
    })(),
    headerHasHamburger: !!document.querySelector("header [aria-label='Open menu'], header [aria-label='Close menu']"),
  }
})()`
const shut = await ev(READ_PILL)
await ev('document.querySelector(".app-content-scroll").scrollTop = 0')
await sleep(120)
await shoot("closed.png")

/* ── open it, the way the pill does ──────────────────────────────────────── */
const menuBtn = await ev(`(() => {
  const pill = document.querySelector('nav[aria-label="Main"]')
  const b = [...pill.children].find((c) => /menu/i.test(c.getAttribute("aria-label") || ""))
  const r = b.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
})()`)
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: menuBtn.x, y: menuBtn.y, radiusX: 12, radiusY: 12, force: 1 }] })
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
await sleep(600)

const READ_MENU = `(() => {
  const page = document.getElementById("app-mobile-menu")
  const s = getComputedStyle(page)
  const r = page.getBoundingClientRect()
  const rows = [...page.querySelectorAll("a,button")].map((n) => {
    const b = n.getBoundingClientRect()
    return { text: (n.textContent || "").trim().slice(0, 22), h: Math.round(b.height) }
  }).filter((x) => x.h > 0)
  const glyph = document.querySelector('nav[aria-label="Main"] [aria-label="Close menu"]')
  return {
    open: page.getAttribute("data-mobile-menu"),
    bg: s.backgroundColor,
    transition: s.transitionProperty,
    transform: s.transform,
    opacity: s.opacity,
    top: Math.round(r.top),
    covers: Math.round(r.height),
    /* A menu that is over the page must not let the page scroll behind it. */
    pageLocked: getComputedStyle(document.querySelector(".app-content-scroll")).overflowY,
    rows,
    minRowHeight: Math.min(...rows.map((x) => x.h)),
    hasSettings: rows.some((x) => /settings/i.test(x.text)),
    hasQuickSale: rows.some((x) => /quick sale/i.test(x.text)),
    closeIsInThePill: !!glyph,
    /* The pill has to be ON TOP of the page it opened. */
    pillOverMenu: (() => {
      const p = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
      const el = document.elementFromPoint(Math.round((p.left + p.right) / 2), Math.round((p.top + p.bottom) / 2))
      return !!(el && document.querySelector('nav[aria-label="Main"]').contains(el))
    })(),
    exploreStillThere: !!document.querySelector('nav[aria-label="Main"] [aria-label="Explore"]'),
  }
})()`
const open = await ev(READ_MENU)
await shoot("open.png")

/* ── a group, opened and closed, one frame at a time ─────────────────────── */
const GROUP = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const btn = [...document.querySelectorAll('#app-mobile-menu [aria-expanded]')][0]
  const sub = btn.closest("div").parentElement.querySelector("[data-nav-submenu]")
  const track = () => {
    const frames = []
    let last = performance.now()
    let on = true
    const tick = (t) => { if (!on) return; frames.push(Math.round((t - last) * 10) / 10); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame((t) => { last = t; tick(t) })
    return { frames, stop: () => { on = false } }
  }
  const heights = []
  const run = async () => {
    const w = track()
    btn.click()
    for (let i = 0; i < 18; i++) { await wait(16); heights.push(Math.round(sub.getBoundingClientRect().height)) }
    await wait(200)
    w.stop()
    return w.frames.slice(1)
  }
  const opening = await run()
  const openHeight = Math.round(sub.getBoundingClientRect().height)
  const openState = sub.getAttribute("data-nav-submenu")
  const closing = await run()
  await wait(320)
  const shutHeight = Math.round(sub.getBoundingClientRect().height)
  const transition = getComputedStyle(sub).transitionProperty
  /* Distinct intermediate heights: an animation, rather than a jump. */
  const steps = new Set(heights.filter((h) => h > 0 && h < openHeight)).size
  return {
    openHeight, shutHeight, openState, transition, steps,
    /* The element has to SURVIVE the transition. If the menu is rebuilt on
       every render the node measured at the end is not the node that started. */
    sameNode: sub === (btn.closest("div").parentElement.querySelector("[data-nav-submenu]")),
    worstFrame: Math.max(...opening.concat(closing)),
    frames: opening.length + closing.length,
  }
})()`
const group = await ev(GROUP)

/* ── and a page that raises its own bottom bar takes the strip ───────────── */
const SHARE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const pill = document.querySelector("[data-app-nav-pill]")
  const before = Math.round(pill.getBoundingClientRect().top)
  const bar = document.createElement("div")
  bar.setAttribute("data-app-bottom-bar", "visible")
  bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:72px;background:#fff"
  document.body.appendChild(bar)
  await wait(420)
  const during = Math.round(pill.getBoundingClientRect().top)
  const reachable = (() => {
    const r = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
    const el = document.elementFromPoint(Math.round((r.left + r.right) / 2), Math.round((r.top + r.bottom) / 2))
    return !!(el && document.querySelector('nav[aria-label="Main"]').contains(el))
  })()
  bar.setAttribute("data-app-bottom-bar", "hidden")
  await wait(420)
  const after = Math.round(pill.getBoundingClientRect().top)
  bar.remove()
  return { before, during, after, reachable, moves: /transform/.test(getComputedStyle(pill).transitionProperty) }
})()`
const share = await ev(SHARE)

await send("Target.closeTarget", { targetId }, null)
ws.close()
reap()

/* ── the report ──────────────────────────────────────────────────────────── */
const problems = []
const say = (ok, line) => console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`)
const must = (ok, line, why) => { say(ok, line); if (!ok) problems.push(why) }

console.log(`\n  The phone's navigation at ${VIEW_W}x${VIEW_H}\n`)
console.log(`  the pill    ${shut.pill.w}x${shut.pill.h} at x=${shut.pill.x}, ${shut.pill.bottomGap}px above the bottom, radius ${shut.pill.radius}`)
console.log(`              ${shut.pill.bg}`)
console.log(`  the band    ${shut.band.h}px tall, ${shut.band.backdrop}`)
console.log(`              masked: ${shut.band.mask}`)
console.log(`  targets     ${shut.targets.map((t) => `${t.label} ${t.w}x${t.h}`).join(", ")}`)
console.log(`  clearance   list padded ${shut.scrollPadBottom} at the bottom; scrolled to the end the last card stops ${shut.lastCardClear}px above the pill`)
console.log(`  the menu    ${open.covers}px tall from y=${open.top}, ${open.bg}, moves ${open.transition}`)
console.log(`  a group     ${group.shutHeight}px to ${group.openHeight}px over ${group.steps} distinct heights, worst frame ${group.worstFrame}ms of ${group.frames}\n`)

must(!shut.headerHasHamburger, "the hamburger is out of the header", "the header still carries a hamburger")
must(shut.pill.centred, "the pill is centred", `the pill is off centre (x=${shut.pill.x}, width ${shut.pill.w})`)
must(shut.pill.bottomGap >= 8 && shut.pill.bottomGap <= 40, "and sits just above the bottom edge, where a thumb is",
  `the pill is ${shut.pill.bottomGap}px from the bottom`)
must(shut.pill.radius.startsWith("999") || Number.parseFloat(shut.pill.radius) >= shut.pill.h / 2,
  "it is a pill, not a rounded rectangle", `its radius is ${shut.pill.radius} on a ${shut.pill.h}px box`)
must(shut.targets.length === 3 && shut.targets.every((t) => t.h >= 44 && t.w >= 44),
  "every target in it is at least 44px", `targets: ${shut.targets.map((t) => `${t.label} ${t.w}x${t.h}`).join(", ")}`)
must(shut.hits.every((h) => h.reaches), "and a press in the middle of each one reaches it",
  `these do not: ${shut.hits.filter((h) => !h.reaches).map((h) => h.label).join(", ")}`)

must(/blur\(/.test(shut.band.backdrop), "the band behind it really blurs what is under it",
  `backdrop-filter is "${shut.band.backdrop}"`)
must(shut.band.mask !== "none" && /gradient/.test(shut.band.mask),
  "and it is masked, so the blur fades out instead of ending on a line",
  "the blur has a hard top edge, which reads as a panel bolted to the screen")
const pillAlpha = Number((shut.pill.bg.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/) ?? [])[1] ?? 1)
must(/^rgba?\(255, 255, 255/.test(shut.pill.bg) && pillAlpha > 0.5 && pillAlpha < 1,
  "the pill itself is translucent white over that blur",
  `the pill is ${shut.pill.bg}: it has to let the blur through without disappearing into it`)

must(Number.parseFloat(shut.scrollPadBottom) >= 88, "the page leaves room for the pill under its content",
  `.app-content-scroll pads only ${shut.scrollPadBottom} at the bottom, so the last row sits under the pill`)
must(shut.lastCardClear > 0, "so the last card is still clear of it at the end of the list",
  `the last card ends ${shut.lastCardClear}px past the top of the pill`)

console.log("")
must(open.open === "open", "the menu opens from the pill", "pressing the menu button did not open it")
must(open.covers > VIEW_H * 0.7, "as a page rather than a panel", `it covers ${open.covers}px of ${VIEW_H}`)
must(open.bg === "rgb(248, 249, 250)", "and it is the light page colour, not the dark menu in the reference",
  `the menu page is ${open.bg}`)
must(!/height|width|top|left|margin|padding/.test(open.transition) && /transform/.test(open.transition) && /opacity/.test(open.transition),
  "it moves on transform and opacity only", `it transitions ${open.transition}, which relayouts every frame`)
must(open.pageLocked === "hidden", "the page behind it does not scroll while it is open",
  `.app-content-scroll is overflow-y: ${open.pageLocked}`)
must(open.hasSettings, "settings is a row in it", "there is no settings row in the menu")
must(!open.hasQuickSale, "and there is no Quick Sale", "a Quick Sale control is in the menu")
must(open.minRowHeight >= 40, "every row in it is at least 40px tall", `the shortest row is ${open.minRowHeight}px`)
must(open.closeIsInThePill, "the menu button has become the close button", "there is no close control in the pill")
must(open.pillOverMenu, "and the pill is on top of the page it opened", "the menu page is drawn over its own pill")
must(open.exploreStillThere, "explore stays reachable with the menu open",
  "explore is not reachable while the menu is open")

console.log("")
must(group.openHeight > 0 && group.shutHeight === 0, "a group opens and closes",
  `it went ${group.shutHeight}px to ${group.openHeight}px and back to ${group.shutHeight}px`)
must(group.steps >= 3, "over intermediate heights, so it is animated rather than switched",
  `only ${group.steps} distinct heights between shut and open: it is jumping`)
must(group.sameNode, "and the element carrying the animation survives it",
  "the submenu node was replaced mid-transition, which is a remount, not an animation")
must(/grid-template-rows/.test(group.transition), "on a grid track, with nothing to measure or release",
  `it transitions ${group.transition}`)

console.log("")
must(share.during > share.before + 40, "a page that raises its own bottom bar gets the strip, and the pill drops away",
  `the pill sat at y=${share.before} and moved to y=${share.during} when a bottom bar appeared: it is still over it`)
must(!share.reachable, "and nothing can be pressed on it while it is gone",
  "the pill is invisible but still takes presses, which is worse than leaving it")
must(share.after === share.before, "it comes back when the bar goes",
  `it returned to y=${share.after} instead of y=${share.before}`)
must(share.moves, "and it moves rather than blinking", "the pill has no transform transition")

console.log(`\n  pictures in .nav-probe/closed.png and .nav-probe/open.png\n`)
if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The pill is where a thumb is, it is glass, and the menu is a light page.\n")
