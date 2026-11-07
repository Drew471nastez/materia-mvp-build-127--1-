/**
 * ===========================================================================
 *  ROUND AL: THE ADD BLOCK SHEET AND THE APP BLOCKS, IN A BROWSER
 * ===========================================================================
 * scripts/render-onepage-app-blocks.tsx at 390px on a phone and at 1440px:
 *
 *   ROWS       one per row: every row as wide as the list, no two on a line
 *   TILES      round, 46px, each in a colour (never the old grey), several
 *              distinct colours on one screen; Instagram on its gradient;
 *              Google Maps in its own four colours
 *   CHIPS      Essentials ... Text, then View all; a chip shows its section
 *   SEARCH     "maps" finds Google Maps first
 *   BLOCKS     each app block layout drawn, none wider than its column, and
 *              the page never scrolls sideways
 *
 *   node scripts/check-onepage-app-blocks.mjs
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
const work = join(root, ".onepage-app-blocks-probe")
mkdirSync(work, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-appblocks-")), "shots")
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
    "esbuild", "scripts/render-onepage-app-blocks.tsx", "--bundle", "--format=iife", "--jsx=automatic",
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
  await page.setRequestInterception(true)
  page.on("request", (r) => (r.url().startsWith("file:") ? r.continue() : r.respond({ status: 200, contentType: "text/html", body: "" })))
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`file://${join(work, "index.html")}`)
  await page.waitForSelector("[data-add-block-picker]")
  await sleep(600)

  const chips = await page.$$eval("[data-picker-chip]", (els) => els.map((e) => e.textContent.trim()))
  expect(chips.join(",") === "Essentials,Commerce,Social,Media,Contact,Events,Text,View all", "the chips, View all last", chips)

  const rows = await page.evaluate(() => {
    const list = document.querySelector("[data-picker-list]")
    const lw = list.getBoundingClientRect()
    const shown = [...document.querySelectorAll("[data-picker-section][data-shown] [data-picker-entry]")]
    const rects = shown.map((r) => r.getBoundingClientRect())
    const tops = rects.map((r) => Math.round(r.top))
    return { n: shown.length, minW: Math.round(Math.min(...rects.map((r) => r.width))), listW: Math.round(lw.width), sameLine: tops.length - new Set(tops).size }
  })
  expect(rows.n >= 10 && rows.sameLine === 0 && rows.minW >= rows.listW - 40, "ONE PER ROW: each row the list's width, none side by side", rows)

  const tiles = await page.evaluate(() => {
    const t = [...document.querySelectorAll("[data-picker-section][data-shown] [data-round-tile]")]
    const cs = t.map((e) => getComputedStyle(e))
    const box = t.map((e) => e.getBoundingClientRect())
    return {
      n: t.length,
      sizes: [...new Set(box.map((b) => `${Math.round(b.width)}x${Math.round(b.height)}`))],
      round: cs.every((c) => c.borderRadius === "9999px" || parseFloat(c.borderTopLeftRadius) >= 23),
      colours: [...new Set(cs.map((c) => (c.backgroundImage !== "none" ? c.backgroundImage.slice(0, 15) : c.backgroundColor)))],
      grey: cs.filter((c) => c.backgroundColor === "rgb(242, 242, 244)").length,
      chevrons: document.querySelectorAll("[data-picker-section][data-shown] [data-picker-entry] svg.lucide-chevron-right").length,
    }
  })
  expect(tiles.sizes.join() === "46x46" && tiles.round, "TILES: round, 46px", tiles.sizes)
  expect(tiles.grey === 0 && tiles.colours.length >= 8, "in colour, never the old grey, many colours", { distinct: tiles.colours.length, grey: tiles.grey })
  expect(tiles.chevrons === rows.n, "a chevron on every row", tiles.chevrons)
  const ig = await page.$eval('[data-picker-entry="app_instagram"] [data-round-tile]', (e) => getComputedStyle(e).backgroundImage)
  expect(ig.startsWith("radial-gradient"), "Instagram on its own gradient", ig.slice(0, 40))
  if (label === "phone-390") await page.screenshot({ path: join(shots, `${label}-essentials.png`), clip: await page.$eval('[data-probe="picker"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }) })

  await page.click('[data-picker-chip="contact"]')
  await sleep(300)
  const contact = await page.evaluate(() => ({ shown: [...document.querySelectorAll("[data-picker-section][data-shown]")].map((s) => s.getAttribute("data-picker-section")), maps: [...document.querySelectorAll('[data-picker-entry="map"] [data-mark="google-maps"] path')].map((p) => p.getAttribute("fill")) }))
  expect(contact.shown.join() === "contact", "a chip shows its own section", contact.shown)
  expect(new Set(contact.maps).size === 5, "Google Maps in its own colours", contact.maps)
  await page.screenshot({ path: join(shots, `${label}-contact.png`) })

  await page.click('[data-picker-chip="all"]')
  await sleep(300)
  const all = await page.$$eval("[data-picker-section][data-shown]", (els) => els.map((s) => s.getAttribute("data-picker-section")))
  expect(["essentials", "commerce", "social", "media", "contact", "events", "text"].every((s) => all.includes(s)), "View all shows every section", all)

  await page.type("[data-picker-search]", "maps")
  await sleep(200)
  const first = await page.$eval("[data-picker-found] [data-picker-entry]", (e) => e.getAttribute("data-picker-entry"))
  expect(first === "map", "SEARCH: maps finds Google Maps first", first)

  const blocks = await page.evaluate(() => [...document.querySelectorAll("[data-probe-block]")].map((w) => {
    const r = w.getBoundingClientRect()
    const inner = w.querySelector("[data-onepage-app]")
    const ir = inner ? inner.getBoundingClientRect() : null
    return { id: w.getAttribute("data-probe-block"), layout: inner?.getAttribute("data-app-layout"), h: ir ? Math.round(ir.height) : 0, over: ir ? Math.round(ir.width - r.width) : 0 }
  }))
  const missing = blocks.filter((b) => !b.layout || b.h < 30)
  expect(missing.length === 0, "BLOCKS: every app block drawn", missing.length ? missing : blocks.map((b) => `${b.id}:${b.layout}:${b.h}`))
  expect(blocks.every((b) => b.over <= 1), "none wider than its column", blocks.filter((b) => b.over > 1))
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sideways <= 0, "the page never scrolls sideways", sideways)
  await page.$eval('[data-probe="live"]', (e) => e.scrollIntoView())
  await page.screenshot({ path: join(shots, `${label}-blocks.png`), fullPage: true })

  const vote = await page.evaluate(() => {
    document.querySelector('[data-poll-option="b"]').click()
    return new Promise((r) => setTimeout(() => r({ checked: document.querySelector('[data-poll-option="b"]').getAttribute("aria-checked"), thanks: !!document.querySelector("[data-poll-thanks]") }), 150))
  })
  expect(vote.checked === "true" && vote.thanks, "a vote is taken once and thanked", vote)
  expect(errors.length === 0, "no page errors", errors)
  await page.close()
}
await browser.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall passed")
process.exit(broken ? 1 : 0)
