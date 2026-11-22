/* Every page of the samples template at 1440 and 390, full or empty store. */
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { CODE_THEME_PACKAGE } from "../../lib/themes/marketplace-shared"
import { importTemplate, serve } from "./site"
import { auditCart, auditSite, auditPaths } from "./fixtures"
const [state, out, only] = process.argv.slice(2)
async function main() {
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/samples`)
  console.log("skipped", JSON.stringify((imported.report as any).skipped ?? []).slice(0, 400))
  const built = auditSite(imported, "samples", state === "empty")
  const { base, server, missing } = await serve(built, "/home/user/materia-mvp-build-127--1-/scripts/theme-templates/products/samples", { eager: true, cart: auditCart(built) })
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"] })
  const paths = auditPaths(built).concat([["free", "/pages/free"], ["licence", "/pages/licence"]])
  for (const [name, path] of paths) {
    if (only && !only.split(",").includes(name)) continue
    for (const w of [1440, 390]) {
      const p = await browser.newPage()
      await p.setViewport(w < 600 ? { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { width: w, height: 900 })
      const errs: string[] = []
      p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)))
      p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)) })
      await p.evaluateOnNewDocument("window.__name = (f) => f")
      await p.goto(`${base}${path}`, { waitUntil: "networkidle2", timeout: 60000 })
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)) } scrollTo(0, 0) })
      await new Promise((r) => setTimeout(r, 700))
      const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      await p.screenshot({ path: join(out, `${name}-${w}.png`) as `${string}.png`, fullPage: true })
      console.log(name, w, "overflow", over, errs.length ? errs.join(" | ") : "")
      await p.close()
    }
  }
  console.log("missing", missing.slice(0, 20))
  await browser.close(); server.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
