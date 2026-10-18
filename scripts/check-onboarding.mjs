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
/* The real picture, from public/, so the setup screen's mark is the mark in a screenshot. */
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, sizes, preload, priority, unoptimized, loading, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src.src, alt, width, height, ...rest }) }
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
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end("{}") }, 60)
    return
  }
  if (req.url.startsWith("/images/")) {
    const file = join(root, "public", decodeURIComponent(req.url.split("?")[0]))
    if (existsSync(file)) {
      res.writeHead(200, { "content-type": file.endsWith(".webp") ? "image/webp" : file.endsWith(".png") ? "image/png" : "image/jpeg" })
      res.end(readFileSync(file))
      return
    }
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
    /* How much of the track the fill covers: it is a full length bar slid in from the left and clipped. */
    fill: (() => { const f = bar.firstElementChild; return f ? Math.round(Math.max(0, f.getBoundingClientRect().right - bar.getBoundingClientRect().left)) : 0 })(),
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
  ["1280", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["1920", { width: 1920, height: 1080, deviceScaleFactor: 1 }],
  /* A short laptop window: the card keeps its margin by giving up height. */
  ["1366x600", { width: 1366, height: 600, deviceScaleFactor: 1 }],
]) {
  /* ONLY=390,1440 measures those widths alone. */
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(label)) continue
  if (process.env.VERBOSE) console.error(`  ${label}...`)
  const phone = viewport.width < 640
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.setViewport(viewport)
  /* The 390 phone is an iPhone: the clock's 47px at the top and the home bar's 34 at the bottom. */
  if (label === "390") {
    const sa = await page.createCDPSession()
    await sa.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } }).catch(() => {})
  }
  /* A long name, because a short one hides the overlap this is about. */
  await page.goto(`${base}/?switch=1&name=${encodeURIComponent("AndrewRullz Studio Supplies")}`)
  await page.waitForFunction(() => !!document.querySelector("[data-onboarding-progress]"), { timeout: 15000 })
  await wait(120)

  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `onboarding-${label}.png`) })
  const top = await page.evaluate(`${TOP_ROW}(${JSON.stringify(box.toString())})`)
  const at = `at ${label}:`

  /*
    THE CARD'S SIZE. "Increase the whole modal a bit so it expands a little
    more on the screen, but without touching the edges." From 640px up it is
    1040 by 610 (it was 930 by 540) where the window has room, and never
    closer than 24px to any edge of it; a phone is the whole screen, as before.
  */
  const card = await page.evaluate(`(() => { const box = ${box.toString()}
    const d = document.querySelector('[role="dialog"]')
    return d ? box(d) : null })()`)
  if (!card) problems.push(`${at} no dialog`)
  else if (phone) {
    if (card.w !== viewport.width || card.h !== viewport.height || card.x !== 0 || card.y !== 0) problems.push(`${at} a phone should have the whole screen, got ${JSON.stringify(card)}`)
  } else {
    const margin = Math.min(card.x, card.y, viewport.width - card.right, viewport.height - card.bottom)
    if (margin < 23.5) problems.push(`${at} the card comes within ${margin}px of the window's edge (${JSON.stringify(card)})`)
    const roomyW = viewport.width - 48 >= 1040
    const roomyH = viewport.height - 48 >= 610
    if (roomyW && card.w !== 1040) problems.push(`${at} the card is ${card.w}px wide, not 1040`)
    if (roomyH && card.h !== 610) problems.push(`${at} the card is ${card.h}px tall, not 610`)
    if (!roomyW && card.w !== viewport.width - 48) problems.push(`${at} a narrow window should get the card at its width less 48px, got ${card.w}`)
    if (!roomyH && card.h !== viewport.height - 48) problems.push(`${at} a short window should get the card at its height less 48px, got ${card.h}`)
  }
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
  await page.click('input[placeholder="Your name or brand"]')
  await page.type('input[placeholder="Your name or brand"]', "Andrews Supplies")
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Next")
    return b && !b.disabled
  }, { timeout: 8000 })

  /*
    THE STEP CHANGE, FRAME BY FRAME, WITH THE CPU SLOWED FOUR TIMES. A script
    cannot feel whether it was smooth, so this reads what decides it: what is
    animated (opacity and translate are the two a phone does without laying
    out or drawing the page again), that the arriving step and the leaving
    one overlap so no frame is blank, that they are never two whole pages on
    top of each other, and that the panel and the row of buttons they sit
    between do not move.
  */
  const cdp = await page.createCDPSession()
  const SWAP = `(async () => {
    const scroller = document.querySelector("[data-onboarding-scroller]")
    const footer = document.querySelector("[data-onboarding-footer]")
    const frames = []
    const props = new Set()
    let stop = false
    const read = (el) => el ? { o: +Number(getComputedStyle(el).opacity).toFixed(3), x: parseFloat((getComputedStyle(el).translate || "0").split(" ")[0]) || 0 } : null
    let pressAt = Infinity
    const tick = () => {
      const enter = document.querySelector("[data-onboarding-step]")
      const leave = document.querySelector("[data-onboarding-leaving]")
      for (const el of [enter, leave]) if (el) for (const a of el.getAnimations()) for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(p)) props.add(p)
      const sr = scroller.getBoundingClientRect(), fr = footer.getBoundingClientRect()
      const t = performance.now()
      if (t >= pressAt) frames.push({ t, step: enter && enter.getAttribute("data-onboarding-step"), enter: read(enter), leave: read(leave), sh: Math.round(sr.height), sy: Math.round(sr.top), fy: Math.round(fr.top), fh: Math.round(fr.height) })
      if (!stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const from = document.querySelector("[data-onboarding-step]").getAttribute("data-onboarding-step")
    pressAt = performance.now()
    ;[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Next" && !b.disabled).click()
    await new Promise((r) => setTimeout(r, 900))
    stop = true
    return { from, props: [...props].sort().join(","), frames, leftover: !!document.querySelector("[data-onboarding-leaving]") }
  })()`
  /* One step change, read. `slowed` is the CPU slowed four times, where a blank or doubled frame would show. */
  const measureSwap = async (slowed) => {
    if (slowed) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const swap = await page.evaluate(SWAP)
    if (slowed) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const name = `${at} step ${swap.from} to ${Number(swap.from) + 1}${slowed ? " (CPU slowed 4x)" : ""}:`
    if (swap.props !== "opacity,translate") problems.push(`${name} the step change animates "${swap.props}", not opacity and translate alone`)
    const during = swap.frames.filter((f) => f.leave)
    const sliding = new Set(during.map((f) => f.enter && f.enter.x.toFixed(2)).filter((x) => x && Math.abs(Number(x)) > 0.05 && Math.abs(Number(x)) < 15.95)).size
    const fading = during.filter((f) => f.enter && f.enter.o > 0.02 && f.enter.o < 0.98).length
    /*
      Frames are sampled on the main thread. The fade and the drift run on the
      compositor, so a long main thread frame on a slowed CPU drops samples,
      not frames on screen: the count of in-between frames is held at full
      speed, and the slowed pass is read for what a sample can still prove.
    */
    if (!slowed && sliding < 3) problems.push(`${name} the arriving step moved through ${sliding} in-between positions: it jumped rather than slid`)
    if (!slowed && fading < 3) problems.push(`${name} the step changed in ${fading} part-way frames: that is a cut, not a fade`)
    /* No blank frame: from the press on, the brighter of the two steps never drops below 0.4, and together they never below 0.7. */
    const leastMax = Math.min(...swap.frames.map((f) => Math.max(f.enter ? f.enter.o : 0, f.leave ? f.leave.o : 0)))
    const leastSum = Math.min(...swap.frames.map((f) => (f.enter ? f.enter.o : 0) + (f.leave ? f.leave.o : 0)))
    const both = Math.max(0, ...swap.frames.map((f) => Math.min(f.enter ? f.enter.o : 0, f.leave ? f.leave.o : 0)))
    if (leastMax < 0.4 || leastSum < 0.7) problems.push(`${name} a nearly blank frame (brighter step at ${leastMax}, both together at ${leastSum})`)
    if (both > 0.5) problems.push(`${name} the two steps were both over half there at once (${both}): two pages on top of each other`)
    if (!swap.frames.some((f) => f.step === String(Number(swap.from) + 1))) problems.push(`${name} pressing Next did not reach the next step`)
    const last = swap.frames[swap.frames.length - 1]
    if (!last.enter || last.enter.o < 0.99) problems.push(`${name} the step it arrived at stayed at ${last.enter && last.enter.o} opacity`)
    if (swap.leftover) problems.push(`${name} the step that left was never taken away`)
    const heights = new Set(swap.frames.map((f) => f.sh))
    const tops = new Set(swap.frames.map((f) => f.sy))
    const feet = new Set(swap.frames.map((f) => `${f.fy}/${f.fh}`))
    if (heights.size > 1 || tops.size > 1) problems.push(`${name} the panel the steps are in moved while they changed (heights ${[...heights]}, tops ${[...tops]})`)
    if (feet.size > 1) problems.push(`${name} the row of buttons moved or changed height while the step changed (${[...feet]})`)
    const curve = swap.frames.slice(0, 16).map((f) => `${f.leave ? f.leave.o.toFixed(2) : "-"}/${f.enter ? f.enter.o.toFixed(2) : "-"}`).join(" ")
    return { props: swap.props, sliding, fading, leastMax, leastSum, both, curve }
  }
  const swapSlowed = await measureSwap(true)
  const swap = { props: swapSlowed.props }
  const fading = swapSlowed.fading, sliding = swapSlowed.sliding, leastMax = swapSlowed.leastMax, leastSum = swapSlowed.leastSum, both = swapSlowed.both, swapCurve = swapSlowed.curve

  /* Step 2, where the row of buttons is at its longest: Back, Skip, Next. Other is among the categories, beside See more. */
  await wait(120)
  const footer = await page.evaluate(`(() => { const box = ${box.toString()}
    const names = ["Back", "Skip", "Next"]
    const found = names.map((n) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === n)).filter(Boolean)
    const doc = document.scrollingElement
    const panel = document.querySelector("[data-onboarding-scroller]")
    return {
      buttons: found.map((b) => ({ label: b.textContent.trim(), ...box(b) })),
      width: window.innerWidth,
      sideways: Math.max(doc.scrollWidth - doc.clientWidth, panel.scrollWidth - panel.clientWidth),
    }
  })()`)
  if (footer.buttons.length !== 3) problems.push(`${at} step 2 drew ${footer.buttons.length} of its three buttons`)
  const other = await page.evaluate(`(() => { const box = ${box.toString()}
    const pills = document.querySelector("[data-onboarding-categories]")
    const other = document.querySelector("[data-onboarding-other]")
    const more = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "See more")
    return other && more && pills ? { inPills: pills.contains(other), other: box(other), more: box(more) } : null })()`)
  if (!other) problems.push(`${at} Other or See more is missing on the category step`)
  else {
    if (!other.inPills) problems.push(`${at} Other is not among the categories`)
    if (Math.abs(other.other.midY - other.more.midY) > 1 || other.other.x - other.more.right > 12 || other.other.x < other.more.right) problems.push(`${at} Other is not beside See more (${JSON.stringify(other)})`)
  }
  for (const b of footer.buttons) {
    if (b.x < 0 || b.right > footer.width) problems.push(`${at} ${b.label} runs off the screen (${b.x} to ${b.right} of ${footer.width})`)
    if (b.h < 44) problems.push(`${at} ${b.label} is ${b.h}px tall, under a 44px press`)
  }
  for (let i = 1; i < footer.buttons.length; i++) {
    const gap = footer.buttons[i].x - footer.buttons[i - 1].right
    if (gap < 8) problems.push(`${at} ${footer.buttons[i - 1].label} and ${footer.buttons[i].label} are ${gap}px apart${gap < 0 ? ", which is an overlap" : ""}`)
  }
  if (footer.sideways > 0) problems.push(`${at} the step scrolls sideways by ${footer.sideways}px`)

  /*
    ON TO THE PLAN, WHERE A PHONE SCROLLS. What runs under the top row or
    the Back button fades there instead of being cut in a hard line; before
    anything has scrolled, the top is sharp.
  */
  const clickText = (t) => page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t && !x.disabled); if (b) b.click(); return !!b }, t)
  const swapFull = await measureSwap(false)
  await page.waitForFunction(() => document.querySelector("[data-onboarding-step]")?.getAttribute("data-onboarding-step") === "3", { timeout: 5000 }).catch(() => {})
  await wait(100)
  /* Under SHOTS the step change to the plans is slowed twenty times and photographed part way, for a person to look at. */
  if (process.env.SHOTS && ["390", "1280", "1440"].includes(label)) {
    await cdp.send("Animation.enable")
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 })
    await clickText("Next")
    for (const ms of [30, 80, 160]) {
      await wait(ms === 30 ? 700 : (ms === 80 ? 50 : 80) * 20)
      await page.screenshot({ path: join(process.env.SHOTS, `onboarding-swap-${label}-${String(ms).padStart(3, "0")}ms.png`) })
    }
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
    await wait(400)
  } else await clickText("Next")
  await page.waitForFunction(() => document.querySelector("[data-onboarding-step]")?.getAttribute("data-onboarding-step") === "4", { timeout: 5000 }).catch(() => {})
  await wait(500)
  const edges = await page.evaluate(async () => {
    const sc = document.querySelector("[data-onboarding-scroller]")
    const read = () => ({ top: sc.style.getPropertyValue("--fade-top"), bottom: sc.style.getPropertyValue("--fade-bottom") })
    sc.scrollTop = 0
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const atTop = read()
    const room = sc.scrollHeight - sc.clientHeight
    sc.scrollTop = Math.round(room / 2)
    sc.dispatchEvent(new Event("scroll"))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const middle = read()
    return { room, atTop, middle, mask: getComputedStyle(sc).maskImage || getComputedStyle(sc).webkitMaskImage }
  })
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `onboarding-plan-${label}.png`) })

  /*
    THE PLANS (round 12, ask 34): "pricing cards a hair narrower; more
    vertical space between the Monthly/Yearly pill and the cards; the bottom
    white bar a softer, more subtle white fade with a light blur".
  */
  const plans = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-onboarding-step] [data-plan-card]")].map((c) => { const r = c.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), top: Math.round(r.top) } })
    const pill = document.querySelector("[data-onboarding-step] [data-plan-interval-row]")
    const grid = document.querySelector("[data-onboarding-step] [data-plan-cards]")
    const veil = document.querySelector("[data-onboarding-veil]")
    const bands = [...document.querySelectorAll("[data-onboarding-veil-band]")].map((b) => getComputedStyle(b))
    const vs = veil && getComputedStyle(veil)
    const sc = document.querySelector("[data-onboarding-scroller]").getBoundingClientRect()
    const vr = veil && veil.getBoundingClientRect()
    return {
      cards, pillGap: pill && grid ? Math.round(grid.getBoundingClientRect().top - pill.getBoundingClientRect().bottom) : null,
      sideRoom: cards.length ? Math.round(cards[0].x - sc.left) : null,
      veil: veil && { h: Math.round(vr.height), overScrollerBottom: Math.round(sc.bottom - vr.bottom), opacity: bands.length ? Math.min(...bands.map((b) => Number(b.opacity))) : 0, blur: bands.map((b) => b.backdropFilter || b.webkitBackdropFilter).join(" "), events: vs.pointerEvents },
    }
  })
  if (process.env.SHOTS) {
    const vp = page.viewport()
    const foot = await page.evaluate(() => { const r = document.querySelector("[data-onboarding-footer]").getBoundingClientRect(); return { y: Math.max(0, Math.round(r.top - 150)), h: Math.round(r.bottom) } })
    await page.screenshot({ path: join(process.env.SHOTS, `onboarding-plan-foot-${label}.png`), clip: { x: 0, y: foot.y, width: vp.width, height: Math.min(vp.height, foot.h) - foot.y } })
  }
  if (plans.cards.length !== 2) problems.push(`${at} the plan step drew ${plans.cards.length} plan cards`)
  else if (phone) {
    if (plans.cards[0].w > viewport.width - 44) problems.push(`${at} a plan card is ${plans.cards[0].w}px on a ${viewport.width}px phone: not narrower than before (${viewport.width - 32})`)
  } else if (viewport.width >= 768 && plans.cards[0].w + plans.cards[1].w + 12 > 668) problems.push(`${at} the two plan cards take ${plans.cards[0].w + plans.cards[1].w + 12}px, more than 668`)
  if (plans.pillGap === null || plans.pillGap < 20) problems.push(`${at} ${plans.pillGap}px between the Monthly and Yearly pill and the cards, under 20`)
  if (!plans.veil) problems.push(`${at} no soft white at the foot of the panel`)
  else {
    if (!/blur\(/.test(plans.veil.blur || "")) problems.push(`${at} the foot of the panel is not blurred (${plans.veil.blur})`)
    if (plans.veil.events !== "none") problems.push(`${at} the soft white at the foot takes taps`)
    if (plans.veil.overScrollerBottom !== 0) problems.push(`${at} the soft white is ${plans.veil.overScrollerBottom}px off the panel's foot`)
    if (edges.room > 40 && Number(plans.veil.opacity) < 0.99) problems.push(`${at} with more plans below, the soft white is at ${plans.veil.opacity}`)
  }
  if (!/gradient/.test(edges.mask || "")) problems.push(`${at} the step panel has no edge fade`)
  if (edges.atTop.top !== "0px") problems.push(`${at} the top edge fades before anything has scrolled under it`)
  if (edges.room > 40) {
    if (edges.middle.top !== "20px" || edges.middle.bottom !== "20px") problems.push(`${at} scrolled part way, the plans are cut rather than faded at the edges (${JSON.stringify(edges.middle)})`)
  }

  /*
    THE LAST STEP. Starting free goes to setup; the probe's database refuses,
    so it ends on the error state, which is enough to see the mark: whole,
    nothing clipping it, at 61px (68 from 640), and the row of buttons under
    the panel exactly where it was on the plan step, so the panel does not
    grow as setup begins.
  */
  const footAtPlan = await page.evaluate(() => { const r = document.querySelector("[data-onboarding-footer]").getBoundingClientRect(); const sc = document.querySelector("[data-onboarding-scroller]").getBoundingClientRect(); return `${Math.round(r.top)}/${Math.round(r.height)}/${Math.round(sc.height)}` })
  /*
    PLANS TO SETUP, FRAME BY FRAME: the mark, its line and the marks each
    rise and fade in over several frames, one after another, on opacity,
    translate and scale alone. Under SHOTS it is also slowed ten times and
    photographed, a filmstrip for a person to look at.
  */
  const RISE = `(async () => {
    const frames = []
    const t0 = performance.now()
    while (performance.now() - t0 < 1100) {
      await new Promise((r) => requestAnimationFrame(r))
      const parts = [...document.querySelectorAll("[data-onboarding-step='5'] [data-setup-rise]")]
      const leave = document.querySelector("[data-onboarding-leaving]")
      frames.push({ t: Math.round(performance.now() - t0), parts: parts.map((p) => { const cs = getComputedStyle(p); return { o: +Number(cs.opacity).toFixed(3), y: parseFloat((cs.translate || "0 0").split(" ")[1]) || 0, s: parseFloat(cs.scale) || 1 } }), leave: leave ? +Number(getComputedStyle(leave).opacity).toFixed(3) : null })
    }
    return frames
  })()`
  const filmstrip = process.env.SHOTS && ["390", "1440"].includes(label)
  const risePromise = filmstrip ? null : page.evaluate(RISE)
  /* Every animation on the page held at one moment, so a slow screenshot still shows that moment. */
  const holdAt = (ms) => page.evaluate(async (ms) => {
    for (const a of document.getAnimations()) {
      if (!a.effect?.target?.closest?.("[data-onboarding-steps]")) continue
      a.pause()
      a.currentTime = ms
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }, ms)
  const letGo = () => page.evaluate(() => { for (const a of document.getAnimations()) if (a.playState === "paused") a.play() })
  /* Setup's two second phases held while it is photographed (a slow screenshot would miss "Creating your store"), and let go one at a time. */
  if (filmstrip) await page.evaluate(() => {
    const st = window.setTimeout
    const held = []
    window.__nextPhase = () => { const f = held.shift(); if (f) f() }
    window.setTimeout = (f, ms, ...a) => (ms >= 1500 ? (held.push(() => f(...a)), 0) : st(f, ms, ...a))
  })
  await clickText("Start free")
  if (filmstrip) {
    await page.waitForFunction(() => !!document.querySelector("[data-onboarding-setup]"))
    for (const ms of [0, 60, 140, 220, 320, 460, 700]) {
      await holdAt(ms)
      await page.screenshot({ path: join(process.env.SHOTS, `onboarding-rise-${label}-${String(ms).padStart(3, "0")}ms.png`) })
    }
    await letGo()
    /* And the line changing to "Applying your settings", two seconds on. */
    await page.evaluate(() => window.__nextPhase())
    await page.waitForFunction(() => document.querySelector("[data-onboarding-setup]")?.getAttribute("data-onboarding-setup") === "applying", { timeout: 15000 }).catch(() => {})
    for (const ms of [0, 80, 160, 260]) {
      await holdAt(ms)
      await page.screenshot({ path: join(process.env.SHOTS, `onboarding-applying-${label}-${String(ms).padStart(3, "0")}ms.png`) })
    }
    await letGo()
    await page.evaluate(() => { window.__nextPhase(); window.__nextPhase(); window.__nextPhase() })
  }
  const rise = risePromise ? await risePromise : null
  if (rise) {
    const n = rise.find((f) => f.parts.length)?.parts.length ?? 0
    if (n !== 3) problems.push(`${at} the setup screen has ${n} pieces that rise, not three (the mark, its line, the marks)`)
    for (let i = 0; i < n; i++) {
      const part = rise.filter((f) => f.parts[i]).map((f) => f.parts[i])
      const between = part.filter((p) => p.o > 0.02 && p.o < 0.98).length
      const firstSeen = rise.findIndex((f) => f.parts[i] && f.parts[i].o > 0.02)
      if (between < 4) problems.push(`${at} setup piece ${i + 1} appeared in ${between} part-way frames: a cut, not a rise`)
      if (!part.some((p) => p.y > 2)) problems.push(`${at} setup piece ${i + 1} never started below its place`)
      const last = part[part.length - 1]
      if (!last || last.o < 0.99 || Math.abs(last.y) > 0.5 || Math.abs(last.s - 1) > 0.005) problems.push(`${at} setup piece ${i + 1} did not land (${JSON.stringify(last)})`)
      report[`${label}-rise-${i + 1}`] = { firstSeenFrame: firstSeen, partWayFrames: between }
    }
    const order = [0, 1, 2].map((i) => rise.findIndex((f) => f.parts[i] && f.parts[i].o > 0.05))
    if (!(order[0] <= order[1] && order[1] <= order[2])) problems.push(`${at} the setup pieces did not arrive one after another (${order})`)
  }
  await page.waitForFunction(() => !!document.querySelector("[data-onboarding-setup]"), { timeout: 8000 }).catch(() => {})
  await wait(900)
  const setup = await page.evaluate(`(() => { const box = ${box.toString()}
    const wrap = document.querySelector("[data-onboarding-setup]")
    if (!wrap) return null
    const mark = wrap.querySelector("[data-storelib-logo]")
    let clipped = null
    for (let n = mark && mark.parentElement; n && n !== wrap; n = n.parentElement) if (getComputedStyle(n).overflow !== "visible") clipped = n.className
    const shown = wrap.querySelector('[data-morph="on"] h1') || wrap.querySelector("h1")
    const r = document.querySelector("[data-onboarding-footer]").getBoundingClientRect()
    const sc = document.querySelector("[data-onboarding-scroller]").getBoundingClientRect()
    return { state: wrap.getAttribute("data-onboarding-setup"), mark: mark ? box(mark) : null, depth: mark ? getComputedStyle(mark.parentElement).boxShadow : null, clipped, heading: (shown || {}).textContent, foot: Math.round(r.top) + "/" + Math.round(r.height) + "/" + Math.round(sc.height) }
  })()`)
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `onboarding-setup-${label}.png`) })
  if (!setup) problems.push(`${at} Start free did not reach the setup screen`)
  else {
    if (!setup.mark) problems.push(`${at} the setup screen has no Storelib mark`)
    /* Round 12: "the Storelib icon on that step a little smaller with a little depth (phones especially)": 54 and 62px, from 61 and 68. */
    else if (setup.mark.w !== (phone ? 54 : 62)) problems.push(`${at} the mark is ${setup.mark.w}px, not ${phone ? 54 : 62}`)
    if (!/rgba\(26, 26, 46, 0\.3\)/.test(setup.depth || "")) problems.push(`${at} the mark has no depth under it (${setup.depth})`)
    if (setup.clipped) problems.push(`${at} the mark sits in a box that clips it (${setup.clipped})`)
    if (setup.foot !== footAtPlan) problems.push(`${at} the panel and the row of buttons moved as setup began (${footAtPlan} on the plan step, ${setup.foot} on setup)`)
  }

  report[label] = {
    gap: top.gap, backMid: top.back?.midY, barMid: top.bar.midY, backBox: top.back ? `${top.back.w}x${top.back.h}` : null,
    room: [top.leftRoom, top.rightRoom], card, slowed: { fadeFrames: fading, slidePositions: sliding, leastMax, leastSum, both, swapCurve }, full: swapFull, animates: swap.props,
    footer: footer.buttons.map((b) => `${b.label} ${b.x}-${b.right}`), sideways: footer.sideways,
    plans, planScrollRoom: edges.room, edgesScrolled: edges.middle, setup: setup && { state: setup.state, mark: setup.mark && setup.mark.w, depth: setup.depth, heading: setup.heading, foot: setup.foot, footAtPlan },
  }
  if (errors.length) problems.push(`${at} ${errors.length} error(s): ${errors[0]}`)
  await page.close()
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: the way back and the bar keep their distance on one line, the buttons fit a 320px phone, and a step fades and slides on opacity and translate inside a panel that holds still")
