/**
 * THE PROFILE BAR AFTER A THEME IS PICKED (round 17).
 *
 * The owner's picture: in the editor, picking a theme left the profile bar
 * (components/onepage/hero-scroll HeroTopBar) fully shown over the top of a
 * page that had not been scrolled. The bar follows the name's place on the
 * page; a pick draws a new header, the name it followed was gone, and the bar
 * fell back to shown. This picks theme after theme in the real editor
 * (Classic and Hero, light and dark) and reads the bar inside the preview
 * frame at the top of the page, after each pick: it must be hidden (opacity 0)
 * and take no pointer. Then it scrolls the preview past the header and reads
 * that the bar does form, so the fix did not just switch it off.
 *
 *   node scripts/check-onepage-topbar-theme-pick.mjs
 *   SCRIPT=1 node scripts/check-onepage-topbar-theme-pick.mjs   (the script's way, without scroll timelines)
 */
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`); if (!ok) failed++ }

const blocks = [{ id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } }, ...Array.from({ length: 24 }, (_, i) => ({ id: `l${i}`, type: "link_button", enabled: true, sort_order: i, data: { label: `Link ${i + 1}`, url: `https://example.com/${i}` } }))]
const { base, server } = await serveEditorProbe({ blocks, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const p = await browser.newPage()
/*
  SCRIPT=1: as a browser without scroll timelines draws it (the script writes the bar from the scroll, as WebKit
  versions without view timelines do). Both ways are run by default.
*/
if (process.env.SCRIPT === "1") {
  await p.evaluateOnNewDocument(() => {
    const real = CSS.supports.bind(CSS)
    CSS.supports = (...a) => (/animation-timeline|timeline-scope/.test(a.join(" ")) ? false : real(...a))
  })
}
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`${base}/app/onepage#design`)
await p.waitForSelector('[data-nav-row="theme"]', { timeout: 60000 })
await sleep(800)
await p.click('[data-nav-row="theme"]')
await p.waitForSelector("[data-theme-card]", { timeout: 30000 })
await sleep(800)

const frameOf = async () => {
  const handle = await p.$("[data-onepage-preview-frame][data-drawn]")
  return handle && (await handle.contentFrame())
}
const barAt = async (frame) => frame.evaluate(() => {
  const bar = document.querySelector("[data-op-topbar]")
  if (!bar) return null
  return { opacity: getComputedStyle(bar).opacity, events: getComputedStyle(bar).pointerEvents, state: bar.getAttribute("data-op-topbar"), y: Math.round(window.scrollY) }
})

const PICKS = (process.env.THEMES || "sunset,air,nova,midnight,paper,cobalt,graph,aurora,default,renaissance,dusk,neon").split(",")
let picked = 0
for (const id of PICKS) {
  const card = await p.$(`[data-theme-card="${id}"]`)
  if (!card) continue
  /* As a creator does: the preview read halfway down (the bar formed), then a theme picked. */
  const before = await frameOf()
  if (before) await before.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 2)))
  await sleep(400)
  await card.evaluate((e) => e.scrollIntoView({ block: "center" }))
  await card.click()
  picked++
  await sleep(1200)
  const frame = await frameOf()
  if (!frame) { check(`${id}: the preview frame is there`, false); continue }
  /* Read as it is left, with no scroll of ours: the bar must agree with where the page is. */
  const left = await frame.evaluate(() => {
    const bar = document.querySelector("[data-op-topbar]")
    const anchor = [...document.querySelectorAll("[data-op-bar-anchor]")].find((e) => e.getClientRects().length > 0)
    const barFoot = bar ? bar.getBoundingClientRect().bottom : 0
    return { opacity: bar ? Number(getComputedStyle(bar).opacity) : null, nameVisible: anchor ? anchor.getBoundingClientRect().bottom > barFoot + 4 : null, y: Math.round(window.scrollY) }
  })
  check(`${id}: after the pick the bar agrees with the page (hidden while the name is in view)`, left.opacity !== null && (left.nameVisible ? left.opacity < 0.05 : left.opacity > 0.5), JSON.stringify(left))
  /* And back at the top by hand. */
  await frame.evaluate(() => window.scrollTo(0, 0))
  await sleep(400)
  const bar = await barAt(frame)
  check(`${id}: at the top of the page the bar is hidden and takes no pointer`, !!bar && Number(bar.opacity) < 0.05 && bar.events === "none", JSON.stringify(bar))
}
check(`${picked} themes picked`, picked >= 8)

const frame = await frameOf()
await frame.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await sleep(700)
const down = await barAt(frame)
check("scrolled past the header, the bar forms", !!down && Number(down.opacity) > 0.9 && down.state === "shown", JSON.stringify(down))
await frame.evaluate(() => window.scrollTo(0, 0))
await sleep(700)
const up = await barAt(frame)
check("back at the top, it is gone again", !!up && Number(up.opacity) < 0.05, JSON.stringify(up))

await browser.close()
server.close()
console.log(failed ? `\n${failed} FAILED` : "\nall passed")
process.exit(failed ? 1 : 0)
