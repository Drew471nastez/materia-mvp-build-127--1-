/**
 * ===========================================================================
 *  THE MALWARE SCANNER'S PAGES, MEASURED ON A PHONE AND AT A DESK
 * ===========================================================================
 * Renders /admin/scanner (off, on after Scan EICAR, and set up but not
 * answering) and the product editor's file list with a file in every scan
 * state (scripts/render-scanner.tsx), at 390 and 1280 wide, with the app's
 * own CSS, and checks:
 *
 *   the page never scrolls sideways             document scrollWidth
 *   no panel is wider than its box              each section's scrollWidth
 *   off: the steps are there, in order           the setup list
 *   on: the EICAR verdict and the engine show    the outcome and the facts
 *   down: it says unreachable                    the status word
 *   editor: each row says what it should         data-scan on each row
 *   the blocked row is red and not cut off       colour and line box
 *
 * and writes a screenshot of each to SHOTS_DIR (or a temp folder).
 *
 *   PROBE_CSS=source node scripts/check-scanner.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const out = mkdtempSync(join(tmpdir(), "storelib-scanner-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

/* next/link and friends are not used by these two components; the admin UI
   and the file list are plain React. */
execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-scanner.tsx"),
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

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const CASES = []
for (const width of [390, 1280]) {
  for (const state of ["off", "on", "down"]) CASES.push({ width, query: `?view=admin&state=${state}`, name: `admin-${state}-${width}`, state })
  CASES.push({ width, query: "?view=editor", name: `editor-${width}`, editor: true })
}

for (const c of CASES) {
  console.log(`\n${c.name}`)
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  await page.setViewport({ width: c.width, height: c.width > 800 ? 900 : 844, deviceScaleFactor: 2, isMobile: c.width < 800, hasTouch: c.width < 800 })
  await page.goto(`file://${join(out, "index.html")}${c.query}`, { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 700))

  const m = await page.evaluate(() => {
    const vw = window.innerWidth
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none"
    }
    return {
      scroll: document.documentElement.scrollWidth - vw,
      panels: [...document.querySelectorAll("section")].filter(visible).map((s) => ({ h: s.querySelector("h2")?.textContent, over: s.scrollWidth - s.clientWidth })),
      setupSteps: document.querySelectorAll("[data-scanner-setup] ol li").length,
      setupText: document.querySelector("[data-scanner-setup]")?.textContent ?? "",
      outcome: document.querySelector("[data-scan-outcome]")?.textContent ?? "",
      text: document.body.innerText,
      background: getComputedStyle(document.querySelector("[data-admin-scanner]") || document.body).backgroundColor,
      rows: [...document.querySelectorAll("[data-file-row]")].map((r) => {
        const meta = r.querySelector("[data-file-meta]")
        return {
          scan: r.getAttribute("data-scan"),
          meta: meta?.textContent ?? "",
          colour: meta?.querySelector("[data-file-scan='blocked']") ? getComputedStyle(meta.querySelector("[data-file-scan='blocked']")).color : null,
          cut: meta ? meta.scrollWidth - meta.clientWidth : 0,
          h: Math.round(r.getBoundingClientRect().height),
        }
      }),
    }
  })

  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  expect(m.scroll <= 0, "the page does not scroll sideways", m.scroll)
  expect(m.panels.every((p) => p.over <= 1), "no panel is wider than its box", m.panels.filter((p) => p.over > 1))

  if (c.state === "off") {
    expect(m.setupSteps === 5, "five steps to switch it on", m.setupSteps)
    expect(/CLAMAV_SERVICE_URL is not set, so scanning is off/.test(m.setupText), "says the URL is not set and scanning is off")
    expect(/CLAMAV_SERVICE_SECRET is set/.test(m.setupText), "says the secret is already set")
    expect(/Redeploy Storelib/.test(m.setupText) && /Scan EICAR/.test(m.setupText), "the steps end with redeploy and the EICAR test")
  }
  if (c.state === "on") {
    expect(/Infected: Eicar-Test-Signature/.test(m.outcome), "Scan EICAR shows Infected with the threat's name", m.outcome.slice(0, 80))
    expect(/"sha256"/.test(m.outcome), "and the scanner's JSON")
    expect(/1\.4\.6/.test(m.text) && /28129/.test(m.text), "the ClamAV version and signature database show")
    expect(/Working/.test(m.text), "the status reads Working")
  }
  if (c.state === "down") expect(/Unreachable/.test(m.text) && /No answer in time/.test(m.text), "says the scanner is unreachable")
  if (c.state) expect(m.background === "rgb(11, 11, 15)", "the admin surface is dark", m.background)

  if (c.editor) {
    const byScan = m.rows.map((r) => r.scan)
    expect(JSON.stringify(byScan) === JSON.stringify(["scanning", "clean", "blocked", "waiting", null]), "rows read Scanning, Clean, Blocked, pending, and nothing", byScan)
    expect(/Scanning/.test(m.rows[0]?.meta) && /Clean/.test(m.rows[1]?.meta) && /Virus check pending/.test(m.rows[3]?.meta), "each says it in words", m.rows.map((r) => r.meta))
    expect(/Blocked by the virus scan: Win\.Trojan\.Agent-1234567/.test(m.rows[2]?.meta) && m.rows[2]?.colour === "rgb(180, 35, 24)", "the blocked row names the threat in red", m.rows[2])
    expect(m.rows[4]?.meta === "11.4 MB", "a clean saved file says only its size", m.rows[4]?.meta)
    expect(m.rows[2]?.cut <= 0, "the blocked line wraps rather than cutting the threat's name off", m.rows[2]?.cut)
    const others = m.rows.filter((r) => r.scan !== "blocked").map((r) => r.h)
    expect(new Set(others).size === 1, "every other row keeps the same height", others)
  }

  await page.screenshot({ path: join(shots, `${c.name}.png`), fullPage: true })
  await page.close()
}

await browser.close()
console.log(`\nScreenshots in ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
