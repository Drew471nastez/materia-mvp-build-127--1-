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
await browser.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
