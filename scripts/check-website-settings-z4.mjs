#!/usr/bin/env node
/**
 * ===========================================================================
 *  ROUND Z4, MEASURED: RESTORE SETTLES, RECENT FOLDS, PERFORMANCE IS SMALLER
 * ===========================================================================
 * The real Website Settings (scripts/render-website-settings-z4-probe.tsx) in
 * headless Chromium with the app's stylesheet and the light sheet, at 390 and
 * 1280, dark and light:
 *
 *   Restore points   the question settles every way a restore can end: done
 *                    (it closes and the editor is told to reload), refused
 *                    (the reason inside it, both buttons back), the network
 *                    gone (said, both buttons back), and slow (a line saying
 *                    so after five seconds, then done). The editor's draft is
 *                    held first and let go only when nothing was restored.
 *   Recent           twelve rows show five, the fifth fading under a mask;
 *                    Show all opens the rest by animating the height, every
 *                    frame taller than the one before, no jump; Show less
 *                    folds it back. Nothing wider than the screen.
 *   Performance      the figures' size, the chart's height, the summary
 *                    card's height and the whole page's, nothing wider than
 *                    the screen.
 *
 *   node scripts/check-website-settings-z4.mjs
 */
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appCss } from "./probe-css.mjs"

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require("playwright"))
} catch {
  const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()
  ;({ chromium } = require(join(globalRoot, "playwright")))
}

const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), "storelib-z4-"))
try {
  execFileSync(
    "pnpm",
    ["exec", "esbuild", join(root, "scripts/render-website-settings-z4-probe.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`, '--define:process.env.NODE_ENV="production"', "--define:process.env={}", `--alias:@=${root}`, "--loader:.css=empty", "--loader:.json=json"],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("the probe did not bundle")
}
const script = readFileSync(join(dir, "probe.js"), "utf8")
rmSync(dir, { recursive: true, force: true })
const css = `${await appCss(root)}\n${readFileSync(join(root, "app/website-settings-light.css"), "utf8")}`
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${script}</script></body></html>`

const ORIGIN = "https://probe.local"
const BACKUPS = [
  { id: "b1", label: "Manual backup", source: "manual", created_at: "2026-10-18T13:23:00Z" },
  { id: "b2", label: "Before GitHub 1a2b3c4", source: "ai", created_at: "2026-10-17T09:10:00Z" },
  { id: "b3", label: "Published", source: "publish", created_at: "2026-10-16T18:00:00Z" },
]
const EVENTS = Array.from({ length: 12 }, (_, i) => ({
  id: 100 - i,
  direction: i % 3 === 0 ? "to_github" : "from_github",
  ok: i !== 2,
  summary:
    i === 2
      ? 'GitHub · claude pushed: 0 taken, 1 not. sections/logo_scroll_strip.storelib: Storelib could not tell which format this is. Start it with <template compat="shopify">, end the markup with </template>.'
      : i % 3 === 0
        ? "Sent the whole theme"
        : `GitHub · claude pushed: hero, faq${i === 4 ? ". logo_scroll_strip converted to this theme's format." : ""}`,
  commit_sha: `${(i + 10).toString(16).padStart(2, "0")}${"a1b2c3d4e5".repeat(4)}`.slice(0, 40),
  created_at: new Date(Date.parse("2026-10-18T15:00:00Z") - i * 3_600_000).toISOString(),
}))
const GITHUB = {
  configured: true,
  ready: true,
  link: { account: "astrid", repo: "astrid/site", branch: "main", folder: "", lastSyncedAt: "2026-10-18T14:00:00Z", lastSyncedSha: null, lastError: null, pushOnSave: true, pullOnPush: true, last: null, ignored: { branch: "storelib", at: "2026-10-18T14:30:00Z" }, problem: null },
  repos: [],
  accounts: [],
  events: EVENTS,
  overrides: [],
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" })
const results = []
const numbers = []
let ok = true
const expect = (label, cond, got) => {
  results.push(`  ${cond ? "ok  " : "FAIL"}  ${label}${got !== undefined ? `: ${JSON.stringify(got)}` : ""}`)
  if (!cond) ok = false
}

async function open({ hash, width, look, restore = "ok" }) {
  const touch = width < 600
  const context = await browser.newContext({ viewport: { width, height: touch ? 844 : 900 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 })
  await context.route("**/*", async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.pathname === "/") return route.fulfill({ status: 200, contentType: "text/html", body: html })
    if (/\/backups\/[^/]+\/restore$/.test(url.pathname) && req.method() === "POST") {
      if (restore === "drop") return route.abort("connectionreset")
      if (restore === "fail") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The restore could not be saved. Your draft is as it was before.", rolledBack: true }) })
      if (restore === "slow") await new Promise((r) => setTimeout(r, 6500))
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, changed: { files: 504, pages: 3, settings: true } }) })
    }
    if (url.pathname.endsWith("/backups")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ backups: BACKUPS }) })
    if (url.pathname.endsWith("/releases")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false }) })
    if (url.pathname.endsWith("/github")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GITHUB) })
    if (url.pathname === "/api/ai-memory") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ memories: [], ready: true }) })
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    return route.fulfill({ status: 404, body: "" })
  })
  await context.addInitScript((v) => window.localStorage.setItem("storelib:appearance", v), look)
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  await page.goto(`${ORIGIN}/#${hash}`)
  await page.waitForTimeout(600)
  return { page, context, errors }
}

const overflow = (page) => page.evaluate(() => {
  const box = document.querySelector("[data-ws-look]")
  const w = document.documentElement.clientWidth
  let worst = 0
  for (const el of box.querySelectorAll("*")) {
    const r = el.getBoundingClientRect()
    if (!r.width || el.closest("[data-recent-list]") && getComputedStyle(el.closest("[data-recent-list]")).overflow === "hidden" && r.top > el.closest("[data-recent-list]").getBoundingClientRect().bottom) continue
    if (el.closest("table") || el.closest("svg")) continue
    worst = Math.max(worst, Math.round(r.right - w))
  }
  return worst
})

for (const look of ["dark", "light"]) {
  for (const width of [390, 1280]) {
    const at = `${look} ${width}`

    /* ── Restore points ── */
    for (const restore of ["ok", "fail", "drop", "slow"]) {
      const { page, context, errors } = await open({ hash: "backups", width, look, restore })
      const actual = await page.evaluate(() => document.querySelector("[data-ws-look]")?.getAttribute("data-ws-look"))
      if (restore === "ok") expect(`${at}: Website Settings in the ${look} look`, actual === look, actual)
      await page.getByRole("button", { name: "Restore", exact: true }).first().click()
      const dialog = page.getByRole("alertdialog")
      await dialog.waitFor()
      const t0 = Date.now()
      await dialog.getByRole("button", { name: "Restore", exact: true }).click()
      if (restore === "ok") {
        await dialog.waitFor({ state: "detached", timeout: 10_000 })
        const r = await page.evaluate(() => ({ restored: window.__restored, held: window.__held }))
        numbers.push(`${at} restore done: closed after ${Date.now() - t0} ms`)
        expect(`${at}: a restore that finishes closes the question and reloads the editor`, r.restored === 1 && JSON.stringify(r.held) === "[true]", r)
      } else if (restore === "slow") {
        await page.waitForTimeout(5600)
        const slowLine = await dialog.getByRole("status").textContent().catch(() => null)
        const busy = await dialog.getByRole("button", { name: /Restoring/ }).isDisabled()
        expect(`${at}: a slow restore says so after five seconds, still busy`, /Still restoring/.test(slowLine ?? "") && busy, slowLine)
        await dialog.waitFor({ state: "detached", timeout: 10_000 })
        numbers.push(`${at} restore slow: closed after ${Date.now() - t0} ms`)
        expect(`${at}:   and then closes`, (await page.evaluate(() => window.__restored)) === 1)
      } else {
        const alert = dialog.getByRole("alert")
        await alert.waitFor({ timeout: 10_000 })
        const said = await alert.textContent()
        const again = await dialog.getByRole("button", { name: "Restore", exact: true }).isEnabled()
        const cancel = await dialog.getByRole("button", { name: "Cancel" }).isEnabled()
        const held = await page.evaluate(() => window.__held)
        numbers.push(`${at} restore ${restore}: settled after ${Date.now() - t0} ms`)
        const words = restore === "fail" ? /as it was before/ : /could not be reached/
        expect(`${at}: a restore that ${restore === "fail" ? "is refused" : "loses the network"} settles with words, both buttons back, the draft let go`, words.test(said ?? "") && again && cancel && JSON.stringify(held) === "[true,false]", { said, again, cancel, held })
      }
      expect(`${at}: no page errors (${restore})`, errors.length === 0, errors)
      await context.close()
    }

    /* ── Recent ── */
    {
      const { page, context, errors } = await open({ hash: "connections", width, look })
      const list = page.locator("[data-recent-list]")
      await list.waitFor({ timeout: 5000 })
      const closed = await list.evaluate((el) => {
        const rows = [...el.children]
        const s = getComputedStyle(el)
        const fifth = rows[4].getBoundingClientRect()
        const sixth = rows[5].getBoundingClientRect()
        const box = el.getBoundingClientRect()
        return { rows: rows.length, h: Math.round(box.height), fifthBottom: Math.round(fifth.bottom - box.top), sixthHidden: sixth.top >= box.bottom - 1, mask: s.maskImage || s.webkitMaskImage, state: el.dataset.recentList }
      })
      numbers.push(`${at} Recent closed: ${closed.rows} rows, ${closed.h}px tall (five rows end at ${closed.fifthBottom}px)`)
      expect(`${at}: Recent shows five of twelve, the sixth out of sight`, closed.rows === 12 && closed.state === "closed" && Math.abs(closed.h - closed.fifthBottom) <= 1 && closed.sixthHidden, closed)
      expect(`${at}:   the fifth fades under a mask`, /linear-gradient/.test(closed.mask ?? ""), closed.mask)
      const button = page.getByRole("button", { name: /Show all 12/ })
      expect(`${at}:   Show all 12 is there, collapsed`, (await button.getAttribute("aria-expanded")) === "false")
      const plain = await list.evaluate((el) => el.textContent)
      expect(`${at}:   the rows' words name no platform and no attribute`, !/Shopify|Liquid|compat=/.test(plain), plain.match(/Shopify|Liquid|compat=/)?.[0])
      /* Every frame of the opening, sampled. */
      await page.evaluate(() => {
        window.__frames = []
        const el = document.querySelector("[data-recent-list]")
        const t0 = performance.now()
        const tick = () => {
          window.__frames.push([Math.round(performance.now() - t0), Math.round(el.getBoundingClientRect().height)])
          if (performance.now() - t0 < 600) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await button.click()
      await page.waitForTimeout(700)
      const opened = await list.evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), full: el.scrollHeight, state: el.dataset.recentList, frames: window.__frames }))
      const hs = opened.frames.map((f) => f[1])
      const distinct = [...new Set(hs)]
      const monotonic = hs.every((h, i) => i === 0 || h >= hs[i - 1])
      const biggestStep = Math.max(0, ...hs.slice(1).map((h, i) => h - hs[i]))
      const span = opened.h - closed.h
      numbers.push(`${at} Recent opened: ${closed.h} -> ${opened.h}px over ${opened.frames.filter((f, i) => i > 0 && f[1] !== opened.frames[i - 1][1]).length} frames, biggest step ${biggestStep}px of ${span}`)
      expect(`${at}:   Show all opens to every row`, opened.state === "open" && Math.abs(opened.h - opened.full) <= 1, opened)
      expect(`${at}:   the height animates, every frame taller, no jump`, monotonic && distinct.length >= 6 && biggestStep < span * 0.5, { frames: distinct.length, biggestStep, span })
      await page.getByRole("button", { name: "Show less" }).click()
      await page.waitForTimeout(500)
      const back = await list.evaluate((el) => Math.round(el.getBoundingClientRect().height))
      expect(`${at}:   Show less folds it back to five`, Math.abs(back - closed.h) <= 1, back)
      const follow = await page.getByRole("button", { name: "Follow storelib" }).count()
      expect(`${at}: an unread branch has its one button`, follow === 1)
      const over = await overflow(page)
      expect(`${at}: nothing on Connections wider than the screen`, over <= 0, over)
      expect(`${at}: no page errors (Recent)`, errors.length === 0, errors)
      await context.close()
    }

    /* ── Performance ── */
    {
      const { page, context, errors } = await open({ hash: "performance", width, look })
      await page.locator("[data-perf-summary]").waitFor({ timeout: 8000 })
      await page.waitForTimeout(300)
      const m = await page.evaluate(() => {
        const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null)
        const summary = document.querySelector("[data-perf-summary]")
        const svg = document.querySelector("[data-perf-panel] svg")
        const tab = document.querySelector("[data-vitals] [data-tab]")
        const settingsPage = document.querySelector("[data-settings-page]") ?? document.querySelector("[data-ws-look]")
        const scroller = [...document.querySelectorAll("[data-ws-look] *")].find((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY))
        return {
          figure: px(document.querySelector("[data-vitals] [data-p75]")),
          name: px(tab?.querySelector("span span span")),
          overall: px(document.querySelector("[data-overall] h2")),
          chart: svg ? Math.round(svg.getBoundingClientRect().height) : null,
          tab: tab ? Math.round(tab.getBoundingClientRect().height) : null,
          summary: Math.round(summary.getBoundingClientRect().height),
          page: scroller ? scroller.scrollHeight : Math.round(settingsPage.getBoundingClientRect().height),
          score: px([...document.querySelectorAll("[data-lab-result] p")].find((p) => /^\d+$/.test(p.textContent.trim()))),
        }
      })
      numbers.push(`${at} Performance: figure ${m.figure}px, measure name ${m.name}px, headline ${m.overall}px, chart ${m.chart}px, one vital ${m.tab}px, summary card ${m.summary}px, whole page ${m.page}px, lab score ${m.score}px`)
      expect(`${at}: the figures are figures, not headlines (<= 22px, <= 18px on a phone)`, m.figure !== null && m.figure <= (width < 1024 ? 18 : 22), m.figure)
      expect(`${at}:   the chart is 160px tall`, m.chart === 160, m.chart)
      expect(`${at}:   no text over 22px in the tab`, await page.evaluate(() => [...document.querySelectorAll("[data-perf-body] *, [data-lab-result] *")].every((e) => parseFloat(getComputedStyle(e).fontSize) <= 22)))
      const over = await overflow(page)
      expect(`${at}: nothing on Performance wider than the screen`, over <= 0, over)
      expect(`${at}: no page errors (Performance)`, errors.length === 0, errors)
      await context.close()
    }
  }
}

await browser.close()
console.log("\nNumbers")
for (const n of numbers) console.log(`  ${n}`)
console.log("\nChecks")
for (const r of results) console.log(r)
console.log(`\n${results.filter((r) => r.includes(" ok ")).length} ok, ${results.filter((r) => r.includes("FAIL")).length} failed`)
if (!ok) process.exit(1)
