/**
 * ===========================================================================
 *  THE ONEPAGE'S NEWER BLOCKS, IN A BROWSER
 * ===========================================================================
 * scripts/render-onepage-blocks.tsx at 390px on a phone and at 1440px:
 *
 *   HEADING    drawn, in the page's own text colour
 *   FAQ        closed to its questions; a press opens one by its height and
 *              the answer keeps its line breaks; a second press closes it
 *   COUNTDOWN  four boxes that tick; one that has passed says its own line
 *   MAP        a map and an Open in Maps button to Google Maps
 *   VIDEO      a picture and a play button, no player, until pressed
 *   SENSITIVE  a press is held and asked about; Go back leaves the page as it
 *              was; Continue runs the link's own click, once
 *   EDITOR     the sensitive switch and the schedule (a day from the month
 *              grid and a typed time) write the block
 *   PAGE       nothing scrolls sideways
 *
 *   PROBE_CSS=source node scripts/check-onepage-blocks.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const css = await appCss(root)
const work = join(root, ".onepage-blocks-probe")
mkdirSync(work, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-onepage-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

execFileSync(
  "npx",
  [
    "esbuild", "scripts/render-onepage-blocks.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    "--banner:js=var process={env:{NODE_ENV:'production'}};",
    `--outfile=${join(work, "app.js")}`, "--log-level=error",
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
)
const js = readFileSync(join(work, "app.js"), "utf8")
writeFileSync(
  join(work, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
for (const [label, vp] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["desktop-1440", { width: 1440, height: 900 }],
]) {
  console.log(`\n${label}`)
  const page = await browser.newPage()
  await page.setViewport(vp)
  /* The map and the video's picture come from Google; the probe answers them itself so it runs offline. */
  await page.setRequestInterception(true)
  page.on("request", (r) => (r.url().startsWith("file:") ? r.continue() : r.respond({ status: 200, contentType: "text/html", body: "" })))
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`file://${join(work, "index.html")}`)
  await page.waitForSelector('[data-probe="live"]')
  await sleep(1300)

  const heading = await page.$eval('[data-probe-block="heading"] h2', (h) => ({ text: h.textContent, color: getComputedStyle(h).color, size: parseFloat(getComputedStyle(h).fontSize) }))
  expect(heading.text === "Shop my picks" && heading.color === "rgb(26, 26, 46)" && heading.size === 22, "HEADING in the page's text colour, large", heading)

  const faq = '[data-probe-block="faq"]'
  const closedH = await page.$eval(faq, (e) => e.getBoundingClientRect().height)
  await page.click(`${faq} button[aria-expanded]`)
  await sleep(450)
  const open = await page.$eval(faq, (e) => ({ h: e.getBoundingClientRect().height, expanded: e.querySelector("button[aria-expanded]").getAttribute("aria-expanded"), ws: getComputedStyle(e.querySelector("p.whitespace-pre-line")).whiteSpace }))
  expect(open.expanded === "true" && open.h > closedH + 20 && open.ws === "pre-line", "FAQ opens by its height and keeps line breaks", { closedH, ...open })
  await page.click(`${faq} button[aria-expanded]`)
  await sleep(450)
  const again = await page.$eval(faq, (e) => e.getBoundingClientRect().height)
  expect(Math.abs(again - closedH) < 1, "and closes back", { again, closedH })

  const tick1 = await page.$eval('[data-probe-block="countdown"]', (e) => e.textContent)
  await sleep(1100)
  const tick2 = await page.$eval('[data-probe-block="countdown"]', (e) => e.textContent)
  expect(/02days/.test(tick1) && !tick1.includes("--") && tick1 !== tick2, "COUNTDOWN counts days and ticks", [tick1, tick2])
  const ended = await page.$$eval('[data-probe-block="countdown"]', (els) => els[1].textContent)
  expect(ended === "Out now", "a passed countdown says its own line", ended)

  const map = await page.$eval('[data-probe-block="map"]', (e) => ({ iframe: e.querySelector("iframe")?.src || "", button: e.querySelector("a")?.href || "" }))
  expect(map.iframe.includes("maps.google.com/maps?q=Strada%20Lipscani") && map.button.startsWith("https://www.google.com/maps/search/?api=1&query="), "MAP and its Open in Maps button", map)

  const v0 = await page.$eval('[data-probe-block="video"]', (e) => ({ iframes: e.querySelectorAll("iframe").length, poster: e.querySelector("img")?.src || "" }))
  expect(v0.iframes === 0 && v0.poster.includes("i.ytimg.com/vi/dQw4w9WgXcQ"), "VIDEO is a picture until pressed", v0)
  await page.click('[data-probe-block="video"] button')
  await sleep(200)
  const v1 = await page.$eval('[data-probe-block="video"] iframe', (f) => f.src)
  expect(v1.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "and plays on the page", v1)

  await page.click('[data-probe="sensitive"] a')
  await sleep(250)
  const asked = await page.evaluate(() => ({ dialog: !!document.querySelector('[data-onepage-sensitive]'), clicks: window.__clicks, hash: location.hash }))
  expect(asked.dialog && asked.clicks === 0 && asked.hash === "", "SENSITIVE: the press is held and asked about", asked)
  await page.evaluate(() => [...document.querySelectorAll('[data-onepage-sensitive] button')].find((b) => b.textContent.trim() === "Go back").click())
  await sleep(150)
  const back = await page.evaluate(() => ({ dialog: !!document.querySelector('[data-onepage-sensitive]'), clicks: window.__clicks, hash: location.hash }))
  expect(!back.dialog && back.clicks === 0 && back.hash === "", "Go back leaves it as it was", back)
  await page.click('[data-probe="sensitive"] a')
  await sleep(250)
  if (label === "phone-390") await page.screenshot({ path: join(shots, `${label}-sensitive.png`) })
  await page.evaluate(() => [...document.querySelectorAll('[data-onepage-sensitive] button')].find((b) => b.textContent.trim() === "Continue").click())
  await sleep(150)
  const went = await page.evaluate(() => ({ dialog: !!document.querySelector('[data-onepage-sensitive]'), clicks: window.__clicks, hash: location.hash }))
  expect(!went.dialog && went.clicks === 1 && went.hash === "#opened", "Continue runs the link's own click, once", went)

  const small = await page.$eval('[data-probe="small"] h2', (h) => parseFloat(getComputedStyle(h).fontSize))
  expect(Math.abs(small - 17.6) < 0.2, "the editor's small phone draws them at 0.8", small)

  /* The sensitive switch, then the schedule: a day from the month grid and a typed 10:00 AM (components/onepage/date-time-field). */
  await page.click('[data-probe="editor"] [data-sensitive-switch]')
  await page.click('[data-probe="editor"] [data-schedule-toggle]')
  await sleep(150)
  /* Pressed through the DOM: this page is wider than the phone (its two columns), so the sheet sits partly outside the visible part. */
  const press = (sel) => page.$eval(sel, (b) => b.click())
  await press('[data-probe="editor"] [data-datetime-field="Show from"]')
  await sleep(600)
  await press("[data-datetime-panel] [data-month-next]")
  await sleep(100)
  const day = await page.$eval("[data-datetime-panel] [data-day$='-02']", (b) => b.getAttribute("data-day"))
  await press(`[data-datetime-panel] [data-day="${day}"]`)
  await sleep(100)
  await page.$eval("[data-datetime-panel] [data-time-hour]", (e) => e.focus())
  await page.keyboard.type("10")
  await page.keyboard.type("00")
  await press('[data-datetime-panel] [data-time-ampm="AM"]')
  await press("[data-datetime-panel] [data-datetime-done]")
  await sleep(600)
  const state = JSON.parse(await page.$eval('[data-probe="state"]', (e) => e.textContent))
  const expected = await page.evaluate((d) => new Date(`${d}T10:00`).toISOString(), day)
  const badge = await page.$eval('[data-probe="editor"]', (e) => e.textContent.includes("Starts "))
  expect(state.sensitive === true && state.schedule?.start_at === expected && badge, "EDITOR: the switch and the schedule write the block", { state, expected })

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(sideways <= 0, "PAGE does not scroll sideways", sideways)
  expect(errors.length === 0, "no errors on the page", errors)
  await page.screenshot({ path: join(shots, `${label}.png`), fullPage: true })
  await page.close()
}

/*
 * ROUND 10, IN THE SAME BROWSER (scripts/render-onepage-creator-blocks.tsx):
 *
 *   + ROTATION  under a mouse the + turns 0 to 360 on the `rotate` property,
 *               every frame further on than the last, in about 600ms, and
 *               back to 0 when the pointer leaves; it rests at 405 (the
 *               sheet's x) while the sheet is up; reduced motion has no
 *               transition; a phone (coarse pointer) never turns on a tap.
 *   PICKER      a dialog at 1440, the shared bottom sheet at 390 (CPU 4x),
 *               up within a few frames of the press; six categories, search,
 *               a chip shows one category, a pick is remembered first.
 *   BLOCKS      course, music, testimonials and the contact form, live and
 *               as the editor's preview: the live form sends to the website
 *               contact route with its spam fields; the preview never sends.
 */
execFileSync(
  "npx",
  [
    "esbuild", "scripts/render-onepage-creator-blocks.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    "--banner:js=var process={env:{NODE_ENV:'production'}};",
    `--outfile=${join(work, "app10.js")}`, "--log-level=error",
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
)
const html10 = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${readFileSync(join(work, "app10.js"), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const rotationOf = () => parseFloat(getComputedStyle(document.querySelector("[data-add-block] svg")).rotate) || 0
for (const [label, vp, phone] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
  ["desktop-1440", { width: 1440, height: 900 }, false],
]) {
  console.log(`\nround 10, ${label}`)
  /* Headless Chrome has no hover and no fine pointer of its own; a computer is given a mouse's, as scripts/check-editor-live.mjs does. */
  /* No setViewport for it: its touch override takes the hover back (scripts/check-block-list.mjs). */
  const mouseBrowser = phone ? null : await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", "--disable-gpu", `--window-size=${vp.width},${vp.height}`, "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"] })
  const page = await (mouseBrowser ?? browser).newPage()
  if (phone) await page.setViewport(vp)
  const cdp = await page.createCDPSession()
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const sent = []
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = r.url()
    if (u === "http://probe.test/") return r.respond({ status: 200, contentType: "text/html", body: html10 })
    if (u.endsWith("/api/website-builder/contact")) {
      sent.push(JSON.parse(r.postData() || "{}"))
      return r.respond({ status: 200, contentType: "application/json", body: '{"ok":true}' })
    }
    return r.respond({ status: 200, contentType: "text/html", body: "" })
  })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto("http://probe.test/")
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  await page.reload()
  await page.waitForSelector("[data-add-block] svg")
  await sleep(800)

  /* The + under the pointer: sampled every frame from the moment it is entered. */
  const sample = (ms) => page.evaluate((ms) => {
    window.__sample = new Promise((resolve) => {
      const svg = document.querySelector("[data-add-block] svg")
      const out = []
      const t0 = performance.now()
      const f = () => {
        out.push([Math.round(performance.now() - t0), parseFloat(getComputedStyle(svg).rotate) || 0])
        if (performance.now() - t0 < ms) requestAnimationFrame(f)
        else resolve(out)
      }
      requestAnimationFrame(f)
    })
  }, ms)
  const box = await page.$eval("[data-add-block]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  if (!phone) {
    await page.mouse.move(box.x, box.y - 200)
    await sleep(100)
    await sample(900)
    await page.mouse.move(box.x, box.y)
    const turn = await page.evaluate(() => window.__sample)
    const values = turn.map(([, v]) => v)
    const moving = values.filter((v) => v > 0.5 && v < 359.5)
    const forward = values.every((v, i) => i === 0 || v >= values[i - 1] - 0.01)
    const done = turn.find(([, v]) => v >= 359.5)?.[0] ?? null
    const gaps = turn.slice(1).map(([t], i) => t - turn[i][0]).filter((_, i) => values[i] > 0.5 && values[i] < 359.5)
    const worst = gaps.length ? Math.max(...gaps) : null
    expect(values.at(-1) >= 359.5 && forward && moving.length >= 20 && done !== null && done >= 450 && done <= 750, "+ ROTATION: a full turn under the mouse, every frame further on, in about 600ms", { frames: moving.length, done, end: values.at(-1), worstGapMs: worst })
    expect(worst !== null && worst <= 34, "and no frame of it is dropped twice over (main thread, 60Hz headless)", worst)
    await sample(900)
    await page.mouse.move(box.x, box.y - 200)
    const back = await page.evaluate(() => window.__sample)
    const bv = back.map(([, v]) => v)
    expect(bv.at(-1) <= 0.5 && bv.every((v, i) => i === 0 || v <= bv[i - 1] + 0.01) && bv.filter((v) => v > 0.5 && v < 359.5).length >= 20, "and turns smoothly back when the pointer leaves", { end: bv.at(-1), frames: bv.filter((v) => v > 0.5 && v < 359.5).length })
    const prop = await page.$eval("[data-add-block] svg", (s) => ({ property: getComputedStyle(s).transitionProperty, duration: getComputedStyle(s).transitionDuration, ease: getComputedStyle(s).transitionTimingFunction }))
    expect(prop.property === "rotate" && prop.duration === "0.6s" && prop.ease === "cubic-bezier(0.4, 0, 0.2, 1)", "only `rotate` moves, 600ms, one ease in and out", prop)
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const reduced = await page.$eval("[data-add-block] svg", (s) => getComputedStyle(s).transitionProperty)
    expect(reduced === "none", "reduced motion: no transition", reduced)
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
    await page.mouse.move(box.x, box.y - 200)
    await sleep(700)
  } else {
    /* A finger has no hover: the + only goes to the sheet's x and back, never round. */
    await page.touchscreen.tap(box.x, box.y)
    await sleep(1400)
    await page.keyboard.press("Escape")
    await sleep(1400)
    const r0 = await page.evaluate(rotationOf)
    const fine = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)
    expect(r0 === 0 && !fine, "+ on a phone: no hover turn, and back to 0 once the sheet is gone", { r0, fine })
  }

  /* The sheet: from the press to the picker on screen, in frames. */
  await page.evaluate(() => { window.__t0 = performance.now() })
  if (phone) await page.touchscreen.tap(box.x, box.y)
  else await page.mouse.click(box.x, box.y)
  const upMs = await page.evaluate(() => new Promise((resolve) => {
    const f = () => {
      const el = document.querySelector("[data-add-block-picker]")
      const r = el?.getBoundingClientRect()
      if (r && r.height > 100 && r.top < innerHeight - 100) resolve(Math.round(performance.now() - window.__t0))
      else requestAnimationFrame(f)
    }
    f()
  }))
  await page.waitForFunction(() => Math.abs((parseFloat(getComputedStyle(document.querySelector("[data-add-block] svg")).rotate) || 0) - 405) < 0.5, { timeout: 3000 }).catch(() => {})
  await sleep(phone ? 500 : 200)
  const sheet = await page.evaluate(() => {
    const el = document.querySelector("[data-add-block-picker]")
    const panel = el.closest('[role="dialog"]') || el.parentElement
    const r = panel.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), sections: [...el.querySelectorAll("[data-picker-section]")].map((s) => s.getAttribute("data-picker-section")), chips: [...el.querySelectorAll("[data-picker-chip]")].map((c) => c.getAttribute("data-picker-chip")), tiles: el.querySelectorAll("[data-block-tile]").length }
  })
  const plusOpen = await page.evaluate(rotationOf)
  expect(upMs <= (phone ? 700 : 300), `PICKER is on screen ${upMs}ms after the press`, upMs)
  expect(Math.abs(plusOpen - 405) < 0.5, "and the + rests at the sheet's x (405)", plusOpen)
  expect(sheet.sections.join() === "essentials,sell,media,grow,integrations,links" && sheet.chips.join() === "all,essentials,sell,media,grow,integrations,links", "six categories, as chips and as sections", sheet)
  expect(phone ? sheet.bottom >= vp.height - 2 && sheet.width >= vp.width - 2 : sheet.width <= 640 && sheet.top > 0 && sheet.bottom < vp.height, phone ? "a bottom sheet on a phone" : "a dialog on a computer", sheet)
  await sleep(600)
  await page.screenshot({ path: join(shots, `${label}-picker.png`) })

  await page.type("[data-add-block-picker] input[type=search]", "newsletter")
  await sleep(200)
  const first = await page.$eval("[data-add-block-picker] [data-picker-entry]", (e) => e.getAttribute("data-picker-entry"))
  expect(first === "email_capture", "search: newsletter finds Email signup first", first)
  await page.$eval("[data-add-block-picker] button[aria-label='Clear search']", (b) => b.click())
  await sleep(150)
  await page.$eval("[data-picker-chip='sell']", (b) => b.click())
  await sleep(150)
  const sell = await page.$$eval("[data-add-block-picker] [data-picker-section]", (els) => els.map((e) => e.getAttribute("data-picker-section")))
  expect(sell.join() === "sell", "a chip shows its category alone", sell)
  if (!phone) await page.screenshot({ path: join(shots, `${label}-picker-sell.png`) })
  await page.$eval("[data-picker-entry='course']", (b) => b.click())
  await sleep(phone ? 1000 : 500)
  if (phone) await page.touchscreen.tap(box.x, box.y)
  else await page.mouse.click(box.x, box.y)
  await sleep(phone ? 900 : 400)
  const recent = await page.$$eval("[data-picker-section='recent'] [data-picker-entry]", (els) => els.map((e) => e.getAttribute("data-picker-entry")))
  const picked = await page.evaluate(() => window.__picked)
  expect(picked.join() === "course" && recent[0] === "course", "a pick adds that block, and it is first under Recently used next time", { picked, recent })
  await page.keyboard.press("Escape")
  await sleep(phone ? 900 : 400)

  /* The blocks, live and in the editor's preview. */
  const course = await page.$eval('[data-probe-block="course"] a', (a) => ({ href: a.getAttribute("href"), text: a.textContent, img: !!a.querySelector("img") }))
  expect(course.href === "/p/mixing" && /12 lessons/.test(course.text) && /49/.test(course.text) && course.img, "COURSE: cover, title, lessons and price, opening its page", course)
  const music = await page.$eval('[data-probe-block="music"] iframe', (f) => ({ src: f.src, h: f.getBoundingClientRect().height, lazy: f.loading }))
  expect(music.src.startsWith("https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT") && Math.round(music.h) === 152 && music.lazy === "lazy", "MUSIC: Spotify's own player at its own height", music)
  const quotes = await page.$eval('[data-probe-block="testimonials"]', (e) => ({ n: e.querySelectorAll("figure").length, snap: getComputedStyle(e.querySelector("figure").parentElement).scrollSnapType, stars: e.querySelectorAll("svg").length }))
  expect(quotes.n === 2 && quotes.snap.startsWith("x") && quotes.stars >= 10, "TESTIMONIALS: two quotes that slide, with their stars", quotes)
  const form = '[data-probe-block="contact_form"]'
  await page.type(`${form} input[aria-label="Your name"]`, "Ana")
  await page.type(`${form} input[type=email]`, "ana@example.com")
  await page.type(`${form} textarea`, "Do you mix vocals?")
  await page.$eval(`${form} button[type=submit]`, (b) => b.click())
  await sleep(400)
  const after = await page.$eval(form, (e) => e.textContent)
  const body = sent[0] || {}
  expect(sent.length === 1 && body.creator_id === "0b1c2d3e-0000-4000-8000-000000000001" && body.page === "onepage" && body.company === "" && typeof body.elapsed === "number" && body.message === "Do you mix vocals?" && /Thanks/.test(after), "CONTACT: sent to the website contact route with its spam fields, then thanks", { body, after })
  const pform = '[data-probe-preview="contact_form"]'
  await page.type(`${pform} input[type=email]`, "ana@example.com")
  await page.type(`${pform} textarea`, "Hi")
  await page.$eval(`${pform} button[type=submit]`, (b) => b.click())
  await sleep(300)
  const ptext = await page.$eval(pform, (e) => e.textContent)
  expect(sent.length === 1 && /live page/.test(ptext), "and the editor's preview never sends", { sent: sent.length })
  const both = await page.evaluate(() => ["course", "music", "testimonials", "contact_form"].map((t) => [t, !!document.querySelector(`[data-probe-block="${t}"] > *`), !!document.querySelector(`[data-probe-preview="${t}"] > *`)]))
  expect(both.every(([, a, b]) => a && b), "each new block draws live and in the preview", both)
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(sideways <= 0, "PAGE does not scroll sideways", sideways)
  expect(errors.length === 0, "no errors on the page", errors)
  await page.screenshot({ path: join(shots, `${label}-blocks.png`), fullPage: true })
  await page.close()
  await mouseBrowser?.close()
}
await browser.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
