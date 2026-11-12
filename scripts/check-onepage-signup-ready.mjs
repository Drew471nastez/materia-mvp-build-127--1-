/**
 * EVERY ONEPAGE SUBSCRIBE BUTTON WAITS FOR AN ADDRESS (round AS).
 *
 * The owner: "Subscribe should be disabled until a valid email is entered,
 * then become clickable with a smooth state change." On the live page (the
 * real PublicOnePage, scripts/render-onepage-editor.tsx ?live) the email
 * block in six layouts (Classic's row, Cover's stack, Bold, Simple,
 * Connect's pill, Personal note's line), and the header's Subscribe sheet
 * and a free gift's form (scripts/render-onepage-signup-ready.tsx). For each:
 *
 *   empty       the button is disabled and faded
 *   "anna@"     still disabled; "anna@site" still; "anna@site.c" still
 *   valid       "anna@site.co" enables it, and its opacity eases there over
 *               more than one frame (a frame between the two is drawn)
 *   cleared     disabled again
 *
 *   CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/check-onepage-signup-ready.mjs
 */
import puppeteer from "puppeteer-core"
import { existsSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/tmp/chromium"].find((p) => existsSync(p))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const LAYOUTS = ["default", "cover", "bold", "minimal", "connect", "letter"]
const blocks = LAYOUTS.map((layout, i) => ({
  id: `e-${layout}`,
  type: "email_capture",
  enabled: true,
  sort_order: i,
  data: { headline: `Join (${layout})`, description: "Updates now and then", placeholder: "Enter your email", button_text: "Subscribe", success_message: "Thanks!", button_preset: "subscribe", custom_button_text: "", enable_digital_product: false, layout_type: layout, animation_type: "none" },
}))

const live = await serveEditorProbe({ blocks })
const sheets = await serveEditorProbe({ entry: "scripts/render-onepage-signup-ready.tsx" })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] })

/* The button's state now, and its opacity every frame for 260ms after `act` runs. */
async function state(page, input, button) {
  return page.evaluate(
    (i, b) => {
      const btn = document.querySelector(b)
      /* What shows: its opacity times a filter's (the page's button fades by filter: lib/onepage/email-signup signupWait). */
      const cs = getComputedStyle(btn)
      const f = /opacity\(([\d.]+)\)/.exec(cs.filter)
      return { disabled: btn.disabled, opacity: Math.round(Number(cs.opacity) * (f ? Number(f[1]) : 1) * 1000) / 1000 }
    },
    input,
    button,
  )
}

async function run(page, label, input, button) {
  await page.waitForSelector(input)
  await page.$eval(input, (el) => el.scrollIntoView({ block: "center" }))
  /* The page's own arrival (each block fades in as it comes into view) settled first. */
  await page.waitForFunction((b) => document.querySelector(b)?.closest("[data-block-id], main, body").getAnimations({ subtree: true }).length === 0, { timeout: 4000 }, button).catch(() => null)
  /* No pointer resting on a button (a hover changes its look), and its own easing done. */
  await page.mouse.move(2, 2)
  await sleep(320)
  await page.waitForFunction((b) => document.querySelector(b).getAnimations().every((a) => a.playState === "finished"), { timeout: 3000, polling: "raf" }, button).catch(() => console.log("     (still easing after 3s)"))
  const empty = await state(page, input, button)

  check(empty.disabled && empty.opacity < 0.6, `${label}: empty, the button is disabled and faded (${empty.opacity})`)
  const partial = []
  for (const part of ["anna@", "site", ".c"]) {
    await page.type(input, part)
    await sleep(30)
    partial.push((await state(page, input, button)).disabled)
  }
  check(partial.every(Boolean), `${label}: "anna@", "anna@site" and "anna@site.c" keep it disabled`)
  const frames = page.evaluate(
    (b) =>
      new Promise((done) => {
        const out = []
        const t0 = performance.now()
        const tick = () => {
          const cs = getComputedStyle(document.querySelector(b))
          const f = /opacity\(([\d.]+)\)/.exec(cs.filter)
          out.push(Math.round(Number(cs.opacity) * (f ? Number(f[1]) : 1) * 100) / 100)
          if (performance.now() - t0 < 320) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }),
    button,
  )
  await page.type(input, "o")
  const seen = await frames
  const valid = await state(page, input, button)
  const between = seen.filter((o) => o > Math.min(empty.opacity, 0.6) + 0.02 && o < 0.98)
  check(!valid.disabled && valid.opacity > 0.98, `${label}: "anna@site.co" enables it (${valid.opacity})`)
  check(between.length >= 2, `${label}: it eases in over frames (${seen.join(" ")})`)
  await page.click(input, { clickCount: 3 })
  await page.keyboard.press("Backspace")
  await sleep(250)
  const cleared = await state(page, input, button)
  check(cleared.disabled, `${label}: cleared, disabled again`)
}

for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1440, height: 900 }]) {
  const at = vp.width
  const page = await browser.newPage()
  await page.setViewport(vp)
  await page.goto(`${live.base}/app/onepage?live`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-email-form]")
  await sleep(600)
  for (const layout of LAYOUTS) {
    const id = await page.evaluate((h) => {
      const head = [...document.querySelectorAll("h1,h2,h3,h4,p,span")].find((e) => e.textContent.trim() === h)
      /* The nearest box around the headline that holds a form: that block's own. */
      let form = null
      for (let n = head; n && !form; n = n.parentElement) form = n.querySelector("form[data-email-form]")
      if (!form) return null
      form.setAttribute("data-probe-form", h)
      return h
    }, `Join (${layout})`)
    if (!id) {
      check(false, `${at} ${layout}: form found`)
      continue
    }
    const scope = `form[data-probe-form="${id}"]`
    await run(page, `${at} email block, ${layout}`, `${scope} input[type=email]`, `${scope} button[data-email-ready], ${scope} button[type=submit]`)
  }
  await page.close()

  const p2 = await browser.newPage()
  await p2.setViewport(vp)
  await p2.goto(`${sheets.base}/app/onepage`, { waitUntil: "domcontentloaded" })
  await p2.waitForSelector("[data-probe-subscribe]")
  await p2.click("[data-probe-subscribe]")
  await sleep(500)
  await run(p2, `${at} Subscribe sheet`, "#onepage-subscribe-email", "#onepage-subscribe-email ~ button[type=submit]")
  const gift = await p2.$("[data-probe='gift'] button")
  if (gift) {
    await p2.keyboard.press("Escape")
    await sleep(400)
    await gift.click()
    await sleep(600)
    await run(p2, `${at} free gift`, "input[type=email][autocomplete=email]:not(#onepage-subscribe-email)", "form:has(input[autocomplete=email]:not(#onepage-subscribe-email)) button[type=submit]")
  } else check(false, `${at} free gift: button found`)
  await p2.close()
}

await browser.close()
live.server.close()
sheets.server.close()
if (failures.length && !report) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log(failures.length ? `\n${failures.length} over (REPORT)` : "\nall passed")
