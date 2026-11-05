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
 *   THE LANDING                           seen from 0 (the opacity of what
 *                                         lands, the page or what is in its
 *                                         own scroller, times what the
 *                                         spinner's surface lets through),
 *                                         a rise of 2px,
 *                                         about 180ms, never backwards
 *   ON A PHONE                            nothing under 500ms: no bar, no
 *                                         spinner; past it the spinner,
 *                                         faded in over about 150ms, the old
 *                                         page under it until the new one
 *   A LITTLE HIGHER                       "move that loading thing a little
 *                                         bit more up": its centre at 0.38 to
 *                                         0.42 of the content area's height
 *   QUICK TO GO, AND NO GAP               "doesn't stay so long ... no empty
 *                                         gap": gone within 150ms of the
 *                                         commit, and surface and page
 *                                         together cover every frame after
 *   ON A COMPUTER                         the bar from 300ms, the spinner
 *                                         only past 1000ms
 *   ONE SPINNER THROUGH TWO CLICKS        a second click while it is up does
 *                                         not fade it out and in again
 *   THE PAGE YOU ARE ON                   a click on it, or a push to it,
 *                                         shows no bar and no spinner
 *   BACK                                  the page's scroll is where it was on
 *                                         the first frame it shows
 *   A PAGE WITH A FIXED BAR               the bar fades and never moves
 *   THE PRODUCT EDITOR                    no spinner at any width
 *   NO LONG TASK, NO LAYOUT SHIFT
 *
 * "Make sure it never blocks, fully":
 *
 *   PRESSES GO THROUGH IT                 the surface takes none: the point
 *                                         under its middle is the page, a
 *                                         tap there reaches the page, the
 *                                         header's links stay on top, and a
 *                                         second tab replaces the navigation
 *   IT GIVES WAY                          a navigation that never answers
 *                                         loses the surface at 8s, logged
 *   IT NEVER OUTSTAYS THE PAGE            gone within a fade of: a new query
 *                                         on the same page, a redirect, a
 *                                         redirect back to the page showing,
 *                                         a page that throws, the not-found
 *                                         page, the page showing throwing
 *   A LINK THE PAGE HANDLES ITSELF        starts nothing: no bar, no spinner
 *
 * And the spinner itself: 26px, turning continuously (no frame repeated,
 * none jumping), slower but still turning under reduced motion.
 *
 * The real NavigationLoadingBar and AppStage, over a shell shaped like
 * app/(storelib)/app/layout.tsx (scripts/render-app-stage.tsx), served over http so the
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
writeFileSync(join(dir, "link.js"), `import { createElement } from "react"
export default function Link({ href, prefetch, replace, scroll, ...rest }) { return createElement("a", { href, ...rest }) }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-app-stage.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.js")}`,
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
  const warnings = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => { if (m.type() === "warn" || m.type() === "warning") warnings.push(m.text()) })
  await page.goto(`${base}/app`)
  await wait(400)
  await page.evaluate(() => {
    window.__rec = []
    window.__long = []
    window.__shift = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask" })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shift += e.value }).observe({ type: "layout-shift", buffered: false })
    const scroller = () => document.querySelector(".app-content-scroll")
    /* Each frame is read once it has been drawn, in a task right after it: a
       page's landing starts in a requestAnimationFrame callback of its own
       (components/app/app-stage.tsx), queued after this one and run before
       that frame's paint, so a reading taken in this callback would show the
       page as it was before its landing began, which is never on the glass. */
    const drawn = new MessageChannel()
    const frames = []
    drawn.port1.onmessage = () => { const t = frames.shift(); if (t != null) read(t) }
    const tick = (t) => {
      frames.push(t)
      drawn.port2.postMessage(0)
      requestAnimationFrame(tick)
    }
    const read = (t) => {
      const p = document.querySelector("[data-page]")
      const outline = document.querySelector("[data-app-route-skeleton]")
      const slow = document.querySelector("[data-app-slow-page]")
      const spinner = document.querySelector("[data-activity-spinner]")
      const bar = document.querySelector("[data-app-nav-progress]")
      const fixed = document.querySelector("[data-fixed-bar]")
      const s = scroller()
      /* What lands: the page, or for a page that scrolls in a box of its own,
         what is in that box. The box and its scrollbar stand still
         (components/app/app-stage.tsx ownScrollers). */
      const lands = p && /(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.firstElementChild ? p.firstElementChild : p
      const opacity = lands ? Number(getComputedStyle(lands).opacity) : null
      const slowOpacity = slow ? Number(getComputedStyle(slow).opacity) : 0
      window.__rec.push({
        t,
        page: p?.getAttribute("data-page") ?? null,
        opacity,
        /* What of the page the eye gets: its own opacity, under whatever the
           spinner's surface (the page's own colour) lets through. */
        seen: opacity == null ? null : opacity * (1 - slowOpacity),
        dy: lands && s ? Math.round((lands.getBoundingClientRect().top + (lands === p ? 0 : p.scrollTop) - s.getBoundingClientRect().top) * 10) / 10 : null,
        inner: p ? p.scrollTop : null,
        outline: !!outline,
        search: location.search,
        path: location.pathname,
        landedElsewhere: !p && !!document.querySelector(".app-content-scroll > *"),
        slow: slowOpacity > 0.01,
        slowOpacity,
        slowTransform: slow ? getComputedStyle(slow).transform + " " + getComputedStyle(slow).translate : null,
        spinnerShown: !!spinner && slowOpacity > 0.01,
        bar: !!bar && Number(getComputedStyle(bar).opacity) > 0.01,
        fixedTop: fixed ? Math.round(fixed.getBoundingClientRect().top) : null,
      })
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
    if (shot && process.env.STAGE_SHOTS) { await wait(shot.at); await page.screenshot({ path: join(process.env.STAGE_SHOTS, `loading-${label}-${shot.name}.png`) }); await wait(delay + settle - shot.at) } else await wait(delay + settle)
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
      /* How much of the screen is covered, surface or page, on the worst
         frame after the commit: the surface's own opacity plus what of the
         page shows through it. Under 1 is a frame of neither, the "empty
         gap" after the spinner. Read over the landing's first 300ms. */
      coverAfterCommit: commit < 0 ? null : r2(Math.min(...after.filter((r) => r.t - after[0].t <= 300).map((r) => Math.min(1, r.slowOpacity + (r.seen ?? 0))))),
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

  /* J: a slow page on its way, then a press on the page still showing. The
     router drops the first navigation, so nothing will ever commit: the
     record has to end on the press, or the spinner (and the wrong lit tab)
     sits there until the ten second give up. */
  const beforeReturn = await page.evaluate(() => location.pathname)
  await page.evaluate(() => { window.__delay = 1600 })
  t1 = await now()
  await page.evaluate(() => document.querySelector('a[data-to="/app/orders"]').click())
  await wait(200)
  await page.evaluate((p) => document.querySelector(`a[data-to="${p}"]`).click(), beforeReturn)
  await wait(1900)
  const returned = await since(t1); returned.t0 = t1; all.push(returned)
  const returnedSpinner = returned.rec.filter((r) => r.slow).length
  const returnedBar = returned.rec.filter((r) => r.bar && r.t - t1 > 400).length

  /* K: Back onto the page already showing (the email and OnePage editors push
     a guard entry at their own address): nothing commits, so nothing shows. */
  await page.evaluate(() => { window.__delay = 40; history.pushState(null, "", location.href) })
  await wait(100)
  t1 = await now()
  await page.evaluate(() => history.back())
  await wait(1500)
  const guard = await since(t1); guard.t0 = t1; all.push(guard)
  const guardSpinner = guard.rec.filter((r) => r.slow).length
  const guardBar = guard.rec.filter((r) => r.bar).length

  /* ── Never blocks ─────────────────────────────────────────────────────── */

  /** Frames since `t0` until the surface is gone for good, after the moment `endAt` (ms from t0). */
  const goneAfter = (nav, endAt) => {
    const after = nav.rec.filter((r) => r.t - nav.t0 >= endAt)
    const lastUp = [...after].reverse().find((r) => r.slow)
    return {
      shownFrames: nav.rec.filter((r) => r.slow).length,
      upAtEndMs: (() => { const r = nav.rec.find((x) => x.t - nav.t0 >= endAt - 20); return r ? r.slow : null })(),
      goneMsAfterEnd: lastUp ? Math.round(lastUp.t - nav.t0 - endAt) + 17 : 0,
      barFramesAfterEnd: after.filter((r) => r.bar && r.t - nav.t0 > endAt + 450).length,
    }
  }
  /* Onto a fresh Orders page (by way of Home, so a page that threw is left
     behind), with nothing on its way. */
  const settle = async () => {
    await page.evaluate(() => { window.__delay = 40 })
    await page.evaluate(() => document.querySelector('a[data-to="/app"]').click())
    await wait(400)
    await page.evaluate(() => document.querySelector('a[data-to="/app/orders"]').click())
    await wait(600)
  }
  const slowAt = phone ? 700 : 1200

  /* M: presses go through it, and a second tab replaces the navigation. */
  await settle()
  await page.evaluate(() => { window.__delay = 3000; window.__pagePresses = 0 })
  let t2 = await now()
  await page.evaluate(() => document.querySelector('a[data-to="/app/hang"]').click())
  await wait(slowAt)
  const through = await page.evaluate(() => {
    const slow = document.querySelector("[data-app-slow-page]")
    const surface = document.querySelector("[data-app-slow-surface]").getBoundingClientRect()
    const hit = document.elementFromPoint(surface.left + surface.width / 2, surface.top + surface.height / 2)
    const link = document.querySelector('a[data-to="/app/analytics"]').getBoundingClientRect()
    const linkHit = document.elementFromPoint(link.left + link.width / 2, link.top + link.height / 2)
    const button = document.querySelector("[data-page-button]").getBoundingClientRect()
    return {
      up: !!slow && Number(getComputedStyle(slow).opacity) > 0.99,
      pointerEvents: slow ? getComputedStyle(slow).pointerEvents : null,
      surfacePointerEvents: slow ? getComputedStyle(slow.firstElementChild).pointerEvents : null,
      middleIsThePage: !!hit?.closest("[data-page]"),
      linkIsTheLink: linkHit?.getAttribute("data-to") === "/app/analytics",
      /* Where the spinner sits in the surface, as a fraction of its height
         from the top: 0.5 was the middle, and "a little bit more up" is the
         optical middle, about 0.4. */
      spinnerAt: (() => {
        const sp = document.querySelector("[data-activity-spinner]").getBoundingClientRect()
        return { y: Math.round(((sp.top + sp.height / 2 - surface.top) / surface.height) * 1000) / 1000, dx: Math.round(sp.left + sp.width / 2 - (surface.left + surface.width / 2)), fromTop: Math.round(sp.top + sp.height / 2 - surface.top) }
      })(),
      button: { x: button.left + button.width / 2, y: button.top + button.height / 2 },
    }
  })
  if (phone) await page.touchscreen.tap(through.button.x, through.button.y)
  else await page.mouse.click(through.button.x, through.button.y)
  await wait(60)
  through.pressReachedThePage = (await page.evaluate(() => window.__pagePresses)) === 1
  await page.evaluate(() => { window.__delay = 300 })
  const secondAt = Math.round((await now()) - t2)
  await page.evaluate(() => document.querySelector('a[data-to="/app/analytics"]').click())
  await wait(300 + 520)
  const second = await since(t2); second.t0 = t2; all.push(second)
  const secondLanded = second.rec[second.rec.length - 1]?.page
  const secondGone = goneAfter(second, secondAt + 300)

  /* N: every way a navigation can end, each with the surface up first. */
  const ends = {}
  for (const [name, href] of [
    ["sameQuery", "/app/orders?view=open"],
    ["redirect", "/app/redirect"],
    ["redirectBack", "/app/same"],
    ["pageThrew", "/app/boom"],
    ["notFound", "/app/missing"],
  ]) {
    await settle()
    await page.evaluate(() => { window.__delay = 1600 })
    const t = await now()
    await page.evaluate((href) => document.querySelector(`a[data-to="${href}"]`).click(), href)
    await wait(1600 + 700)
    const nav = await since(t); nav.t0 = t; all.push(nav)
    ends[name] = { ...goneAfter(nav, 1600), landedOn: nav.rec[nav.rec.length - 1]?.path + nav.rec[nav.rec.length - 1]?.search }
  }
  /* The page showing throws while a navigation that will never answer is on its way. */
  await settle()
  await page.evaluate(() => { window.__delay = 1600 })
  let t3 = await now()
  await page.evaluate(() => document.querySelector('a[data-to="/app/hang"]').click())
  await wait(1200)
  const throwAt = Math.round((await now()) - t3)
  await page.evaluate(() => window.__throwHere())
  await wait(900)
  const threw = await since(t3); threw.t0 = t3; all.push(threw)
  ends.pageShowingThrew = goneAfter(threw, throwAt)

  /* O: a navigation that never answers: the surface gives way at 8s. */
  await settle()
  const warnsBefore = warnings.length
  t3 = await now()
  await page.evaluate(() => document.querySelector('a[data-to="/app/hang"]').click())
  await wait(8800)
  const hung = await since(t3); hung.t0 = t3; all.push(hung)
  const capGone = goneAfter(hung, 8000)
  const firstUp = hung.rec.find((r) => r.slow)
  const cap = {
    upAtMs: firstUp ? Math.round(firstUp.t - t3) : null,
    upAt7900: !!hung.rec.find((r) => r.t - t3 >= 7880)?.slow,
    goneMsAfter8s: capGone.goneMsAfterEnd,
    pageUnder: hung.rec[hung.rec.length - 1]?.page,
    logged: warnings.slice(warnsBefore).some((w) => /has not arrived after 8000ms/.test(w)),
  }

  /* P: a link the page handles itself starts nothing. */
  await settle()
  t3 = await now()
  await page.evaluate(() => document.querySelector("a[data-handled]").click())
  await wait(1600)
  const handled = await since(t3); handled.t0 = t3; all.push(handled)
  const handledFrames = { bar: handled.rec.filter((r) => r.bar).length, spinner: handled.rec.filter((r) => r.slow).length }

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
    backToTheShowingPage: { spinnerFrames: returnedSpinner, barFramesAfter400ms: returnedBar },
    backOntoAGuardEntry: { spinnerFrames: guardSpinner, barFrames: guardBar },
    pressesGoThrough: { ...through, button: undefined, secondTabLandedOn: secondLanded, goneAfterSecondTab: secondGone },
    endings: ends,
    cap,
    handledLink: handledFrames,
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
    /* NAV_ENTER_RISE_PX (lib/ui/app-navigation.ts): 2px since the landing was made quieter. */
    if (l.rise < 1.5 || l.rise > 2.5) problems.push(`${at} the ${name} landing rose ${l.rise}px, not 2`)
    if (l.ms == null || l.ms < 120 || l.ms > 260) problems.push(`${at} the ${name} landing took ${l.ms}ms, not about 180`)
    if (l.back) problems.push(`${at} the ${name} landing went backwards ${l.back} times`)
  }
  for (const [name, s, oldId] of [["medium", mediumSpinner, "orders"], ["slow", slowSpinner, "analytics"], ...(phone ? [["580ms", edgeSpinner, "home"]] : [])]) {
    if (s.blankFrames) problems.push(`${at} ${s.blankFrames} frames of the ${name} navigation showed something other than ${oldId} before the commit`)
    if (s.frames && !s.continuous) problems.push(`${at} the ${name} navigation's spinner went away before the page came`)
    if (s.dipsBeforeCommit) problems.push(`${at} the ${name} navigation's spinner dimmed ${s.dipsBeforeCommit} times before the page came`)
    if (s.movedFrames) problems.push(`${at} the ${name} navigation's spinner surface moved: it should fade on opacity alone`)
    if (s.frames && (s.goneAfterCommitMs == null || s.goneAfterCommitMs > 150)) problems.push(`${at} the ${name} navigation's spinner was still up ${s.goneAfterCommitMs}ms after the page came: it should be gone within about 120ms`)
    if (s.frames && s.spinnerFrames === 0) problems.push(`${at} the ${name} navigation's surface came up with no spinner on it`)
  }
  /* "After it ends there is no empty gap": under a fully raised surface the
     page is whole on the commit frame, so surface and page cover the screen
     between them on every frame. */
  if (slowSpinner.coverAfterCommit == null || slowSpinner.coverAfterCommit < 0.98) problems.push(`${at} after the slow page came, a frame showed only ${slowSpinner.coverAfterCommit} of surface and page together: an empty gap`)
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
  /* The bar is what must not travel (fixedTops, below). Where it sits straight
     in a page that scrolls in a box of its own, what lands is that box's
     content, which rises beside the bar while the bar only fades. */
  if (!fixedLanding) problems.push(`${at} the page with a fixed bar never landed`)
  if (fixedTops.length > 1) problems.push(`${at} the fixed bar moved during the landing: ${fixedTops.join(", ")}`)
  if (sameBar || sameSpinner) problems.push(`${at} pressing the page already showing drew the bar for ${sameBar} frames and the spinner for ${sameSpinner}`)
  if (!twiceSpinner.frames) problems.push(`${at} two slow clicks in a row never showed the spinner`)
  if (twiceSpinner.dipsBeforeCommit) problems.push(`${at} a second click faded the spinner ${twiceSpinner.dipsBeforeCommit} times before its page came`)
  if (twiceLanded !== "analytics" || twiceStrayOrders) problems.push(`${at} the second click landed on ${twiceLanded}, with ${twiceStrayOrders} frames of the replaced page`)
  if (editorSpinner.frames) problems.push(`${at} opening the product editor drew the spinner for ${editorSpinner.frames} frames`)
  if (editorSpinner.blankFrames) problems.push(`${at} ${editorSpinner.blankFrames} frames before the editor came showed something other than the old page`)
  if (r.editor.barAtMs == null || r.editor.barAtMs < 290) problems.push(`${at} opening a slow editor should still show the bar after 300ms (at ${r.editor.barAtMs})`)
  if (returnedSpinner || returnedBar) problems.push(`${at} pressing the showing page while another was on its way left the spinner for ${returnedSpinner} frames and the bar for ${returnedBar}`)
  if (guardSpinner || guardBar) problems.push(`${at} Back onto a guard entry at the same address drew the spinner for ${guardSpinner} frames and the bar for ${guardBar}`)
  if (!through.up) problems.push(`${at} the surface was not up for the press-through check`)
  if (through.spinnerAt.y < 0.38 || through.spinnerAt.y > 0.42 || Math.abs(through.spinnerAt.dx) > 1) problems.push(`${at} the spinner sits at ${through.spinnerAt.y} of the surface's height (${through.spinnerAt.dx}px off centre across): it belongs at 0.38 to 0.42`)
  if (through.pointerEvents !== "none") problems.push(`${at} the surface takes presses (pointer-events ${through.pointerEvents})`)
  if (!through.middleIsThePage) problems.push(`${at} the point under the surface's middle is not the page`)
  if (!through.linkIsTheLink) problems.push(`${at} the header's link is not what is under the finger while the surface is up`)
  if (!through.pressReachedThePage) problems.push(`${at} a tap on the surface did not reach the page under it`)
  if (secondLanded !== "analytics") problems.push(`${at} a second tab while the surface was up landed on ${secondLanded}`)
  if (secondGone.goneMsAfterEnd > 260) problems.push(`${at} after the second tab's page came the surface stayed ${secondGone.goneMsAfterEnd}ms`)
  for (const [name, e] of Object.entries(ends)) {
    if (!e.shownFrames) problems.push(`${at} ${name}: the surface never came up, so its going proves nothing`)
    if (e.goneMsAfterEnd > 260) problems.push(`${at} ${name}: the surface stayed ${e.goneMsAfterEnd}ms after the navigation ended`)
    if (e.barFramesAfterEnd) problems.push(`${at} ${name}: the bar stayed ${e.barFramesAfterEnd} frames after the navigation ended`)
  }
  if (ends.sameQuery && ends.sameQuery.landedOn !== "/app/orders?view=open") problems.push(`${at} the query change landed on ${ends.sameQuery.landedOn}`)
  if (ends.redirect && ends.redirect.landedOn !== "/app/analytics") problems.push(`${at} the redirect landed on ${ends.redirect.landedOn}`)
  if (!cap.upAt7900) problems.push(`${at} a navigation that never answered lost its spinner before 8s`)
  if (cap.goneMsAfter8s > 260) problems.push(`${at} the surface stayed ${cap.goneMsAfter8s}ms past the 8s cap`)
  if (!cap.logged) problems.push(`${at} the cap did not log`)
  if (handledFrames.bar || handledFrames.spinner) problems.push(`${at} a link the page handled itself drew the bar for ${handledFrames.bar} frames and the spinner for ${handledFrames.spinner}`)
  if (shift > 0) problems.push(`${at} layout shift ${shift}`)
  if (longs.length) problems.push(`${at} ${longs.length} long tasks`)
}

/* The spinner itself: eight spokes, light gray, 26px, turning continuously. */
{
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.goto(`${base}/app`)
  await wait(300)
  await page.evaluate(() => { window.__delay = 4000 })
  await page.evaluate(() => document.querySelector('a[data-to="/app/orders"]').click())
  await wait(900)
  /* Every frame for two seconds: the angle, and how far it moved since the last. */
  const readTurn = () => page.evaluate(async () => {
    const box = document.querySelector("[data-activity-spinner]")
    const angles = []
    let last = performance.now()
    const gaps = []
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      const t = performance.now()
      gaps.push(t - last)
      last = t
      const m = new DOMMatrix(getComputedStyle(box).transform)
      angles.push(((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360)
    }
    return { angles, gaps }
  })
  const turn = await readTurn()
  const deltas = turn.angles.slice(1).map((a, k) => (a - turn.angles[k] + 360) % 360)
  const sorted = [...deltas].sort((x, y) => x - y)
  const median = sorted[Math.floor(sorted.length / 2)]
  const frameMs = [...turn.gaps.slice(1)].sort((x, y) => x - y)[Math.floor(turn.gaps.length / 2)]
  const smooth = {
    frames: turn.angles.length,
    medianFrameMs: Math.round(frameMs * 10) / 10,
    medianStepDeg: Math.round(median * 100) / 100,
    maxStepDeg: Math.round(sorted[sorted.length - 1] * 100) / 100,
    degPerSecond: Math.round((median / frameMs) * 1000),
    repeatedFrames: deltas.filter((d) => d < 0.01).length,
    /* A step more than twice what one frame of this frame rate should turn:
       the drawing jumped. Frames the browser itself dropped are counted apart. */
    jumps: deltas.filter((d, k) => d > 2 * (360 / 1000) * Math.max(frameMs, 1) && turn.gaps[k + 1] < 1.5 * frameMs).length,
    droppedFrames: turn.gaps.slice(1).filter((g) => g > 1.5 * frameMs).length,
  }
  const spin = await page.evaluate(async () => {
    const box = document.querySelector("[data-activity-spinner]")
    const svg = box.querySelector("svg")
    const surface = document.querySelector("[data-app-slow-surface]")
    const r = box.getBoundingClientRect()
    /* Its layout box, not the turned drawing's bounds. */
    const size = [box.offsetWidth, box.offsetHeight]
    const area = surface.getBoundingClientRect()
    return {
      spokes: svg.querySelectorAll("rect").length,
      opacities: [...svg.querySelectorAll("rect")].map((x) => Number(x.getAttribute("opacity"))),
      colour: getComputedStyle(svg).color,
      size,
      drawn: [svg.width.baseVal.value, svg.height.baseVal.value],
      centredIn: {
        dx: Math.round(r.left + r.width / 2 - (area.left + area.width / 2)),
        dy: Math.round(r.top + r.height / 2 - (area.top + area.height / 2)),
        y: Math.round(((r.top + r.height / 2 - area.top) / area.height) * 1000) / 1000,
      },
      surface: { top: Math.round(area.top), background: getComputedStyle(surface).backgroundColor, radius: getComputedStyle(surface).borderTopLeftRadius, corner: getComputedStyle(document.documentElement).getPropertyValue("--app-top-corner").trim() },
      animation: getComputedStyle(box).animationName + " " + getComputedStyle(box).animationDuration + " " + getComputedStyle(box).animationTimingFunction,
      willChange: getComputedStyle(box).willChange,
      tag: box.tagName,
    }
  })
  spin.smooth = smooth
  if (process.env.STAGE_SHOTS) await page.screenshot({ path: join(process.env.STAGE_SHOTS, "loading-spinner-390.png") })
  /* THE CORNERS, AS PIXELS. Leaving Home, whose top is the violet bar, the
     two rounded corners of the surface must show the header's #111111, not
     the page under them. Read 3px in from each side, 3px below the header. */
  const corners = await (async () => {
    const png = await page.screenshot({ clip: { x: 0, y: 68, width: 390, height: 12 }, encoding: "base64" })
    return page.evaluate(async (b64) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = img.width
      c.height = img.height
      const g = c.getContext("2d")
      g.drawImage(img, 0, 0)
      const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3))
      /* deviceScaleFactor 3: 3 css px in is 9 device px. */
      return { left: at(9, 9), right: at(c.width - 10, 9), middle: at(Math.round(c.width / 2), 9), violetOnPage: !!document.querySelector("[data-violet-bar]") }
    }, png)
  })()
  /* Reduced motion: slower, still turning. */
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  spin.reduced = await page.evaluate(async () => {
    const box = document.querySelector("[data-activity-spinner]")
    const angle = () => { const m = new DOMMatrix(getComputedStyle(box).transform); return ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360 }
    const a = angle()
    await new Promise((r) => setTimeout(r, 250))
    const b = angle()
    return { name: getComputedStyle(box).animationName, duration: getComputedStyle(box).animationDuration, moved: Math.round(((b - a + 360) % 360) * 10) / 10 }
  })
  await page.close()
  report.spinner = spin
  report.corners = corners
  const isHeader = (p) => p.every((v, k) => Math.abs(v - [17, 17, 17][k]) <= 3)
  if (!corners.violetOnPage) problems.push("the corner check ran with no violet bar on the page under the surface: it proves nothing")
  if (!isHeader(corners.left) || !isHeader(corners.right)) problems.push(`the surface's corners show ${JSON.stringify([corners.left, corners.right])}, not the header's #111111: the page under them shows through`)
  if (isHeader(corners.middle)) problems.push(`the surface's top middle is the header colour ${JSON.stringify(corners.middle)}: the surface is not there`)
  if (spin.spokes !== 8) problems.push(`the spinner has ${spin.spokes} spokes, not 8`)
  if (spin.colour !== "rgb(156, 163, 175)") problems.push(`the spinner is ${spin.colour}, not the light gray #9ca3af`)
  if (spin.size[0] !== 26 || spin.size[1] !== 26 || spin.drawn[0] !== 26) problems.push(`the spinner is ${spin.size.join("x")} (drawn ${spin.drawn.join("x")}), not 26x26`)
  if (Math.abs(spin.centredIn.dx) > 1 || spin.centredIn.y < 0.38 || spin.centredIn.y > 0.42) problems.push(`the spinner is ${spin.centredIn.dx}px off centre across and at ${spin.centredIn.y} of the height, not 0.38 to 0.42`)
  if (spin.surface.top !== 68 || spin.surface.background !== "rgb(248, 249, 250)" || spin.surface.radius !== spin.surface.corner) problems.push(`the surface is not the content area: ${JSON.stringify(spin.surface)}`)
  if (!/^activity-spin 1s linear$/.test(spin.animation)) problems.push(`the spinner turns on ${spin.animation}, not one turn a second, linear`)
  if (spin.tag !== "SPAN" || spin.willChange !== "transform") problems.push(`the turn is on a ${spin.tag} with will-change ${spin.willChange}, not an HTML box on its own layer`)
  if (smooth.repeatedFrames > 2) problems.push(`the spinner held still for ${smooth.repeatedFrames} of ${smooth.frames} frames`)
  if (smooth.jumps > 2) problems.push(`the spinner jumped ${smooth.jumps} times in ${smooth.frames} frames`)
  if (Math.abs(smooth.degPerSecond - 360) > 40) problems.push(`the spinner turns ${smooth.degPerSecond} degrees a second, not 360`)
  if (spin.reduced.duration !== "3s" || spin.reduced.name !== "activity-spin" || spin.reduced.moved < 20) problems.push(`under reduced motion the spinner is ${JSON.stringify(spin.reduced)}: it should turn at a third of the speed, never stop`)
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: no outline anywhere; a phone waits 500ms and a computer a second before the spinner; it sits 40% of the way down; one fade in, one quick fade out with no gap after it; back keeps its place; presses go through it, it gives way at 8s and never outstays the page; the spinner is 26px and turns without a repeated or jumping frame")
