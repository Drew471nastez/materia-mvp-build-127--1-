/**
 * One page of one template in Chromium, asked a question.
 *
 *   npx tsx scripts/theme-templates/probe.ts <template> <full|empty> <path> [--w 1440] [--shot file.png] [--y 0] [--h 900] [--eval "js expression"] [--html] [--name "Shop name"]
 *
 * --shot photographs the screen at scroll offset --y; --eval prints what the
 * expression answers in the page; --html prints the engine's own answer.
 */
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { CODE_THEME_PACKAGE } from "../../lib/themes/marketplace-shared"
import { answer } from "../../lib/storelib-theme/compat/site"
import { importTemplate, serve } from "./site"
import { auditCart, auditSite } from "./fixtures"

const args = process.argv.slice(2)
const value = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const [template, state, path] = args

async function main() {
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${template}`)
  const built = auditSite(imported, template, state === "empty")
  if (value("--name")) built.site.shop = { ...built.site.shop, name: value("--name") as string }
  if (args.includes("--html")) {
    const u = new URL(path, "http://x")
    const out = await answer(built.site, { method: "GET", path: u.pathname, query: u.searchParams, body: null, cart: [] })
    console.log(String(out.body))
    return
  }
  const { base, server } = await serve(built, join("scripts", "theme-templates", "products", template), { eager: true, cart: auditCart(built) })
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] })
  try {
    const w = Number(value("--w") ?? 1440)
    const p = await browser.newPage()
    await p.setViewport(w < 600 ? { width: w, height: Number(value("--h") ?? 844), isMobile: true, hasTouch: true } : { width: w, height: Number(value("--h") ?? 900) })
    p.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 300)))
    p.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 300)) })
    await p.evaluateOnNewDocument("window.__name = (f) => f")
    await p.goto(`${base}${path}`, { waitUntil: "networkidle2", timeout: 60000 })
    await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) } scrollTo(0, 0) })
    await new Promise((r) => setTimeout(r, 600))
    const y = Number(value("--y") ?? 0)
    if (y) { await p.evaluate((to) => scrollTo(0, to), y); await new Promise((r) => setTimeout(r, 500)) }
    if (value("--eval")) console.log(JSON.stringify(await p.evaluate(value("--eval") as string), null, 1))
    if (value("--shot")) await p.screenshot({ path: value("--shot") as `${string}.png`, fullPage: args.includes("--full") })
  } finally {
    await browser.close()
    server.close()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
