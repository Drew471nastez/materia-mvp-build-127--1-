/**
 * ===========================================================================
 *  HOW AN /app PAGE ARRIVES, MEASURED EVERY FRAME, AT 390 AND 1440
 * ===========================================================================
 * "Skeleton loading is not needed on normal navigation; only if a page takes
 * extremely long. When I click a page in the sidebar it should load and
 * appear with the content already there, with a smooth, clean, subtle,
 * normal animation when landing on the page. Same when going back."
 *
 * Every claim in that is a claim about frames, so this records one reading
 * per animation frame (which page is showing, its opacity and where it sits,
 * whether the bar or an outline is up) through navigations whose server
 * takes 80ms, 600ms and 1600ms, and a back:
 *
 *   A FAST PAGE SHOWS NOTHING BUT ITSELF  no frame with an outline, no frame
 *                                         with the bar, and the old page on
 *                                         screen until the new one commits
 *   THE LANDING                           opacity from 0 and a rise of 4 to
 *                                         6px, done in about 180ms, never
 *                                         backwards, no layout shift
 *   A SLOWER ONE GETS THE BAR             not before 300ms, and no outline
 *   A SLOW ONE GETS THE OUTLINE           not before 1000ms, and the old page
 *                                         stays under it until the new one
 *   BACK                                  the page's scroll is where it was on
 *                                         the first frame it shows, the same
 *                                         landing, no outline
 *   A PAGE WITH A FIXED BAR               fades without the rise, so the bar
 *                                         does not travel with it
 *   NO LONG TASK                          nothing over 50ms while any of it runs
 *
 * The real NavigationLoadingBar and AppStage, over a shell shaped like
 * app/app/layout.tsx (scripts/render-app-stage.tsx), served over http so the
 * history is the browser's own.
 *
 *   node scripts/check-app-stage.mjs
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

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
]) {
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
      const sk = document.querySelector("[data-app-route-skeleton]")
      const bar = document.querySelector("[data-app-nav-progress]")
      const fixed = document.querySelector("[data-fixed-bar]")
      const s = scroller()
      window.__rec.push({
        t,
        page: p?.getAttribute("data-page") ?? null,
        opacity: p ? Number(getComputedStyle(p).opacity) : null,
        dy: p && s ? Math.round((p.getBoundingClientRect().top - s.getBoundingClientRect().top) * 10) / 10 : null,
        inner: p ? p.scrollTop : null,
        skeleton: !!sk && Number(getComputedStyle(sk).opacity) > 0.01,
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
    await page.click(`a[data-to="${to}"]`)
    if (shot && process.env.STAGE_SHOTS) { await wait(shot.at); await page.screenshot({ path: join(process.env.STAGE_SHOTS, `${label}-${shot.name}.png`) }); await wait(delay + settle - shot.at) } else await wait(delay + settle)
    return { t0, ...(await since(t0)) }
  }

  /** The landing: from the first frame the new page shows. */
  function landing(rec, id) {
    const at = rec.findIndex((r) => r.page === id)
    if (at < 0) return null
    const frames = rec.slice(at)
    const first = frames[0]
    const done = frames.find((r) => r.opacity >= 0.999 && Math.abs(r.dy - frames[frames.length - 1].dy) < 0.1)
    let back = 0
    for (let k = 1; k < frames.length; k++) {
      if (frames[k].opacity < frames[k - 1].opacity - 0.001) back++
      if (frames[k].dy > frames[k - 1].dy + 0.1) back++
    }
    return {
      at: Math.round(first.t - rec[0].t),
      firstOpacity: Math.round(first.opacity * 100) / 100,
      rise: Math.round((first.dy - frames[frames.length - 1].dy) * 10) / 10,
      ms: done ? Math.round(done.t - first.t) : null,
      back,
    }
  }

  const shiftBefore = await page.evaluate(() => window.__shift)
  /* A: fast */
  const fast = await go("/app/orders", 80)
  const fastLanding = landing(fast.rec, "orders")
  const fastSkeleton = fast.rec.filter((r) => r.skeleton).length
  const fastBar = fast.rec.filter((r) => r.bar).length
  const oldUntil = fast.rec.findIndex((r) => r.page === "orders")
  const blankBefore = fast.rec.slice(0, Math.max(0, oldUntil)).filter((r) => r.page !== "home").length

  /* Scroll the orders page, for the way back. */
  await page.evaluate(() => { document.querySelector("[data-page]").scrollTop = 900 })
  await wait(120)

  /* B: medium */
  const medium = await go("/app/analytics", 600)
  const mediumBarAt = medium.rec.find((r) => r.bar)
  const mediumSkeleton = medium.rec.filter((r) => r.skeleton).length

  /* C: slow */
  const slow = await go("/app", 1600, 520, { at: 1350, name: "slow-outline" })
  const slowSkeletonAt = slow.rec.find((r) => r.skeleton)
  const slowCommit = slow.rec.findIndex((r) => r.page === "home")
  const underOutline = slow.rec.slice(0, Math.max(0, slowCommit)).every((r) => r.page === "analytics")
  const slowLanding = landing(slow.rec, "home")

  /* D: back twice, to orders, which was scrolled to 900 */
  await page.evaluate(() => { window.__delay = 40 })
  let t0 = await now()
  await page.evaluate(() => history.back())
  await wait(500)
  t0 = await now()
  await page.evaluate(() => history.back())
  await wait(520)
  const back = await since(t0)
  const backFirst = back.rec.find((r) => r.page === "orders")
  const backLanding = landing(back.rec, "orders")
  const backSkeleton = back.rec.filter((r) => r.skeleton).length

  /* E: a page with a fixed bar showing */
  await page.evaluate(() => history.forward())
  await wait(300)
  await page.evaluate(() => history.forward())
  await wait(300)
  const fixed = await go("/app/fixed", 80)
  const fixedLanding = landing(fixed.rec, "fixed")
  const fixedTops = [...new Set(fixed.rec.filter((r) => r.fixedTop != null).map((r) => r.fixedTop))]

  const shift = Math.round(((await page.evaluate(() => window.__shift)) - shiftBefore) * 1000) / 1000
  const longs = [...fast.long, ...medium.long, ...slow.long, ...back.long, ...fixed.long]
  await page.close()

  const r = {
    fast: { skeletonFrames: fastSkeleton, barFrames: fastBar, framesNotOldBeforeCommit: blankBefore, landing: fastLanding },
    medium: { barAtMs: mediumBarAt ? Math.round(mediumBarAt.t - medium.t0) : null, skeletonFrames: mediumSkeleton },
    slow: { skeletonAtMs: slowSkeletonAt ? Math.round(slowSkeletonAt.t - slow.t0) : null, oldPageUnderOutline: underOutline, landing: slowLanding },
    back: { firstInnerScroll: backFirst?.inner ?? null, skeletonFrames: backSkeleton, landing: backLanding },
    fixedPage: { landing: fixedLanding, fixedBarTops: fixedTops },
    layoutShift: shift,
    longTasks: longs.length,
    errors,
  }
  report[label] = r
  const at = `at ${label}:`
  if (errors.length) problems.push(`${at} the page threw: ${errors[0]}`)
  if (fastSkeleton) problems.push(`${at} a fast navigation showed the outline for ${fastSkeleton} frames`)
  if (fastBar) problems.push(`${at} a fast navigation showed the bar for ${fastBar} frames`)
  if (blankBefore) problems.push(`${at} ${blankBefore} frames before the commit showed something other than the old page`)
  for (const [name, l] of [["fast", fastLanding], ["slow", slowLanding], ["back", backLanding]]) {
    if (!l) { problems.push(`${at} the ${name} navigation never landed`); continue }
    if (l.firstOpacity > 0.35) problems.push(`${at} the ${name} landing started at opacity ${l.firstOpacity}: the page was painted before it faded`)
    if (l.rise < 3 || l.rise > 6) problems.push(`${at} the ${name} landing rose ${l.rise}px, not 4 to 6`)
    if (l.ms == null || l.ms < 120 || l.ms > 260) problems.push(`${at} the ${name} landing took ${l.ms}ms, not about 180`)
    if (l.back) problems.push(`${at} the ${name} landing went backwards ${l.back} times`)
  }
  if (!mediumBarAt || mediumBarAt.t - medium.t0 < 290) problems.push(`${at} the bar on a 600ms navigation came at ${r.medium.barAtMs}ms, it should wait 300`)
  if (mediumSkeleton) problems.push(`${at} a 600ms navigation showed the outline`)
  if (!slowSkeletonAt || slowSkeletonAt.t - slow.t0 < 990) problems.push(`${at} a 1600ms navigation's outline came at ${r.slow.skeletonAtMs}ms, it should wait 1000`)
  if (!underOutline) problems.push(`${at} the old page left before the new one committed`)
  if (!backFirst || Math.abs(backFirst.inner - 900) > 1) problems.push(`${at} back landed at scroll ${backFirst?.inner}, it was 900`)
  if (backSkeleton) problems.push(`${at} back showed the outline`)
  if (!fixedLanding || fixedLanding.rise !== 0) problems.push(`${at} a page with a fixed bar rose ${fixedLanding?.rise}px: the bar travelled with it`)
  if (fixedTops.length > 1) problems.push(`${at} the fixed bar moved during the landing: ${fixedTops.join(", ")}`)
  if (shift > 0) problems.push(`${at} layout shift ${shift}`)
  if (longs.length) problems.push(`${at} ${longs.length} long tasks`)
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: a fast page lands with nothing in front of it, a slow one gets the bar then its outline, back keeps its place")
