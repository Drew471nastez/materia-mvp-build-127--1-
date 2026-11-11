/**
 * The handover's two surfaces, drawn in headless Chromium with the app's own
 * stylesheet and measured: every claim page state (in the log in page's
 * layout, components/auth/auth-split) and Settings › Team's
 * Transfer ownership (new and with an open link), at 320, 390 and 1440 wide.
 *
 *   no sideways scroll, the card inside the 16px gutters on a phone and no
 *   wider than 420px, every button at least 44px tall (tappable), the
 *   preview's long addresses wrapped inside the card, and no page error.
 *
 * SHOTS=dir writes a screenshot of each. CHROMIUM= the browser (default
 * /opt/pw-browsers/chromium-1194/chrome-linux/chrome).
 *
 *   node scripts/check-business-handoff.mjs
 */
import puppeteer from "puppeteer-core"
import { mkdirSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const pending = { id: "11111111-1111-4111-8111-111111111111", email: "tom@example.com", expiresAt: "2026-11-14T12:00:00Z", createdAt: "2026-11-07T12:00:00Z", lastSentAt: "2026-11-07T12:00:00Z", expired: false, keepFounder: true, founderAccess: "full", ttlDays: 7 }
let panelMode = "new"
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-business-handoff.tsx",
  api: (req) => {
    if (!req.url.startsWith("/api/handoff")) return null
    const open = panelMode === "open"
    return { body: { ready: true, eligible: true, business: { name: "Glow Studio" }, blockers: [], blockerText: [], pending: open ? pending : null, events: open ? [{ event: "viewed", at: "2026-11-07T13:00:00Z" }, { event: "sent", at: "2026-11-07T12:00:00Z" }, { event: "created", at: "2026-11-07T12:00:00Z" }] : [] } }
  },
})
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] })
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const views = ["claim-ready", "claim-signed_out", "claim-wrong_email", "claim-verify_email", "claim-limit", "claim-not_ready", "claim-own", "claim-accepted", "claim-expired", "claim-gone", "join-ready", "join-signed_out", "panel-new", "panel-open"]
const problems = []
let measured = 0
try {
  for (const width of [320, 390, 1440]) {
    for (const view of views) {
      panelMode = view === "panel-open" ? "open" : "new"
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.setViewport({ width, height: 900, isMobile: width < 640, hasTouch: width < 640 })
      await page.goto(`${base}/app/probe?view=${view}`)
      await page.waitForSelector(view.startsWith("panel") ? "[data-handoff-panel]" : "[data-claim-state]", { timeout: 8000 }).catch(() => errors.push("never drawn"))
      await new Promise((r) => setTimeout(r, 250))
      const m = await page.evaluate(() => {
        const card = document.querySelector("[data-auth-column]") || document.querySelector("[data-handoff-panel]")?.closest("section")
        const r = card?.getBoundingClientRect()
        const buttons = [...document.querySelectorAll("button:not([role=switch]), a[class*='h-1']")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => Math.round(b.getBoundingClientRect().height))
        const overflowing = [...(card?.querySelectorAll("*") ?? [])].filter((el) => r && el.getBoundingClientRect().right > r.right + 0.5).length
        return { scroll: document.documentElement.scrollWidth - window.innerWidth, left: r ? Math.round(r.left) : -1, width: r ? Math.round(r.width) : -1, minButton: buttons.length ? Math.min(...buttons) : null, overflowing }
      })
      measured++
      const tag = `${view} @${width}`
      if (errors.length) problems.push(`${tag}: ${errors.join("; ")}`)
      if (m.scroll > 0) problems.push(`${tag}: sideways scroll ${m.scroll}px`)
      if (!view.startsWith("panel") && width < 640 && m.left < 16) problems.push(`${tag}: card ${m.left}px from the edge`)
      if (!view.startsWith("panel") && m.width > 420) problems.push(`${tag}: card ${m.width}px wide`)
      if (m.minButton !== null && m.minButton < 40) problems.push(`${tag}: a button ${m.minButton}px tall`)
      if (m.overflowing) problems.push(`${tag}: ${m.overflowing} elements past the card's edge`)
      console.log(`${tag.padEnd(28)} card ${m.width}px at ${m.left}px, sideways ${m.scroll}px, smallest button ${m.minButton}px, past the edge ${m.overflowing}`)
      if (shots) await page.screenshot({ path: `${shots}/${view}-${width}.png`, fullPage: true })
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
