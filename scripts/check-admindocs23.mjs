/**
 * ===========================================================================
 *  /admin/physical-commerce, MEASURED AT A DESK AND ON A PHONE
 * ===========================================================================
 * Renders the real page (app/(storelib)/admin/physical-commerce/commerce-docs-admin.tsx)
 * with its real content (scripts/render-admindocs23.tsx) at 1440x900 and at
 * 390x844 as a touch phone with a 4x slower CPU, with the status of a running
 * platform, with nothing configured, and with a failed read, then:
 *
 *   the page never scrolls sideways                 document scrollWidth
 *   nothing configured draws no number              every count unreadable
 *   tap targets are 40px or more on a phone         buttons and links
 *   the search narrows to the matching topics       typed, counted
 *   an anchor opens at its section                  #taxes in view
 *   typing in the search at 4x CPU                  time to the next frame
 *
 * and writes screenshots to SHOTS_DIR (or a temp folder).
 *
 *   PROBE_CSS=source node scripts/check-admindocs23.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-admindocs-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
writeFileSync(join(out, "empty.js"), "export {}\n")

execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-admindocs23.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    "--define:process.env={}",
    `--alias:@=${root}`, `--alias:server-only=${join(out, "empty.js")}`, "--loader:.css=empty",
  ],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
)

const css = await appCss(root)
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head>
<body><div id="root"></div><script src="probe.js"></script></body></html>`,
)

const CASES = []
for (const width of [1440, 390]) for (const status of ["data", "empty", "error"]) CASES.push({ width, status, name: `${status}-${width}` })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, protocolTimeout: 600000, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const problems = []
const note = (c, m) => problems.push(`${c.name}: ${m}`)

for (const c of CASES) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  const phone = c.width < 800
  await page.setViewport({ width: c.width, height: phone ? 844 : 900, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone })
  const cdp = await page.createCDPSession()
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await page.goto(`file://${join(out, "index.html")}?status=${c.status}`, { waitUntil: "load", timeout: 120000 })
  await page.waitForSelector(`[data-status="${c.status === "error" ? "error" : "read"}"]`, { timeout: 8000 }).catch(() => note(c, "the status never finished reading"))

  const m = await page.evaluate(() => {
    const vw = window.innerWidth
    const visible = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"
    }
    const small = [...document.querySelectorAll("button, a, input")]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect()
        /* A link inside a sentence or a list of places is read, not aimed at; the # beside a heading is a desktop hover affordance. */
        return r.height < 39.5 && !el.closest("p, li, dd, h2, h3")
      })
      .map((el) => `${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`)
    const counts = [...document.querySelectorAll("[data-count]")]
    return {
      scroll: document.documentElement.scrollWidth - vw,
      sections: document.querySelectorAll("[data-section]").length,
      topics: document.querySelectorAll("[data-topic]").length,
      counts: counts.length,
      countsUnreadable: counts.filter((el) => el.querySelector("[data-unreadable]")).length,
      countDigits: counts.map((el) => el.querySelector("dd")?.textContent ?? "").filter((t) => /^\d[\d,]*$/.test(t.trim())).length,
      jobs: [...document.querySelectorAll("[data-job]")].map((el) => el.getAttribute("data-job-health")),
      small,
      background: getComputedStyle(document.querySelector("[data-admin-commerce-docs]")).backgroundColor,
      height: document.documentElement.scrollHeight,
    }
  })
  await page.screenshot({ path: join(shots, `${c.name}-top.png`) })
  const status = await page.$("#status")
  if (status) await status.screenshot({ path: join(shots, `${c.name}-status.png`) })
  console.log(c.name, JSON.stringify({ ...m, small: m.small.length }))

  if (errors.length) note(c, `page errors: ${errors.join(" | ")}`)
  if (m.scroll > 0) note(c, `scrolls sideways by ${m.scroll}px`)
  if (phone && m.small.length) note(c, `small tap targets: ${m.small.join(", ")}`)
  if (m.background !== "rgb(11, 11, 15)") note(c, `surface is ${m.background}`)
  if (m.sections < 14) note(c, `only ${m.sections} sections`)
  if (c.status === "empty") {
    if (m.countDigits) note(c, `${m.countDigits} counts drawn as numbers with nothing readable`)
    if (m.countsUnreadable !== m.counts) note(c, `${m.counts - m.countsUnreadable} counts not marked unreadable`)
    if (m.jobs.some((j) => j !== "unknown")) note(c, `jobs judged without records: ${m.jobs}`)
  }
  if (c.status === "data") {
    if (m.countDigits < 10) note(c, `only ${m.countDigits} counts drawn`)
    if (!m.jobs.includes("failed")) note(c, "the failed job is not shown as failed")

    /* The search, typed at the speed of a person; the frame after each key is timed. */
    const box = await page.$('input[type="search"]')
    await box.click()
    const before = m.topics
    const frames = []
    for (const ch of "low stock") {
      const t0 = Date.now()
      await page.keyboard.type(ch)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      frames.push(Date.now() - t0)
    }
    const after = await page.evaluate(() => ({ topics: document.querySelectorAll("[data-topic]").length, count: document.querySelector("[data-search-count]")?.textContent, low: !!document.getElementById("locations-inventory-low-stock") }))
    console.log(c.name, "search", JSON.stringify({ before, ...after, slowestKeyMs: Math.max(...frames) }))
    if (!(after.topics < before && after.topics > 0 && after.low)) note(c, `search did not narrow to low stock: ${JSON.stringify(after)}`)
    if (Math.max(...frames) > 250) note(c, `a key took ${Math.max(...frames)}ms to draw`)
    await page.screenshot({ path: join(shots, `${c.name}-search.png`) })
    const clear = async () => {
      await page.focus('input[type="search"]')
      await page.keyboard.down("Control")
      await page.keyboard.press("KeyA")
      await page.keyboard.up("Control")
      await page.keyboard.press("Backspace")
    }
    await clear()
    await page.keyboard.type("zzqq")
    const none = await page.evaluate(() => !!document.querySelector("[data-search-empty]"))
    if (!none) note(c, "no empty state for a search with no match")
    await clear()

    /* An anchor, once every section is back. */
    await page.waitForFunction((n) => document.querySelectorAll("[data-topic]").length === n, { timeout: 60000 }, before)
    await page.evaluate(() => {
      location.hash = "#taxes"
    })
    await new Promise((r) => setTimeout(r, 300))
    const top = await page.evaluate(() => Math.round(document.getElementById("taxes").getBoundingClientRect().top))
    if (top < -2 || top > 40) note(c, `#taxes opened ${top}px from the top`)
    await page.screenshot({ path: join(shots, `${c.name}-taxes.png`) })
  }
  await page.close()
}

await browser.close()
console.log(`\nshots: ${shots}`)
if (problems.length) {
  console.log(`\n${problems.length} problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.log("\nall good")
