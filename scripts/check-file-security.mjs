/**
 * ===========================================================================
 *  THE FILE CHECKS, AS A CREATOR AND AS THE OWNER SEE THEM
 * ===========================================================================
 * Renders scripts/render-file-security.tsx at 390 and 1280 wide with the
 * app's own CSS, and checks:
 *
 *   editor   one row per state: uploading with progress, "Checking file…"
 *            for a check still going, the ready file with only its size, a
 *            refused upload in one plain red sentence with only a remove
 *            button (no Retry), a saved file that was not accepted, and a
 *            dropped connection that still offers Retry. No row says
 *            Scanning, Clean, virus, ClamAV, quarantine, hash or MIME.
 *   timing   an upload whose check ends in 150 ms never shows "Checking
 *            file…" (sampled every animation frame); one that takes 1200 ms
 *            shows it, and only after 300 ms
 *   admin    /admin/security: no sideways scroll, no panel wider than its
 *            box, the engine line reads "Not enabled, built-in checks only"
 *            in grey (not amber, not red), the EICAR sample gives Refused
 *            with what was found and the sentence a creator reads
 *
 * and writes a screenshot of each to SHOTS_DIR (or a temp folder).
 *
 *   PROBE_CSS=source node scripts/check-file-security.mjs
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
const out = mkdtempSync(join(tmpdir(), "storelib-file-security-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

/* The components here use no next/link, next/image or next/navigation. */
execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-file-security.tsx"),
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
const BANNED = /scanning|\bclean\b|virus|clam\s?av|quarantin|\bhash|\bmime\b|malware|signature|threat|infected/i

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

async function open(query, width) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  await page.setViewport({ width, height: width > 800 ? 900 : 844, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: width < 800 })
  await page.goto(`file://${join(out, "index.html")}${query}`, { waitUntil: "load" })
  return { page, errors }
}

for (const width of [390, 1280]) {
  console.log(`\neditor ${width}`)
  {
    const { page, errors } = await open("?view=editor", width)
    const early = await page.evaluate(() => [...document.querySelectorAll("[data-file-row]")].map((r) => r.querySelector("[data-file-meta]")?.textContent ?? ""))
    await new Promise((r) => setTimeout(r, 700))
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth - window.innerWidth,
      text: document.body.innerText,
      rows: [...document.querySelectorAll("[data-file-row]")].map((r) => {
        const meta = r.querySelector("[data-file-meta]")
        const red = meta?.querySelector(".text-\\[\\#b42318\\]")
        return {
          state: r.getAttribute("data-state"),
          meta: meta?.textContent ?? "",
          red: red ? getComputedStyle(red).color : null,
          cut: meta ? meta.scrollWidth - meta.clientWidth : 0,
          retry: !!r.querySelector("[data-upload-retry]"),
          buttons: r.querySelectorAll("button").length,
          h: Math.round(r.getBoundingClientRect().height),
        }
      }),
    }))
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    expect(m.scroll <= 0, "the page does not scroll sideways", m.scroll)
    const states = m.rows.map((r) => r.state)
    expect(JSON.stringify(states) === JSON.stringify(["file", "uploading", "checking", "error", "refused", "error", "error"]), "rows: ready, uploading, checking, refused upload, refused saved file, refused upload, connection lost", states)
    expect(/^492 of 1,?200 MB · \d+ sec left$|^492 MB of 1\.2 GB · \d+ sec left$/.test(m.rows[1]?.meta), "uploading shows how much and how long, as before", m.rows[1]?.meta)
    expect(m.rows[2]?.meta === "Checking file…", "a check still going after 300 ms says Checking file…", m.rows[2]?.meta)
    expect(/^48 of 48 MB$/.test(early[2] ?? ""), "and before 300 ms it still shows the upload's own line (no flash)", early[2])
    expect(m.rows[0]?.meta === "412 MB", "a ready file says only its size", m.rows[0]?.meta)
    expect(m.rows[3]?.meta === "This file type isn't supported." && m.rows[3]?.red === "rgb(180, 35, 24)", "a refused upload: one plain sentence, in red", m.rows[3])
    expect(!m.rows[3]?.retry && m.rows[3]?.buttons === 1, "with only a remove button, no Retry", m.rows[3])
    expect(m.rows[4]?.meta === "We couldn't accept this file. Try another file.", "a saved file that was not accepted says so plainly", m.rows[4]?.meta)
    expect(m.rows[6]?.meta === "Connection lost" && m.rows[6]?.retry, "a dropped connection still offers Retry", m.rows[6])
    expect(m.rows.every((r) => r.cut <= 0), "no sentence is cut off", m.rows.map((r) => r.cut))
    expect(!BANNED.test(m.text), "no word about how files are checked anywhere on the card", (m.text.match(BANNED) || [])[0])
    const heights = m.rows.filter((r) => r.state !== "error" && r.state !== "refused").map((r) => r.h)
    expect(new Set(heights).size === 1, "rows that are not errors keep one height", heights)
    await page.screenshot({ path: join(shots, `editor-${width}.png`), fullPage: true })
    await page.close()
  }

  for (const ms of [150, 1200]) {
    console.log(`\ntiming ${ms} ms, ${width}`)
    const { page, errors } = await open(`?view=timing&ms=${ms}`, width)
    const seen = await page.evaluate(
      (total) =>
        new Promise((resolve) => {
          const samples = []
          const t0 = performance.now()
          const tick = () => {
            const meta = document.querySelector("[data-file-row] [data-file-meta]")?.textContent ?? ""
            samples.push({ t: performance.now(), meta, at: window.__completingAt ?? null })
            if (performance.now() - t0 < total) requestAnimationFrame(tick)
            else resolve(samples)
          }
          requestAnimationFrame(tick)
        }),
      ms + 700,
    )
    const checking = seen.filter((s) => s.meta === "Checking file…")
    const firstAt = checking.length && checking[0].at != null ? Math.round(checking[0].t - checking[0].at) : null
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    if (ms < 300) expect(checking.length === 0, `a ${ms} ms check never shows Checking file… (${seen.length} frames sampled)`, checking.length)
    else expect(checking.length > 0 && firstAt >= 290, `a ${ms} ms check shows Checking file… after ${firstAt} ms`, firstAt)
    expect(seen[seen.length - 1]?.meta === "2 MB", "and ends as the ready file", seen[seen.length - 1]?.meta)
    await page.close()
  }

  for (const engine of ["off", "on"]) {
    console.log(`\nadmin, engine ${engine}, ${width}`)
    const { page, errors } = await open(`?view=admin${engine === "on" ? "&engine=on" : ""}`, width)
    await new Promise((r) => setTimeout(r, 700))
    const m = await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none"
      }
      const engineRow = [...document.querySelectorAll("dl > div")].find((d) => d.querySelector("dt")?.textContent === "Malware engine")
      const engineText = engineRow?.querySelector("dd span span:last-child")
      const dot = engineRow?.querySelector("dd span span")
      return {
        scroll: document.documentElement.scrollWidth - window.innerWidth,
        panels: [...document.querySelectorAll("section")].filter(visible).map((s) => ({ h: s.querySelector("h2")?.textContent, over: s.scrollWidth - s.clientWidth })),
        engine: engineRow?.querySelector("dd")?.textContent ?? "",
        engineCut: engineText ? engineText.scrollWidth - engineText.clientWidth : 0,
        dot: dot ? getComputedStyle(dot).backgroundColor : null,
        outcome: document.querySelector("[data-test-outcome]")?.textContent ?? "",
        bg: getComputedStyle(document.querySelector("[data-admin-security]")).backgroundColor,
        rows: document.querySelectorAll("[data-row]").length,
      }
    })
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    expect(m.scroll <= 0, "the page does not scroll sideways", m.scroll)
    expect(m.panels.every((p) => p.over <= 1), "no panel is wider than its box", m.panels.filter((p) => p.over > 1))
    if (engine === "off") {
      expect(m.engine === "Not enabled, built-in checks only", "no engine reads as the normal state", m.engine)
      expect(m.dot === "rgb(107, 107, 118)", "with a grey dot, not amber or red", m.dot)
      expect(m.engineCut <= 0, "and never cut off, on a phone either", m.engineCut)
    } else {
      expect(/ClamAV, in the background/.test(m.engine) && m.dot === "rgb(63, 185, 80)", "an engine switched on reads as on, green", { e: m.engine, d: m.dot })
      expect(/clamav/i.test(m.outcome) && /Eicar-Test-Signature/.test(m.outcome), "the test shows the engine's answer too", m.outcome.slice(0, 160))
    }
    expect(/Refused: EICAR test file/.test(m.outcome) && /the EICAR antivirus test file/.test(m.outcome) && /We couldn't accept this file/.test(m.outcome), "the EICAR sample: refused, what was found, what a creator reads", m.outcome.slice(0, 200))
    expect(m.bg === "rgb(11, 11, 15)", "the admin surface is dark", m.bg)
    expect(m.rows >= 10, "the reasons and the log are listed", m.rows)
    await page.screenshot({ path: join(shots, `admin-${engine}-${width}.png`), fullPage: true })
    await page.screenshot({ path: join(shots, `admin-${engine}-${width}-top.png`) })
    await page.close()
  }
}

await browser.close()
console.log(`\nScreenshots in ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
