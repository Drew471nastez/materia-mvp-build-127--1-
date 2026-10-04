/**
 * ===========================================================================
 *  EXPLORE'S PILLS ON A SLOW PHONE, BEFORE AND AFTER
 * ===========================================================================
 * Round 10, item 11: "products and communities appear fast; cache per pill,
 * prefetch the next likely pills on idle, keep the previous grid while the
 * next loads, no long skeletons". This draws the real ExplorePageClient
 * (scripts/render-explore-speed.tsx) at 390x844 with the CPU slowed four
 * times and the network at DevTools' Slow 3G (2s round trip, 50kB/s), the
 * communities route answered by a small local server so the throttling
 * applies to every pill's request, and times what a visitor waits for:
 *
 *   PRESSED   the tap (click, as the finger lifts) until the pill is drawn
 *             pressed
 *   CONTENT   pointerdown until the grid shows the new pill's list, with
 *             nothing pending
 *   SKELETON  whether grey placeholder cards were on screen on the way
 *
 * for products mode (Design, Business, Design) and communities mode (the
 * pill beside All after the page sat idle, a far pill nobody warmed, a pill
 * seen before, then the far pill's neighbour). Taps are real presses: the
 * mouse is held 90ms, as a finger is.
 *
 * BASE=<git ref> also builds the same page from that commit's sources (a
 * `git archive` into the probe's dot directory) and prints both, so the
 * numbers are a before and an after on the same machine in the same run.
 *
 *   PROBE_CSS=source node scripts/check-explore-speed.mjs
 *   PROBE_CSS=source BASE=HEAD node scripts/check-explore-speed.mjs
 */
import { execFileSync, execSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dir = join(root, ".explore-speed-probe")
mkdirSync(dir, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/explore"
const router = { push() {}, replace(h) { history.replaceState(null, "", h) }, prefetch() {}, back() {}, refresh() {} }
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(window.__search || location.search.slice(1))
export const useParams = () => ({})
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, className, style, ...rest }) {
  return React.createElement("img", { src, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`)

function bundle(srcRoot, out) {
  execFileSync("npx", [
    "esbuild", join(root, "scripts/render-explore-speed.tsx"), "--bundle", "--format=iife", "--jsx=automatic", "--minify",
    '--define:process.env.NODE_ENV="production"', `--alias:@=${srcRoot}`,
    "--banner:js=var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;",
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
    `--outfile=${out}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
}

const builds = []
if (process.env.BASE) {
  const base = join(dir, "base")
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base, { recursive: true })
  execSync(`git archive ${process.env.BASE} app components hooks lib services styles | tar -x -C ${base}`, { cwd: root })
  bundle(base, join(dir, "before.js"))
  builds.push(["before", join(dir, "before.js")])
}
bundle(root, join(dir, "after.js"))
builds.push(["after", join(dir, "after.js")])

/* The route, from the same fixture the page draws. */
execFileSync("npx", ["esbuild", join(root, "scripts/explore-speed-fixture.ts"), "--format=esm", `--outfile=${join(dir, "fixture.mjs")}`, "--log-level=error"], { cwd: root, stdio: "inherit" })
const { COMMUNITIES } = await import(join(dir, "fixture.mjs"))
const css = await appCss(root)
const pages = {}
for (const [label, file] of builds) {
  pages[label] = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script src="/${label}.js"></script></body></html>`
}
let asked = []
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/api/explore/communities") {
    asked.push(url.search)
    let items = COMMUNITIES
    if (url.searchParams.get("c")) items = items.filter((c) => c.category === url.searchParams.get("c"))
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    return res.end(JSON.stringify({ items: items.slice(0, 24), next: null }))
  }
  const m = url.pathname.match(/^\/(before|after)\.js$/)
  if (m) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(readFileSync(join(dir, `${m[1]}.js`))) }
  const label = url.searchParams.get("v") || "after"
  res.writeHead(200, { "content-type": "text/html" })
  res.end(pages[label])
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: false, deviceScaleFactor: 2 }

/* Armed before the press: times the pill and the grid from pointerdown, frame by frame. */
const ARM = (label, communities) => `(() => {
  const pill = [...document.querySelectorAll("[data-category-pills-row] > button")].find((b) => b.textContent.includes(${JSON.stringify(label)}))
  const grid = () => document.querySelector(${communities ? '"[data-communities-results]"' : '"[data-category-pills-row]"'}) && document.querySelector(${communities ? '"[data-explore-community-grid], [data-communities-empty]"' : '"[data-product-card]"'})
  const text = () => ${communities ? '[...document.querySelectorAll("[data-community-card]")].slice(0, 3).map((c) => c.getAttribute("data-community-card")).join()' : '[...document.querySelectorAll("[data-product-card]")].slice(0, 3).map((c) => c.textContent.slice(0, 30)).join()'}
  const before = text()
  window.__res = new Promise((done) => {
    let t0 = 0, pressed = 0, skeleton = false, dimmed = false
    let up = 0
    pill.addEventListener("pointerdown", () => { t0 = performance.now() }, { once: true })
    pill.addEventListener("click", () => { up = performance.now() }, { once: true })
    const tick = () => {
      const now = performance.now()
      if (t0) {
        if (!pressed && up && pill.getAttribute("aria-pressed") === "true") pressed = now - up
        if (document.querySelector("[data-communities-loading]") || document.querySelector(".animate-pulse")) skeleton = true
        const pend = document.querySelector("[data-communities-pending]")
        if (pend && parseFloat(getComputedStyle(pend).opacity) < 0.95) dimmed = true
        const after = text()
        if (pressed && grid() && !pend && !document.querySelector("[data-communities-loading]") && after !== before) return done({ pressed: Math.round(pressed), content: Math.round(now - t0), skeleton, dimmed, shows: after.split(",")[0] })
        if (now - t0 > 20000) return done({ pressed: Math.round(pressed), content: null, skeleton, dimmed })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  pill.scrollIntoView({ block: "nearest", inline: "center" })
  return !!pill
})()`

async function tap(p, label, communities) {
  const ok = await p.evaluate(ARM(label, communities))
  if (!ok) return { error: `no ${label} pill` }
  await sleep(50)
  const sel = await p.evaluateHandle((l) => [...document.querySelectorAll("[data-category-pills-row] > button")].find((b) => b.textContent.includes(l)), label)
  const box = await sel.boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.mouse.down()
  await sleep(90)
  await p.mouse.up()
  return p.evaluate(() => window.__res)
}

const results = {}
for (const [label] of builds) {
  results[label] = {}
  for (const mode of ["products", "communities"]) {
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(PHONE)
    /* Slow from the start, so what the page decides about the network (its prefetch budget) is decided on Slow 3G. */
    const cdp = await p.createCDPSession()
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000, connectionType: "cellular3g" })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    asked = []
    await p.goto(`${origin}/?v=${label}#${mode}`, { timeout: 120_000 })
    await p.waitForSelector(mode === "communities" ? "[data-community-card]" : "[data-product-card]", { timeout: 120_000 })
    await sleep(400)
    const effective = await p.evaluate(() => navigator.connection?.effectiveType ?? null)
    const r = {}
    if (mode === "products") {
      /* Six taps, Design and Business in turn; the median of each. */
      const runs = []
      for (let i = 0; i < 6; i++) {
        runs.push(await tap(p, i % 2 ? "Business" : "Design", false))
        await sleep(600)
      }
      const median = (k) => { const v = runs.map((x) => x[k]).filter((x) => typeof x === "number").sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
      r.taps = runs.length
      r.pressedMedian = median("pressed")
      r.contentMedian = median("content")
      r.pressedMax = Math.max(...runs.map((x) => x.pressed ?? 1e9))
      r.skeleton = runs.some((x) => x.skeleton)
      r.missed = runs.filter((x) => x.content === null).length
    } else {
      /* The page sits idle for five seconds first: long enough for an idle prefetch to land on Slow 3G. */
      await sleep(5000)
      r.nextPill = await tap(p, "Design", true)
      await sleep(400)
      r.farPill = await tap(p, "Video", true)
      await sleep(400)
      r.seenPill = await tap(p, "Design", true)
      await sleep(400)
      r.tapTapTap = await tap(p, "Business", true)
    }
    r.requests = [...asked]
    r.effectiveType = effective
    r.errors = errors
    results[label][mode] = r
    await ctx.close()
  }
}

for (const [label] of builds) {
  console.log(`\n${label}: 390x844, 4x CPU, Slow 3G (pointerdown to frame)`)
  for (const [mode, r] of Object.entries(results[label])) console.log(`  ${mode.padEnd(12)} ${JSON.stringify(r)}`)
}

const a = results.after
console.log("\nafter, checked")
expect(a.products.pressedMedian !== null && a.products.pressedMedian < 60, "products: the pill is drawn pressed within 60ms of the tap on a 4x slower CPU (median of six)", a.products.pressedMedian)
expect(a.products.missed === 0 && !a.products.skeleton, "products: every tap lands on its grid, never a skeleton", a.products)
if (results.before) expect(a.products.contentMedian <= results.before.products.contentMedian * 1.15, "products: the grid is no slower to arrive than before", { before: results.before.products.contentMedian, after: a.products.contentMedian })
expect(a.communities.nextPill.content !== null && a.communities.nextPill.content < 500 && !a.communities.nextPill.skeleton, "communities: the pill beside the current one was warmed while idle, so it draws at once", a.communities.nextPill)
expect(!a.communities.farPill.skeleton, "communities: a pill nobody warmed keeps the previous grid while it loads (no skeleton)", a.communities.farPill)
expect(a.communities.seenPill.content !== null && a.communities.seenPill.content < 500 && !a.communities.seenPill.skeleton, "communities: a pill seen before draws from memory", a.communities.seenPill)
for (const [mode, r] of Object.entries(a)) expect(r.errors.length === 0, `${mode}: no errors`, r.errors)

await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
