/**
 * ===========================================================================
 *  /admin/performance, MEASURED AT A DESK AND ON A PHONE
 * ===========================================================================
 * Renders the real page (app/admin/performance/performance-admin.tsx) with
 * fixtures (scripts/render-perf-health18.tsx) at 1440x900 and 390x844, with
 * realistic data and with nothing measured at all, then:
 *
 *   the page never scrolls sideways               document scrollWidth
 *   with no data, no number is drawn               no score, no figure value,
 *                                                  every cell says so
 *   with data, the index and sub scores show       their elements
 *   tap targets are 40px or more on a phone        buttons and links
 *   a figure is not cut off                        scrollWidth of each value
 *   opening a sub score at 4x CPU                  frames, and its rows
 *
 * and writes screenshots to SHOTS_DIR (or a temp folder).
 *
 *   PROBE_CSS=source node scripts/check-perf-health18.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-perf-health-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-perf-health18.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:@=${root}`, "--loader:.css=empty",
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
for (const width of [1440, 390]) {
  CASES.push({ width, query: "", name: `data-${width}` })
  CASES.push({ width, query: "?empty=1", name: `empty-${width}`, empty: true })
  CASES.push({ width, query: "", name: `open-${width}`, open: true })
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
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
  await page.setViewport({ width: c.width, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
  await page.goto(`file://${join(out, "index.html")}${c.query}`, { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 400))

  if (c.open) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await page.evaluate(() => document.querySelector("[data-sub='builder']")?.scrollIntoView({ block: "center" }))
    await page.click("[data-sub='builder'] button")
    for (let f = 0; f < 3; f++) {
      await page.screenshot({ path: join(shots, `${c.name}-frame${f}.png`) })
      await new Promise((r) => setTimeout(r, 60))
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  }

  const m = await page.evaluate(() => {
    const vw = window.innerWidth
    const visible = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
    }
    const small = [...document.querySelectorAll("button, a, summary")]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect()
        /* The thirty day columns are one control read together; each is a hover target, and the list under them is the way to every value. */
        return r.height < 39.5 && !el.closest("[data-score-history] [role=img]") && !(el.tagName === "A" && el.closest("p"))
      })
      .map((el) => `${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`)
    const cut = [...document.querySelectorAll("[data-figure-value] > span:first-child")].filter(visible).filter((el) => el.scrollWidth > el.clientWidth + 1).length
    const empty = document.querySelector("[data-admin-performance]")
    return {
      scroll: document.documentElement.scrollWidth - vw,
      score: document.querySelector("[data-health-score]")?.textContent ?? null,
      scoreEmpty: !!document.querySelector("[data-health-score-empty]"),
      values: document.querySelectorAll("[data-figure-value]").length,
      insufficient: document.querySelectorAll("[data-insufficient]").length,
      measures: document.querySelectorAll("[data-measure]").length,
      problems: document.querySelectorAll("[data-problems] li").length,
      notReady: !!document.querySelector("[data-not-ready]"),
      historyEmpty: !!document.querySelector("[data-history-empty]"),
      /* With nothing measured, the only digits on the page are the rules, the thresholds and the dates. */
      digitsInScoreArea: (document.querySelector("[data-health-index]")?.textContent ?? "").replace(/\d+ of \d+ sub scores|needs \d+|7 day average|30 day average/g, "").match(/\d/g)?.length ?? 0,
      small,
      cut,
      background: empty ? getComputedStyle(empty).backgroundColor : null,
      height: document.documentElement.scrollHeight,
    }
  })

  await page.screenshot({ path: join(shots, `${c.name}.png`), fullPage: !c.open })
  /* Each panel on its own too, at full size, to be looked at closely. */
  if (!c.open) {
    const panels = await page.$$("[data-admin-performance] section")
    for (let i = 0; i < panels.length; i++) await panels[i].screenshot({ path: join(shots, `${c.name}-panel${String(i).padStart(2, "0")}.png`) })
  }
  console.log(c.name, JSON.stringify({ ...m, small: m.small.length }))

  if (errors.length) note(c, `page errors: ${errors.join(" | ")}`)
  if (m.scroll > 0) note(c, `scrolls sideways by ${m.scroll}px`)
  if (m.cut) note(c, `${m.cut} values cut off`)
  if (phone && m.small.length) note(c, `small tap targets: ${m.small.join(", ")}`)
  if (m.background !== "rgb(11, 11, 15)") note(c, `surface is ${m.background}`)
  if (c.empty) {
    if (m.score !== null || !m.scoreEmpty) note(c, "a Health Index is drawn without data")
    if (m.values) note(c, `${m.values} figures drawn without data`)
    if (m.insufficient < 10) note(c, `only ${m.insufficient} insufficient data marks`)
    if (!m.notReady) note(c, "the waiting for part 126 note is missing")
    if (!m.historyEmpty) note(c, "the empty history state is missing")
    if (m.digitsInScoreArea) note(c, "digits in the Health Index area without data")
  } else {
    if (!m.score) note(c, "no Health Index with data")
    if (m.values < 20) note(c, `only ${m.values} figures drawn with data`)
    if (!m.problems) note(c, "no problems listed")
  }
  if (c.open && m.measures !== 5) note(c, `opened sub score shows ${m.measures} measurements, expected 5`)
  await page.close()
}

/* ── The collector itself, in a real browser on a real address ──────────── */
{
  execFileSync(
    "npx",
    ["--no-install", "esbuild", join(root, "scripts/render-perf-beacon18.ts"), "--bundle", "--format=iife", "--platform=browser", "--log-level=error", `--outfile=${join(out, "beacon.js")}`, `--alias:@=${root}`],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  )
  const { createServer } = await import("node:http")
  const { readFileSync } = await import("node:fs")
  const html = `<!doctype html><html><body style="margin:0"><h1 style="font-size:64px">Explore</h1><button id="go" style="height:60px">Open</button><script src="/beacon.js"></script></body></html>`
  const server = createServer((req, res) => {
    if (req.url === "/beacon.js") return res.end(readFileSync(join(out, "beacon.js")))
    res.setHeader("content-type", "text/html")
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const port = server.address().port
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  /* A browser driven by a script refuses to measure itself; this one is told it is not one, for the probe only. */
  await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, "webdriver", { get: () => false }))
  await page.goto(`http://127.0.0.1:${port}/explore`, { waitUntil: "load" })
  await page.evaluate(() => {
    window.__start()
    document.getElementById("go").addEventListener("click", () => {
      const t = performance.now()
      while (performance.now() - t < 120) {}
      history.pushState({}, "", "/app/products")
    })
  })
  /* From a script of the page's own (an error from the probe's own channel reaches the page as a muted "Script error."). */
  await page.addScriptTag({ content: 'setTimeout(function () { throw new Error("Probe failure for anna@example.com") }, 0)' })
  await new Promise((r) => setTimeout(r, 300))
  await page.click("#go")
  await new Promise((r) => setTimeout(r, 1400))
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")))
  await new Promise((r) => setTimeout(r, 300))
  const sent = await page.evaluate(() => window.__sent)
  const items = sent.flatMap((b) => JSON.parse(b).i)
  const has = (m, route) => items.some((i) => i[0] === m && (!route || i[2] === route))
  const nav = items.find((i) => i[0] === "nav")
  console.log("beacon", JSON.stringify({ batches: sent.length, items: items.map((i) => `${i[0]}:${i[2]}:${typeof i[3] === "number" ? Math.round(i[3] * 1000) / 1000 : i[3]}`) }))
  const c = { name: "beacon" }
  if (!has("view", "/explore") || !has("view", "/app/products")) note(c, "a page view is missing")
  if (!has("ttfb", "/explore") || !has("fcp", "/explore")) note(c, "the first load's TTFB or FCP is missing")
  if (!nav || nav[2] !== "/app/products" || nav[3] < 120) note(c, `the tap to next screen is ${nav ? Math.round(nav[3]) : "missing"}, expected 120 ms or more`)
  if (!has("cls", "/explore") || !has("cls", "/app/products")) note(c, "a view's CLS is missing")
  if (!has("js_error", "/explore")) note(c, "the thrown error is missing")
  const inpOld = items.find((i) => i[0] === "inp" && i[2] === "/explore")
  if (!inpOld || inpOld[3] < 120) note(c, `the tap that left Explore is not Explore's INP (${inpOld ? inpOld[3] : "missing"})`)
  if (items.some((i) => i[0] === "inp" && i[2] === "/app/products")) note(c, "the tap that left Explore was counted on the next page")
  if (sent.some((b) => /anna|127\.0\.0\.1|cookie/i.test(b))) note(c, "the beacon carried something it must not")
  await page.close()
  server.close()
}

await browser.close()
console.log(`\nshots: ${shots}`)
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join("\n")}`)
  process.exit(1)
}
console.log("all checks passed")
