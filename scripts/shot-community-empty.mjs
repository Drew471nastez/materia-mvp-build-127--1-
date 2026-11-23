/**
 * /app/community with no community yet, photographed for a person at 360,
 * 390, 768 and 1280 (device scale 2) through scripts/render-community-empty.tsx.
 * Prints the empty state's box and text at each width.
 *
 *   OUT=dir LABEL=after node scripts/shot-community-empty.mjs
 */
import puppeteer from "puppeteer-core"
import { mkdirSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const out = process.env.OUT || "shots"
const label = process.env.LABEL || "shot"
mkdirSync(out, { recursive: true })
const { base, server } = await serveEditorProbe({ entry: "scripts/render-community-empty.tsx", pathname: "/app/community" })
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] })
try {
  for (const width of [360, 390, 768, 1280]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2, isMobile: width < 640, hasTouch: width < 640 })
    await page.goto(`${base}/app/community?view=owner&plan=free`)
    await page.waitForSelector("[data-empty]", { timeout: 8000 })
    await new Promise((r) => setTimeout(r, 400))
    const m = await page.evaluate(() => {
      const e = document.querySelector("[data-empty]")
      const r = e.getBoundingClientRect()
      return { height: Math.round(r.height), width: Math.round(r.width), preview: !!document.querySelector("[data-empty-preview]"), sideways: document.documentElement.scrollWidth - innerWidth, text: e.textContent.replace(/\s+/g, " ").trim() }
    })
    console.log(width, JSON.stringify(m))
    await page.screenshot({ path: `${out}/community-${label}-${width}.png` })
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
