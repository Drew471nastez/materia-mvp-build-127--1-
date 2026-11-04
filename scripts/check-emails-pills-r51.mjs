/**
 * ===========================================================================
 *  CUSTOMER EMAILS' FAMILY PILLS AND SETTINGS' PILL GROUPS (r51)
 * ===========================================================================
 * The owner: switching between All, Digital products, Physical products and
 * Communities must be smooth, with no flash and no jump, the content kept
 * steady; and the pills must look like Analytics' controls (Last 7 days,
 * All pages, All products, Digital).
 *
 * The real panel (scripts/render-emails-families-probe.tsx) at Emails on a
 * phone (390) and in Settings on a computer (1280). Every frame for 400ms
 * after each press is read:
 *
 *   flash   the list's lowest opacity while it changes;
 *   jump    how far the pill row moved, how far a row that stays on screen
 *           (the first Digital email, kept from All to Digital) moved, and
 *           how far the page's scroll position moved;
 *   look    each pill's height, corners, ground and ring, against the
 *           analytics chip (app/globals.css [data-analytics-controls]):
 *           36px, fully round, white, a hairline ring;
 *   smooth  the chosen pill's ground seen part way over several frames.
 *
 *   node scripts/check-emails-pills-r51.mjs        (SHOTS_DIR=... keeps pictures)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const out = mkdtempSync(join(tmpdir(), "storelib-email-pills-r51-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const ORIGIN = "https://storelib.test"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

writeFileSync(join(out, "navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export function redirect() {}
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
execFileSync(
  "npx",
  ["esbuild", "scripts/render-emails-families-probe.tsx", `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`, '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://x.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="x"', "--bundle", "--format=iife", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined", "--define:process.env.NEXT_PUBLIC_APP_URL=undefined", "--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY=undefined", "--alias:@=.", `--outfile=${join(out, "app.js")}`, "--log-level=error"],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
)
const css = await appCss(root)
const js = readFileSync(join(out, "app.js"), "utf8")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
async function open(phone, path) {
  const p = await browser.newPage()
  if (phone) await p.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  else await p.setViewport({ width: 1280, height: 900 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }) : r.continue()))
  await p.goto(`${ORIGIN}${path}`)
  await p.waitForSelector("#customer-emails-view [data-customer-email]", { timeout: 15000 }).catch((e) => {
    console.error(errors.join("\n"))
    throw e
  })
  await sleep(500)
  return { p, errors }
}

/* One press, every frame for 400ms after it. */
const PRESS = (to) => `(async () => {
  const pills = document.querySelector('[data-email-families]') || document.querySelector('#customer-emails-view').parentElement.querySelector('[role=tablist]')
  const chip = [...pills.querySelectorAll('[role=tab]')].find((b) => b.getAttribute('data-filter-pill') === ${JSON.stringify(to)} || b.getAttribute('data-tab') === ${JSON.stringify(to)})
  const panel = document.getElementById('customer-emails-view')
  const keep = panel.querySelector('[data-customer-email="receipt"]')
  const top = (el) => el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null
  const scroller = document.scrollingElement
  const start = { pills: top(pills), chip: top(chip), keep: top(keep), scroll: scroller.scrollTop, height: Math.round(panel.getBoundingClientRect().height) }
  const frames = []
  const t0 = performance.now()
  chip.click()
  await new Promise((done) => {
    const tick = () => {
      const kept = keep && keep.isConnected ? keep : null
      frames.push({ t: Math.round(performance.now() - t0), list: Number(getComputedStyle(panel).opacity), pills: top(pills), chip: top(chip), keep: top(kept), scroll: scroller.scrollTop, on: getComputedStyle(chip).backgroundColor })
      if (performance.now() - t0 < 400) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  })
  const cs = getComputedStyle(chip)
  const off = [...pills.querySelectorAll('[role=tab]')].find((b) => b !== chip)
  const ocs = getComputedStyle(off)
  return {
    start,
    frames,
    selected: chip.getAttribute('aria-selected'),
    look: { h: Math.round(chip.getBoundingClientRect().height), radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, color: cs.color, weight: cs.fontWeight, size: cs.fontSize },
    offLook: { h: Math.round(off.getBoundingClientRect().height), radius: ocs.borderTopLeftRadius, bg: ocs.backgroundColor, shadow: ocs.boxShadow, color: ocs.color, weight: ocs.fontWeight, size: ocs.fontSize },
    transition: { property: cs.transitionProperty, duration: cs.transitionDuration },
  }
})()`

for (const [phone, path, tag] of [
  [false, "/app/settings?tab=emails", "1280-settings"],
  [true, "/app/emails?tab=customer", "390-emails"],
]) {
  console.log(`\n${tag}`)
  const { p, errors } = await open(phone, path)
  const r = (report[tag] = {})
  await p.screenshot({ path: join(shots, `${tag}-0-all.png`) })
  /* Scrolled a little, as a person reading the list is: a jump shows as the scroll position moving. */
  await p.evaluate(() => window.scrollTo(0, 120))
  await sleep(200)
  for (const to of ["digital", "physical", "communities", "all", "digital"]) {
    const run = await p.evaluate(PRESS(to))
    const f = run.frames
    const minList = Math.min(...f.map((x) => x.list))
    const pillMove = Math.max(...f.map((x) => Math.abs((x.pills ?? 0) - run.start.pills)))
    const scrollMove = Math.max(...f.map((x) => Math.abs(x.scroll - run.start.scroll)))
    const keepFrames = f.filter((x) => x.keep !== null)
    const keepMove = run.start.keep !== null && keepFrames.length ? Math.max(...keepFrames.map((x) => Math.abs(x.keep - run.start.keep))) : null
    const ons = f.map((x) => x.on)
    const between = new Set(ons).size
    r[to + (r[to] ? "-again" : "")] = { minList, pillMove, scrollMove, keepMove, groundSteps: between, look: run.look, offLook: run.offLook, transition: run.transition }
    expect(run.selected === "true", `${to}: chosen`)
    expect(minList >= 0.99, `${to}: no flash (the list's lowest opacity)`, minList)
    expect(pillMove < 0.5, `${to}: the pills stay where they are`, pillMove)
    expect(scrollMove < 0.5, `${to}: the page does not scroll by itself`, scrollMove)
    if (keepMove !== null) expect(keepMove < 0.5, `${to}: a row that stays on screen stays put`, keepMove)
    await p.screenshot({ path: join(shots, `${tag}-${to}.png`) })
    await sleep(150)
  }
  const last = r["digital-again"] || r.digital
  expect(last.offLook.h === 36 && parseFloat(last.offLook.radius) >= 18 && last.offLook.bg === "rgb(255, 255, 255)" && /rgba\(17, 24, 39, 0\.08\) 0px 0px 0px 1px/.test(last.offLook.shadow) && last.offLook.weight === "600" && last.offLook.size === "14px", "a pill is Analytics' chip: 36px, round, white, hairline ring, 14px semibold", last.offLook)
  expect(last.look.bg === "rgb(26, 26, 46)" && last.look.color === "rgb(255, 255, 255)", "the chosen one is dark", last.look)
  expect(last.groundSteps >= 3, "the chosen pill's ground eases over several frames", last.groundSteps)
  expect(errors.length === 0, "no page errors", errors.slice(0, 3))
  await p.close()
}

/* Settings › Integrations' category pills: the same component, the same look. */
console.log("\nThe component the Integrations directory shares")
const src = readFileSync(join(root, "components/app/filter-pills.tsx"), "utf8")
expect(/h-9/.test(src) && /rounded-full/.test(src) && /shadow-\[0_0_0_1px_rgba\(17,24,39,0\.08\),0_1px_2px_rgba\(17,24,39,0\.05\)\]/.test(src), "FilterPills draws Analytics' chip")

await browser.close()
console.log(JSON.stringify(report, null, 1).slice(0, 4000))
console.log(broken ? `\n${broken} failed   (shots: ${shots})` : `\nall ok   (shots: ${shots})`)
process.exit(broken ? 1 : 0)
