/**
 * ===========================================================================
 *  HOW AN /app PAGE ARRIVES, MEASURED EVERY FRAME, AT 390 AND 1280
 * ===========================================================================
 * "Make sure switching between app pages is clean, no flashes or glitches.
 * There should be NO skeleton loading structure on mobile devices when
 * switching pages. Once I click on something it loads like native. If it
 * takes really long, show a smooth clean iOS style rotating spinner."
 *
 * Every claim in that is a claim about frames, so this records one reading
 * per animation frame (which page is showing, how much of it can be seen,
 * where it sits, whether the bar, the spinner or any outline of a page is
 * up) through navigations whose server takes from 40ms to 1600ms, a back, a
 * second click while the first is still on its way, and presses on the page
 * already showing:
 *
 *   NO OUTLINE, EVER                      not one frame with
 *                                         [data-app-route-skeleton], at
 *                                         either width
 *   A FAST PAGE SHOWS NOTHING BUT ITSELF  no spinner, no bar, and the old
 *                                         page on screen until the new one
 *   THE LANDING                           seen from 0 (the page's opacity
 *                                         times what the spinner's surface
 *                                         lets through), a rise of 4 to 6px,
 *                                         about 180ms, never backwards
 *   ON A PHONE                            nothing under 500ms: no bar, no
 *                                         spinner; past it the spinner,
 *                                         faded in over about 150ms, the old
 *                                         page under it until the new one
 *   ON A COMPUTER                         the bar from 300ms, the spinner
 *                                         only past 1000ms
 *   ONE SPINNER THROUGH TWO CLICKS        a second click while it is up does
 *                                         not fade it out and in again
 *   THE PAGE YOU ARE ON                   a click on it, or a push to it,
 *                                         shows no bar and no spinner
 *   BACK                                  the page's scroll is where it was on
 *                                         the first frame it shows
 *   A PAGE WITH A FIXED BAR               fades without the rise
 *   THE PRODUCT EDITOR                    no spinner at any width
 *   NO LONG TASK, NO LAYOUT SHIFT
 *
 * The real NavigationLoadingBar and AppStage, over a shell shaped like
 * app/app/layout.tsx (scripts/render-app-stage.tsx), served over http so the
 * history is the browser's own.
 *
 *   node scripts/check-app-stage.mjs
 *   STAGE_SHOTS=<dir> node scripts/check-app-stage.mjs   (and a picture of the spinner at each width)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".stage-probe")
mkdirSync(dir, { recursive: true })
/* The router, as far as these components can see one: an address that
   changes when the new page commits. */
writeFileSync(join(dir, "navigation.js"), `import { useSyncExternalStore } from "react"
const subs = new Set()
let href = location.pathname + location.search
globalThis.__commit = (next) => { href = next; for (const f of [...subs]) f() }
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
const read = () => href
export const usePathname = () => useSyncExternalStore(sub, () => read().split("?")[0], () => "/app")
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => read().split("?")[1] || "", () => ""))
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() { history.back() } })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-app-stage.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', `--alias:next/navigation=${join(dir, "navigation.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const report = {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100)

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 860, deviceScaleFactor: 1 }],
]) {
  const phone = label === "390"
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app`)
  await wait(400)
  await page.evaluate(() => {
    window.__rec = []
    window.__long = []
    window.__shift = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask" })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shift += e.value }).observe({ type: "layout-shift", buffered: false })
    const scroller = () => document.querySelector(".app-content-scroll")
    const tick = (t) => {
      const p = document.querySelector("[data-page]")
      const outline = document.querySelector("[data-app-route-skeleton]")
      const slow = document.querySelector("[data-app-slow-page]")
      const spinner = document.querySelector("[data-activity-spinner]")
      const bar = document.querySelector("[data-app-nav-progress]")
      const fixed = document.querySelector("[data-fixed-bar]")
      const s = scroller()
      const opacity = p ? Number(getComputedStyle(p).opacity) : null
      const slowOpacity = slow ? Number(getComputedStyle(slow).opacity) : 0
      window.__rec.push({
        t,
        page: p?.getAttribute("data-page") ?? null,
        opacity,
        /* What of the page the eye gets: its own opacity, under whatever the
           spinner's surface (the page's own colour) lets through. */
        seen: opacity == null ? null : opacity * (1 - slowOpacity),
        dy: p && s ? Math.round((p.getBoundingClientRect().top - s.getBoundingClientRect().top) * 10) / 10 : null,
        inner: p ? p.scrollTop : null,
        outline: !!outline,
        slow: slowOpacity > 0.01,
        slowOpacity,
        slowTransform: slow ? getComputedStyle(slow).transform + " " + getComputedStyle(slow).translate : null,
        spinnerShown: !!spinner && slowOpacity > 0.01,
        bar: !!bar && Number(getComputedStyle(bar).opacity) > 0.01,
        fixedTop: fixed ? Math.round(fixed.getBoundingClientRect().top) : null,
      })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const now = () => page.evaluate(() => performance.now())
  const since = (t0) => page.evaluate((t0) => ({ rec: window.__rec.filter((r) => r.t >= t0), long: window.__long.filter((l) => l.t >= t0) }), t0)

  /** Click a link with the server taking `delay`, and read every frame until it has landed. */
  async function go(to, delay, settle = 520, shot = null) {
    await page.evaluate((d) => { window.__delay = d }, delay)
    const t0 = await now()
    await page.evaluate((to) => document.querySelector(`a[data-to="${to}"]`).click(), to)
    if (shot && process.env.STAGE_SHOTS) { await wait(shot.at); await page.screenshot({ path: join(process.env.STAGE_SHOTS, `${label}-${shot.name}.png`) }); await wait(delay + settle - shot.at) } else await wait(delay + settle)
    return { t0, ...(await since(t0)) }
  }

  /** The landing, as seen: from the first frame the new page is there. */
  function landing(rec, id) {
    const at = rec.findIndex((r) => r.page === id)
    if (at < 0) return null
    const frames = rec.slice(at)
    const first = frames[0]
    const done = frames.find((r) => r.seen >= 0.999 && Math.abs(r.dy - frames[frames.length - 1].dy) < 0.1)
    let back = 0
    for (let k = 1; k < frames.length; k++) {
      if (frames[k].seen < frames[k - 1].seen - 0.001) back++
      if (frames[k].dy > frames[k - 1].dy + 0.1) back++
    }
    return {
      at: Math.round(first.t - rec[0].t),
      firstSeen: r2(first.seen),
      firstPageOpacity: r2(first.opacity),
      rise: Math.round((first.dy - frames[frames.length - 1].dy) * 10) / 10,
      ms: done ? Math.round(done.t - first.t) : null,
      back,
    }
  }

  /**
   * The spinner through one navigation from `oldId` to `newId`: when it is
   * first visible, how long its fade in takes, whether it stays up until the
   * page commits and goes after, and whether any frame before the commit
   * showed anything but the old page (under it or not): a blank frame.
   */
  function spinnerOf(nav, oldId, newId) {
    const commit = nav.rec.findIndex((r) => r.page === newId)
    const before = nav.rec.slice(0, commit < 0 ? nav.rec.length : commit)
    const after = commit < 0 ? [] : nav.rec.slice(commit)
    const first = before.findIndex((r) => r.slow)
    const full = first < 0 ? -1 : before.findIndex((r, k) => k >= first && r.slowOpacity >= 0.99)
    let dips = 0
    for (let k = Math.max(1, first + 1); first >= 0 && k < before.length; k++) if (before[k].slowOpacity < before[k - 1].slowOpacity - 0.001) dips++
    const gone = after.findIndex((r) => !r.slow)
    return {
      frames: nav.rec.filter((r) => r.slow).length,
      atMs: first < 0 ? null : Math.round(before[first].t - nav.t0),
      fadeInMs: full < 0 || first < 0 ? null : Math.round(before[full].t - before[first].t),
      opacityAtCommit: commit < 0 || !nav.rec[commit - 1] ? null : r2(nav.rec[commit - 1].slowOpacity),
      goneAfterCommitMs: commit < 0 || gone < 0 ? null : Math.round(after[gone].t - after[0].t),
      continuous: first < 0 ? null : before.slice(first).every((r) => r.slow),
      dipsBeforeCommit: dips,
      spinnerFrames: nav.rec.filter((r) => r.spinnerShown).length,
      blankFrames: before.filter((r) => r.page !== oldId).length,
      movedFrames: nav.rec.filter((r) => r.slowTransform && !/^none (none|0px 0px|0px)$/.test(r.slowTransform)).length,
    }
  }
  const outlineFrames = (nav) => nav.rec.filter((r) => r.outline).length
  const barAt = (nav) => { const b = nav.rec.find((r) => r.bar); return b ? Math.round(b.t - nav.t0) : null }

  const shiftBefore = await page.evaluate(() => window.__shift)
  const all = []

  /* A: fast */
  const fastMs = phone ? 40 : 80
  const fast = await go("/app/orders", fastMs); all.push(fast)
  const fastLanding = landing(fast.rec, "orders")
  const fastSpinner = spinnerOf(fast, "home", "orders")

  /* Scroll the orders page, for the way back. */
  await page.evaluate(() => { document.querySelector("[data-page]").scrollTop = 900 })
  await wait(120)

  /* B: medium. 400ms on a phone (under the spinner's wait), 600 on a computer (the bar, no spinner). */
  const mediumMs = phone ? 400 : 600
  const medium = await go("/app/analytics", mediumMs); all.push(medium)
  const mediumSpinner = spinnerOf(medium, "orders", "analytics")
  const mediumLanding = landing(medium.rec, "analytics")

  /* C: slow, 1600ms: the spinner at either width, fully up when the page lands. */
  const slow = await go("/app", 1600, 520, { at: 1350, name: "slow-spinner" }); all.push(slow)
  const slowSpinner = spinnerOf(slow, "analytics", "home")
  const slowLanding = landing(slow.rec, "home")

  /* E: back twice, to orders, which was scrolled to 900 */
  await page.evaluate(() => { window.__delay = 40 })
  let t0 = await now()
  await page.evaluate(() => history.back())
  await wait(500)
  t0 = await now()
  await page.evaluate(() => history.back())
  await wait(520)
  const back = await since(t0); back.t0 = t0; all.push(back)
  const backFirst = back.rec.find((r) => r.page === "orders")
  const backLanding = landing(back.rec, "orders")
  const backSpinner = back.rec.filter((r) => r.slow).length

  /* F: a page with a fixed bar showing */
  await page.evaluate(() => history.forward())
  await wait(300)
  await page.evaluate(() => history.forward())
  await wait(300)
  const fixed = await go("/app/fixed", 80); all.push(fixed)
  const fixedLanding = landing(fixed.rec, "fixed")
  const fixedTops = [...new Set(fixed.rec.filter((r) => r.fixedTop != null).map((r) => r.fixedTop))]

  /* D (phone): a page landing while the spinner is still fading in. */
  let edgeSpinner = null, edgeLanding = null
  if (phone) {
    const edge = await go("/app/orders", 580); all.push(edge)
    edgeSpinner = spinnerOf(edge, "fixed", "orders")
    edgeLanding = landing(edge.rec, "orders")
  }

  /* G: the page you are on, by its link and by a push: nothing at all. */
  await page.evaluate(() => { window.__delay = 1600 })
  let t1 = await now()
  await page.evaluate(() => document.querySelector(`a[data-to="${location.pathname}"]`).click())
  await page.evaluate(() => window.__startNav(location.pathname))
  await wait(1800)
  const same = await since(t1); same.t0 = t1; all.push(same)
  const sameBar = same.rec.filter((r) => r.bar).length
  const sameSpinner = same.rec.filter((r) => r.slow).length

  /* H: a second click while the first is on its way (and, on a phone, while the
     spinner is up): one spinner, not two fades, landing on the second page. */
  const beforeTwice = await page.evaluate(() => document.querySelector("[data-page]").getAttribute("data-page"))
  await page.evaluate(() => { window.__delay = 1600 })
  t1 = await now()
  await page.evaluate(() => document.querySelector('a[data-to="/app"]').click())
  await wait(phone ? 700 : 1150)
  await page.evaluate(() => { window.__delay = 500 })
  await page.evaluate(() => document.querySelector('a[data-to="/app/analytics"]').click())
  await wait(500 + 520)
  const twice = await since(t1); twice.t0 = t1; all.push(twice)
  const twiceSpinner = spinnerOf(twice, beforeTwice, "analytics")
  const twiceLanded = twice.rec[twice.rec.length - 1]?.page
  const twiceStrayOrders = twice.rec.filter((r) => r.page === "home").length

  /* I: the product editor, slow: no spinner at any width, the old page stays. */
  const editor = await go("/app/products/abc", phone ? 700 : 1600); all.push(editor)
  const editorSpinner = spinnerOf(editor, "analytics", "abc")

  const shift = Math.round(((await page.evaluate(() => window.__shift)) - shiftBefore) * 1000) / 1000
  const longs = all.flatMap((n) => n.long)
  const outlines = all.reduce((n, nav) => n + outlineFrames(nav), 0)
  await page.close()

  const r = {
    outlineFramesAnywhere: outlines,
    fast: { ms: fastMs, spinnerFrames: fastSpinner.frames, barFrames: fast.rec.filter((x) => x.bar).length, framesNotOldBeforeCommit: fastSpinner.blankFrames, landing: fastLanding },
    medium: { ms: mediumMs, barAtMs: barAt(medium), spinner: mediumSpinner, landing: mediumLanding },
    slow: { ms: 1600, barAtMs: barAt(slow), spinner: slowSpinner, landing: slowLanding },
    ...(phone ? { landsWhileFadingIn: { ms: 580, spinner: edgeSpinner, landing: edgeLanding } } : {}),
    back: { firstInnerScroll: backFirst?.inner ?? null, spinnerFrames: backSpinner, landing: backLanding },
    fixedPage: { landing: fixedLanding, fixedBarTops: fixedTops },
    samePage: { barFrames: sameBar, spinnerFrames: sameSpinner },
    secondClick: { spinner: twiceSpinner, landedOn: twiceLanded, framesOfTheReplacedPage: twiceStrayOrders },
    editor: { ms: phone ? 700 : 1600, spinner: editorSpinner, barAtMs: barAt(editor) },
    layoutShift: shift,
    longTasks: longs.length,
    errors,
  }
  report[label] = r
  const at = `at ${label}:`
  if (errors.length) problems.push(`${at} the page threw: ${errors[0]}`)
  if (outlines) problems.push(`${at} an outline of a page was drawn for ${outlines} frames`)
  if (fastSpinner.frames) problems.push(`${at} a fast navigation showed the spinner for ${fastSpinner.frames} frames`)
  if (r.fast.barFrames) problems.push(`${at} a fast navigation showed the bar for ${r.fast.barFrames} frames`)
  if (fastSpinner.blankFrames) problems.push(`${at} ${fastSpinner.blankFrames} frames before the commit showed something other than the old page`)
  const landings = [["fast", fastLanding], ["medium", mediumLanding], ["slow", slowLanding], ["back", backLanding]]
  if (phone) landings.push(["580ms", edgeLanding])
  for (const [name, l] of landings) {
    if (!l) { problems.push(`${at} the ${name} navigation never landed`); continue }
    if (l.firstSeen > 0.35) problems.push(`${at} the ${name} landing was first seen at ${l.firstSeen}: the page was painted before it faded`)
    if (l.rise < 3 || l.rise > 6) problems.push(`${at} the ${name} landing rose ${l.rise}px, not 4 to 6`)
    if (l.ms == null || l.ms < 120 || l.ms > 260) problems.push(`${at} the ${name} landing took ${l.ms}ms, not about 180`)
    if (l.back) problems.push(`${at} the ${name} landing went backwards ${l.back} times`)
  }
  for (const [name, s, oldId] of [["medium", mediumSpinner, "orders"], ["slow", slowSpinner, "analytics"], ...(phone ? [["580ms", edgeSpinner, "home"]] : [])]) {
    if (s.blankFrames) problems.push(`${at} ${s.blankFrames} frames of the ${name} navigation showed something other than ${oldId} before the commit`)
    if (s.frames && !s.continuous) problems.push(`${at} the ${name} navigation's spinner went away before the page came`)
    if (s.dipsBeforeCommit) problems.push(`${at} the ${name} navigation's spinner dimmed ${s.dipsBeforeCommit} times before the page came`)
    if (s.movedFrames) problems.push(`${at} the ${name} navigation's spinner surface moved: it should fade on opacity alone`)
    if (s.frames && (s.goneAfterCommitMs == null || s.goneAfterCommitMs > 260)) problems.push(`${at} the ${name} navigation's spinner was still up ${s.goneAfterCommitMs}ms after the page came`)
    if (s.frames && s.spinnerFrames === 0) problems.push(`${at} the ${name} navigation's surface came up with no spinner on it`)
  }
  /* A page that lands under the fully raised surface only rises: the surface's fade is its fade. */
  if (slowLanding && slowLanding.firstPageOpacity < 0.99) problems.push(`${at} under the spinner the page faded in as well (from ${slowLanding.firstPageOpacity}): two fades multiplied`)
  if (phone) {
    if (mediumSpinner.frames) problems.push(`${at} a 400ms navigation showed the spinner: it should wait 500`)
    if (r.medium.barAtMs != null) problems.push(`${at} a phone showed the bar on a page that gets the spinner`)
    if (r.slow.barAtMs != null) problems.push(`${at} a phone showed the bar as well as the spinner`)
    for (const [name, s] of [["1600ms", slowSpinner], ["580ms", edgeSpinner]]) {
      if (s.atMs == null || s.atMs < 490 || s.atMs > 560) problems.push(`${at} a ${name} navigation's spinner came at ${s.atMs}ms, not 500 to 560`)
    }
    if (slowSpinner.fadeInMs == null || slowSpinner.fadeInMs < 100 || slowSpinner.fadeInMs > 210) problems.push(`${at} the spinner faded in over ${slowSpinner.fadeInMs}ms, not about 150`)
  } else {
    if (r.medium.barAtMs == null || r.medium.barAtMs < 290) problems.push(`${at} the bar on a 600ms navigation came at ${r.medium.barAtMs}ms, it should wait 300`)
    if (mediumSpinner.frames) problems.push(`${at} a 600ms navigation showed the spinner`)
    if (slowSpinner.atMs == null || slowSpinner.atMs < 990 || slowSpinner.atMs > 1060) problems.push(`${at} a 1600ms navigation's spinner came at ${slowSpinner.atMs}ms, it should wait 1000`)
    if (slowSpinner.fadeInMs == null || slowSpinner.fadeInMs < 100 || slowSpinner.fadeInMs > 210) problems.push(`${at} the spinner faded in over ${slowSpinner.fadeInMs}ms, not about 150`)
  }
  if (!backFirst || Math.abs(backFirst.inner - 900) > 1) problems.push(`${at} back landed at scroll ${backFirst?.inner}, it was 900`)
  if (backSpinner) problems.push(`${at} back showed the spinner`)
  if (!fixedLanding || fixedLanding.rise !== 0) problems.push(`${at} a page with a fixed bar rose ${fixedLanding?.rise}px: the bar travelled with it`)
  if (fixedTops.length > 1) problems.push(`${at} the fixed bar moved during the landing: ${fixedTops.join(", ")}`)
  if (sameBar || sameSpinner) problems.push(`${at} pressing the page already showing drew the bar for ${sameBar} frames and the spinner for ${sameSpinner}`)
  if (!twiceSpinner.frames) problems.push(`${at} two slow clicks in a row never showed the spinner`)
  if (twiceSpinner.dipsBeforeCommit) problems.push(`${at} a second click faded the spinner ${twiceSpinner.dipsBeforeCommit} times before its page came`)
  if (twiceLanded !== "analytics" || twiceStrayOrders) problems.push(`${at} the second click landed on ${twiceLanded}, with ${twiceStrayOrders} frames of the replaced page`)
  if (editorSpinner.frames) problems.push(`${at} opening the product editor drew the spinner for ${editorSpinner.frames} frames`)
  if (editorSpinner.blankFrames) problems.push(`${at} ${editorSpinner.blankFrames} frames before the editor came showed something other than the old page`)
  if (r.editor.barAtMs == null || r.editor.barAtMs < 290) problems.push(`${at} opening a slow editor should still show the bar after 300ms (at ${r.editor.barAtMs})`)
  if (shift > 0) problems.push(`${at} layout shift ${shift}`)
  if (longs.length) problems.push(`${at} ${longs.length} long tasks`)
}

/* The spinner itself: eight spokes, light gray, turned in eighths every 100ms. */
{
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.goto(`${base}/app`)
  await wait(300)
  await page.evaluate(() => { window.__delay = 2400 })
  await page.evaluate(() => document.querySelector('a[data-to="/app/orders"]').click())
  await wait(900)
  const spin = await page.evaluate(async () => {
    const svg = document.querySelector("[data-activity-spinner]")
    const surface = document.querySelector("[data-app-slow-page]")
    /* Its layout box, not the turned drawing's bounds (28px across at 45 degrees). */
    const box = svg.parentElement.getBoundingClientRect()
    const area = surface.getBoundingClientRect()
    const angles = []
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      const m = new DOMMatrix(getComputedStyle(svg).transform)
      angles.push(Math.round(((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360))
    }
    return {
      spokes: svg.querySelectorAll("rect").length,
      opacities: [...svg.querySelectorAll("rect")].map((r) => Number(r.getAttribute("opacity"))),
      colour: getComputedStyle(svg).color,
      size: [Math.round(box.width), Math.round(box.height)],
      centredIn: {
        dx: Math.round(box.left + box.width / 2 - (area.left + area.width / 2)),
        dy: Math.round(box.top + box.height / 2 - (area.top + area.height / 2)),
      },
      surface: { top: Math.round(area.top), background: getComputedStyle(surface).backgroundColor, radius: getComputedStyle(surface).borderTopLeftRadius },
      animation: getComputedStyle(svg).animationName + " " + getComputedStyle(svg).animationDuration + " " + getComputedStyle(svg).animationTimingFunction,
      distinctAngles: [...new Set(angles)].sort((a, b) => a - b),
    }
  })
  if (process.env.STAGE_SHOTS) await page.screenshot({ path: join(process.env.STAGE_SHOTS, "spinner-390.png") })
  await page.close()
  report.spinner = spin
  if (spin.spokes !== 8) problems.push(`the spinner has ${spin.spokes} spokes, not 8`)
  if (spin.colour !== "rgb(156, 163, 175)") problems.push(`the spinner is ${spin.colour}, not the light gray #9ca3af`)
  if (spin.size[0] !== 20 || spin.size[1] !== 20) problems.push(`the spinner is ${spin.size.join("x")}, not 20x20`)
  if (Math.abs(spin.centredIn.dx) > 1 || Math.abs(spin.centredIn.dy) > 1) problems.push(`the spinner is ${spin.centredIn.dx}, ${spin.centredIn.dy} off the content area's centre`)
  if (spin.surface.top !== 68 || spin.surface.background !== "rgb(248, 249, 250)" || spin.surface.radius !== "20px") problems.push(`the surface is not the content area: ${JSON.stringify(spin.surface)}`)
  if (!/activity-spin 0\.8s steps\(8/.test(spin.animation)) problems.push(`the spinner turns on ${spin.animation}, not 800ms in eighths`)
  if (spin.distinctAngles.some((a) => a % 45 !== 0)) problems.push(`the spinner was caught between eighths: ${spin.distinctAngles.join(", ")}`)
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: no outline anywhere; a phone waits 500ms and a computer a second before the spinner; one fade in, one fade out; back keeps its place")
