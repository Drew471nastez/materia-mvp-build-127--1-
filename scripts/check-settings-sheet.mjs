/**
 * THE SETTINGS SHEET, MEASURED.
 *
 *   node scripts/check-settings-sheet.mjs     (PROBE_CSS=source without a fresh build)
 *
 * The real component and the real compiled stylesheet, in Chromium at a
 * phone's size, with Next's router stubbed so every Back and push is counted.
 *
 *   over a page   the page it was opened from stays in the document under it
 *   in            it rises from below the screen, on transform only
 *   the fade      none at rest; once scrolled, a soft edge at the top of the
 *                 scroll with a blur behind it
 *   the pull      on a touch screen, content at its top pulled down moves the
 *                 sheet with the finger, every frame; scrolled down, the same
 *                 pull is the content's own scroll; a range slider keeps its
 *                 drag
 *   let go        short of a quarter springs back to no transform at all;
 *                 past it the sheet goes down and only THEN does the address
 *                 go Back, once, never a push
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)

const out = mkdtempSync(join(tmpdir(), "storelib-settings-sheet-"))
const stubs = join(out, "stubs")
mkdirSync(stubs)
writeFileSync(join(stubs, "navigation.js"), `
window.__nav = { back: 0, push: [], replace: [] }
const router = {
  back() { window.__nav.back++ },
  push(h) { window.__nav.push.push(h) },
  replace(h) { window.__nav.replace.push(h) },
  prefetch() {}, refresh() {}, forward() {},
}
export function useRouter() { return router }
export function usePathname() { return "/app/settings" }
export function useSearchParams() { return new URLSearchParams() }
`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-sheet.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 780, hasTouch: true, isMobile: true })
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const ty = () => page.evaluate(() => {
  const m = getComputedStyle(document.querySelector("[data-settings-sheet]")).transform
  return m === "none" ? 0 : Math.round(new DOMMatrix(m).m42 * 10) / 10
})
const nav = () => page.evaluate(() => window.__nav)

/** A touch pull through CDP: real touch events, so the browser decides what scrolls. */
const cdp = await page.createCDPSession()
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })

async function load(mode = "over") {
  await page.goto(`file://${join(out, "index.html")}`)
  await page.evaluate((m) => { window.__mode = m }, mode)
  await page.reload()
  await page.evaluate((m) => { window.__mode = m }, mode)
}
// The mode is read at module start, so set it before the script runs.
await page.evaluateOnNewDocument(() => { window.__mode = window.__mode ?? "over" })

console.log("\nOver a page")
await load()
await wait(40)
{
  const r = await page.evaluate(() => {
    const el = document.querySelector("[data-settings-sheet]")
    const a = el.getAnimations()[0]
    const kf = a ? a.effect.getKeyframes().map((k) => k.transform) : []
    return { under: !!document.querySelector("[data-page-under]"), mode: document.documentElement.getAttribute("data-settings-sheet-up"), kf, duration: a?.effect.getTiming().duration }
  })
  say(r.under, "the page it was opened from is still in the document under the sheet")
  say(r.mode === "over", `the page is not held under it: its scroll stays its own (mode ${r.mode})`)
  say(r.kf[0] === "translate3d(0px, 100%, 0px)" && r.kf[1] === "translate3d(0px, 0px, 0px)", `it rises from below the screen on transform only (${r.kf.join(" to ")}, ${r.duration}ms)`)
}
await wait(500)

console.log("\nThe top edge of the scroll")
{
  const rest = await page.evaluate(() => getComputedStyle(document.querySelector("[data-settings-sheet-fade]")).opacity)
  say(rest === "0", `at rest there is no fade over the first row (opacity ${rest})`)
  await page.evaluate(() => { document.querySelector("[data-settings-sheet-scroll]").scrollTop = 300 })
  await wait(300)
  const f = await page.evaluate(() => {
    const el = document.querySelector("[data-settings-sheet-fade]")
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const s = document.querySelector("[data-settings-sheet-scroll]").getBoundingClientRect()
    return { opacity: cs.opacity, blur: cs.backdropFilter || cs.webkitBackdropFilter, mask: cs.maskImage || cs.webkitMaskImage, top: Math.round(r.top - s.top), h: Math.round(r.height) }
  })
  say(f.opacity === "1", `scrolled, the edge fades in (opacity ${f.opacity})`)
  say(/blur\(6px\)/.test(f.blur), `with a soft blur behind it (${f.blur})`)
  say(/gradient/.test(f.mask), "and a mask, so the blur itself has no hard bottom edge")
  say(f.top === 0 && f.h >= 20 && f.h <= 28, `at the scroll's very top, ${f.h}px tall`)
  await page.evaluate(() => { document.querySelector("[data-settings-sheet-scroll]").scrollTop = 0 })
  await wait(80)
}

console.log("\nPulling the content down at its top")
{
  const y0 = 300
  await touch("touchStart", 200, y0)
  const seen = []
  for (let i = 1; i <= 10; i++) {
    await touch("touchMove", 200, y0 + i * 12)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    seen.push(await ty())
  }
  const scrollTop = await page.evaluate(() => document.querySelector("[data-settings-sheet-scroll]").scrollTop)
  const steady = seen.every((v, i) => i === 0 || v >= seen[i - 1])
  say(seen[seen.length - 1] >= 100, `the sheet follows the finger: ${seen.join(", ")}px`)
  say(steady, "  every frame further down, never back")
  say(scrollTop === 0, "  and the content did not scroll under it")
  await wait(120)
  await touch("touchEnd")
  await wait(400)
  const after = await ty()
  const n = await nav()
  say(after === 0, `let go short of a quarter, it springs back to no transform at all (${after})`)
  say(n.back === 0 && n.push.length === 0, "  and nothing navigated")
}

console.log("\nThe same pull, scrolled down")
{
  await page.evaluate(() => { document.querySelector("[data-settings-sheet-scroll]").scrollTop = 400 })
  await wait(50)
  await touch("touchStart", 200, 300)
  for (let i = 1; i <= 8; i++) await touch("touchMove", 200, 300 + i * 15)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
  const moved = await ty()
  await touch("touchEnd")
  await wait(100)
  say(moved === 0, `is the content's own scroll, the sheet stays put (${moved})`)
  await page.evaluate(() => { document.querySelector("[data-settings-sheet-scroll]").scrollTop = 0 })
}

console.log("\nA slider keeps its own drag")
{
  const p = await page.evaluate(() => { const r = document.querySelector("[data-range]").getBoundingClientRect(); return [r.left + 8, r.top + r.height / 2] })
  await touch("touchStart", p[0], p[1])
  for (let i = 1; i <= 6; i++) await touch("touchMove", p[0] + 2, p[1] + i * 14)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
  const moved = await ty()
  await touch("touchEnd")
  await wait(300)
  say(moved === 0, `a pull that starts on a range slider never moves the sheet (${moved})`)
}

console.log("\nLet go past a quarter")
{
  await touch("touchStart", 200, 200)
  for (let i = 1; i <= 16; i++) {
    await touch("touchMove", 200, 200 + i * 16)
    await wait(16)
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
  const held = await ty()
  await wait(140)
  await touch("touchEnd")
  await wait(30)
  const during = await nav()
  const mid = await ty()
  await wait(450)
  const done = await nav()
  say(held > 200, `held at ${held}px`)
  say(during.back === 0 && mid > held, `the sheet goes on down first (${mid}px) and the address has not moved yet`)
  say(done.back === 1 && done.push.length === 0 && done.replace.length === 0, `then one Back, never a push (back ${done.back}, push ${done.push.length})`)
}

console.log("\nThe close button")
await load()
await wait(500)
{
  await page.click("[data-settings-sheet-close]")
  await wait(40)
  const a = await page.evaluate(() => {
    const el = document.querySelector("[data-settings-sheet]")
    return el.getAnimations().map((x) => x.effect.getKeyframes().map((k) => k.transform).join(" to "))
  })
  await wait(500)
  const n = await nav()
  say(a.some((k) => /translate3d\(0px, \d+px, 0px\)$/.test(k)), `slides down on transform (${a.join(" | ")})`)
  say(n.back === 1, `and goes Back once when it is gone (${n.back})`)
}

console.log("\nOpened on its own")
await page.evaluateOnNewDocument(() => { window.__mode = "page" })
await page.goto(`file://${join(out, "index.html")}`)
await wait(500)
{
  const mode = await page.evaluate(() => document.documentElement.getAttribute("data-settings-sheet-up"))
  say(mode === "page", `the shell under it is held still (mode ${mode})`)
  await page.click("[data-settings-sheet-close]")
  await wait(500)
  const n = await nav()
  say(n.push.includes("/app") || n.back === 0, `closing goes to the dashboard (push ${JSON.stringify(n.push)})`)
}

await browser.close()
console.log(bad ? `\n${bad} failed\n` : "\nThe sheet opens over the page, follows the finger and goes back without a reload.\n")
process.exit(bad ? 1 : 0)
