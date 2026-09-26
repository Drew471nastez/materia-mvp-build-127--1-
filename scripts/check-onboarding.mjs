/**
 * ===========================================================================
 *  THE ONBOARDING'S TOP ROW, ITS NARROWEST PHONE, AND ITS STEP CHANGE
 * ===========================================================================
 * "the back and name, how bad it is, and it overlaps with the content there,
 * misaligned css ... fully fix it on desktop and mobile very small devices
 * ... and improve the smoothness of the onboarding as well."
 *
 * The creator onboarding (components/app/creator-onboarding-modal), opened
 * the way starting a second business opens it, measured in a browser at eight
 * widths from a 320px phone to a 1440px desktop:
 *
 *   NOTHING TOUCHES   the way back to the first business and the progress
 *                     bar never overlap, and keep 8px between them
 *   ONE LINE          their middles are on the same line, to the pixel
 *   THE BAR IS IN     the same space to the left of the bar as to the right
 *   THE MIDDLE
 *   THE PRESS         the way back is a 44px target on a phone
 *   NOTHING OVER      what went wrong is under the row, never over the
 *   THE HEADING       heading
 *   NO SIDEWAYS       no step scrolls sideways, and the row of buttons on
 *   SCROLL            the category step fits inside a 320px phone
 *   THE STEP CHANGE   the step that leaves fades and slides over several
 *                     frames, on opacity and translate alone, and the panel
 *                     it happens in does not move with it
 *
 *   node scripts/check-onboarding.mjs
 *   SHOTS=/some/dir node scripts/check-onboarding.mjs   (and a picture of step 1 at each width)
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

const dir = join(root, ".onboarding-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
/* Every read answers empty, so the store name the probe types is free. */
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-onboarding.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end("{}") }, 60)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), midY: +(r.top + r.height / 2).toFixed(1) } }

/** The top row, read as a person sees it: where each part is, and the space between them. */
const TOP_ROW = `(${(boxSrc) => {
  const box = eval(`(${boxSrc})`)
  const bar = document.querySelector("[data-onboarding-progress]")
  const back = document.querySelector("[data-onboarding-switch-back]")
  if (!bar) return null
  const row = bar.parentElement
  const rowBox = box(row)
  const cs = getComputedStyle(row)
  const pad = { left: parseFloat(cs.paddingLeft), right: parseFloat(cs.paddingRight) }
  const b = box(bar)
  return {
    row: rowBox,
    bar: b,
    back: back ? box(back) : null,
    /* The bar's own space inside the row, padding taken off: equal on both sides is centred. */
    leftRoom: Math.round(b.x - (rowBox.x + pad.left)),
    rightRoom: Math.round((rowBox.right - pad.right) - b.right),
    /* The one that matters: what is left between the way back and the bar. */
    gap: back ? Math.round(b.x - box(back).right) : null,
    fill: (() => { const f = bar.firstElementChild; return f ? Math.round(f.getBoundingClientRect().width) : 0 })(),
  }
}})`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })
const problems = []
const report = {}

for (const [label, viewport] of [
  ["320", { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["360", { width: 360, height: 780, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["375", { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["384", { width: 384, height: 854, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["390", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["430", { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["768", { width: 768, height: 1024, deviceScaleFactor: 2 }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
]) {
  const phone = viewport.width < 640
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.setViewport(viewport)
  /* A long name, because a short one hides the overlap this is about. */
  await page.goto(`${base}/?switch=1&name=${encodeURIComponent("AndrewRullz Studio Supplies")}`)
  await page.waitForFunction(() => !!document.querySelector("[data-onboarding-progress]"), { timeout: 15000 })
  await wait(120)

  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `onboarding-${label}.png`) })
  const top = await page.evaluate(`${TOP_ROW}(${JSON.stringify(box.toString())})`)
  const at = `at ${label}:`
  if (!top) { problems.push(`${at} no progress bar was drawn`); await page.close(); continue }
  if (!top.back) problems.push(`${at} the way back to the first business was not drawn`)
  else {
    if (top.gap < 8) problems.push(`${at} the way back and the bar are ${top.gap}px apart${top.gap < 0 ? ", which is an overlap" : ""}`)
    if (Math.abs(top.back.midY - top.bar.midY) > 1) problems.push(`${at} they are not on one line: the way back's middle at ${top.back.midY}, the bar's at ${top.bar.midY}`)
    if (phone && (top.back.w < 44 || top.back.h < 44)) problems.push(`${at} the way back is ${top.back.w}x${top.back.h}, under a 44px press`)
  }
  if (Math.abs(top.leftRoom - top.rightRoom) > 1) problems.push(`${at} the bar is not in the middle of the row: ${top.leftRoom}px to its left, ${top.rightRoom}px to its right`)
  /* Step 1 of 5. */
  if (Math.abs(top.fill - Math.round(top.bar.w / 5)) > 1) problems.push(`${at} the bar shows ${top.fill}px of ${top.bar.w}px on step 1, not a fifth`)

  /* What went wrong belongs under the row, never over the heading. */
  await page.click("[data-onboarding-switch-back]")
  await page.waitForFunction(() => !!document.querySelector('[role="alert"]'), { timeout: 5000 }).catch(() => {})
  const said = await page.evaluate(`(() => { const box = ${box.toString()}
    const alert = document.querySelector('[role=alert]')
    const heading = document.querySelector("h1")
    return alert && heading ? { alert: box(alert), heading: box(heading) } : null })()`)
  if (!said) problems.push(`${at} a way back that refused said nothing`)
  else if (said.alert.bottom > said.heading.y) problems.push(`${at} what went wrong is drawn over the heading`)

  /* Type a store name, which is what lets step 1 be left. */
  await page.click('input[placeholder="Your store name"]')
  await page.type('input[placeholder="Your store name"]', "Andrews Supplies")
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Next")
    return b && !b.disabled
  }, { timeout: 8000 })

  /*
    THE STEP CHANGE, FRAME BY FRAME. A script cannot feel whether it was
    smooth, so this reads the two things that decide it: what is animated
    (opacity and transform are the two a phone can do without drawing the
    page again), and whether the panel the steps sit in moves with them.
  */
  const swap = await page.evaluate(`(async () => {
    const panel = document.querySelector("[data-onboarding-step]")
    const scroller = panel.parentElement
    const declared = getComputedStyle(panel).transitionProperty
    const frames = []
    let stop = false
    const tick = () => {
      const cs = getComputedStyle(panel)
      frames.push({ o: +Number(cs.opacity).toFixed(3), x: parseFloat((cs.translate || "0").split(" ")[0]) || 0, step: panel.getAttribute("data-onboarding-step"), sh: Math.round(scroller.getBoundingClientRect().height), sy: Math.round(scroller.getBoundingClientRect().top) })
      if (!stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    ;[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Next").click()
    await new Promise((r) => setTimeout(r, 700))
    stop = true
    return { declared, frames }
  })()`)
  const props = swap.declared.split(",").map((s) => s.trim()).sort().join(",")
  /* Tailwind 4's translate-x-3 sets \`translate\`, not \`transform\`: naming transform left the slide jumping while only the fade ran. */
  if (props !== "opacity,translate") problems.push(`${at} the step animates "${swap.declared}", not opacity and translate alone`)
  const sliding = new Set(swap.frames.map((f) => f.x.toFixed(2)).filter((x) => Math.abs(Number(x)) > 0.05 && Math.abs(Number(x)) < 11.95)).size
  if (sliding < 3) problems.push(`${at} the step moved through ${sliding} in-between positions: it jumped rather than slid`)
  const fading = swap.frames.filter((f) => f.o > 0.02 && f.o < 0.98).length
  if (fading < 3) problems.push(`${at} the step changed in ${fading} part-way frames: that is a cut, not a fade`)
  if (!swap.frames.some((f) => f.step === "2")) problems.push(`${at} pressing Next did not reach step 2`)
  const endedVisible = swap.frames[swap.frames.length - 1]
  if (endedVisible.o < 0.99) problems.push(`${at} the step it arrived at stayed at ${endedVisible.o} opacity`)
  const heights = new Set(swap.frames.map((f) => f.sh))
  const tops = new Set(swap.frames.map((f) => f.sy))
  if (heights.size > 1 || tops.size > 1) problems.push(`${at} the panel the steps are in moved while they changed (heights ${[...heights]}, tops ${[...tops]})`)

  /* Step 2, where the row of buttons is at its longest: Back, Other, Skip, Next. */
  await wait(120)
  const footer = await page.evaluate(`(() => { const box = ${box.toString()}
    const names = ["Back", "Other", "Skip", "Next"]
    const found = names.map((n) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === n)).filter(Boolean)
    const doc = document.scrollingElement
    const panel = document.querySelector("[data-onboarding-step]").parentElement
    return {
      buttons: found.map((b) => ({ label: b.textContent.trim(), ...box(b) })),
      width: window.innerWidth,
      sideways: Math.max(doc.scrollWidth - doc.clientWidth, panel.scrollWidth - panel.clientWidth),
    }
  })()`)
  if (footer.buttons.length !== 4) problems.push(`${at} step 2 drew ${footer.buttons.length} of its four buttons`)
  for (const b of footer.buttons) {
    if (b.x < 0 || b.right > footer.width) problems.push(`${at} ${b.label} runs off the screen (${b.x} to ${b.right} of ${footer.width})`)
    if (b.h < 44) problems.push(`${at} ${b.label} is ${b.h}px tall, under a 44px press`)
  }
  for (let i = 1; i < footer.buttons.length; i++) {
    const gap = footer.buttons[i].x - footer.buttons[i - 1].right
    if (gap < 8) problems.push(`${at} ${footer.buttons[i - 1].label} and ${footer.buttons[i].label} are ${gap}px apart${gap < 0 ? ", which is an overlap" : ""}`)
  }
  if (footer.sideways > 0) problems.push(`${at} the step scrolls sideways by ${footer.sideways}px`)

  report[label] = {
    gap: top.gap, backMid: top.back?.midY, barMid: top.bar.midY, backBox: top.back ? `${top.back.w}x${top.back.h}` : null,
    room: [top.leftRoom, top.rightRoom], fadeFrames: fading, slidePositions: sliding, animates: swap.declared,
    footer: footer.buttons.map((b) => `${b.label} ${b.x}-${b.right}`), sideways: footer.sideways,
  }
  if (errors.length) problems.push(`${at} ${errors.length} error(s): ${errors[0]}`)
  await page.close()
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: the way back and the bar keep their distance on one line, the buttons fit a 320px phone, and a step fades and slides on opacity and translate inside a panel that holds still")
