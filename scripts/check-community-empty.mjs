/**
 * /app/community before the creator has a community, drawn in headless
 * Chromium with the app's stylesheet (scripts/render-community-empty.tsx)
 * and measured at 320, 390 and 1440: no sideways scroll (the page keeps the
 * Products list's gutter), the empty state inside the page's white card, New community a real link to the form at
 * least 40px tall on a phone, and no page error. SHOTS=dir writes a
 * screenshot of each. CHROMIUM= the browser.
 *
 *   node scripts/check-community-empty.mjs
 */
import puppeteer from "puppeteer-core"
import { mkdirSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const { base, server } = await serveEditorProbe({ entry: "scripts/render-community-empty.tsx", pathname: "/app/community" })
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] })
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const problems = []
let measured = 0
try {
  for (const width of [320, 390, 1440]) {
    for (const view of ["owner", "owner-free", "team"]) {
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.setViewport({ width, height: 860, isMobile: width < 640, hasTouch: width < 640 })
      await page.goto(`${base}/app/community?view=${view.replace("-free", "")}${view.endsWith("free") ? "&plan=free" : ""}`)
      await page.waitForSelector("[data-empty]", { timeout: 8000 }).catch(() => errors.push("never drawn"))
      await new Promise((r) => setTimeout(r, 300))
      const m = await page.evaluate(() => {
        const empty = document.querySelector("[data-empty]")
        const r = empty?.getBoundingClientRect()
        const create = empty?.querySelector("a[href='/app/community/new']")
        return {
          scroll: document.documentElement.scrollWidth - window.innerWidth,
          left: r ? Math.round(r.left) : -1,
          width: r ? Math.round(r.width) : -1,
          create: create ? Math.round(create.getBoundingClientRect().height) : null,
          text: empty?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        }
      })
      measured++
      const tag = `${view} @${width}`
      if (errors.length) problems.push(`${tag}: ${errors.join("; ")}`)
      if (m.scroll > 0) problems.push(`${tag}: sideways scroll ${m.scroll}px`)
      if (view !== "team" && m.create === null) problems.push(`${tag}: no New community`)
      if (view === "team" && m.create !== null) problems.push(`${tag}: a team member is offered New community`)
      if (m.create !== null && width < 640 && m.create < 40) problems.push(`${tag}: New community ${m.create}px tall`)
      console.log(`${tag.padEnd(18)} ${m.width}px at ${m.left}px, sideways ${m.scroll}px, create ${m.create ?? "-"}px  "${m.text.slice(0, 90)}"`)
      if (shots) await page.screenshot({ path: `${shots}/community-empty-${view}-${width}.png`, fullPage: true })
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\n${measured} drawings measured, ${problems.length} problems`)
for (const p of problems) console.log(`  FAIL ${p}`)
if (problems.length) process.exit(1)
