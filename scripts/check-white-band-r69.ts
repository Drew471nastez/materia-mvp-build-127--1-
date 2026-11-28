/**
 * ===========================================================================
 *  NO SECTION LEAVES A WHITE BAND AS IT ARRIVES (round 69)
 * ===========================================================================
 *   npx tsx scripts/check-white-band-r69.ts
 *     TEMPLATES=challenge,digital   templates whose page has FAQ 1, 2 or 3
 *     PAGE=faqs                     a page other than home
 *     WIDTH=1440
 *     OLD_HEAD=1                    without round 69's head fix (installed files)
 *
 * The owner: "some sections get completely hidden and glitched out in white
 * background, such as the FAQ 3 section". FAQ 1, 2 and 3 played their own
 * reveal (Reveal on scroll, on by default) on the section's root, which
 * carries the section's colour: opacity 0 from the first paint, in the first
 * screen too, until 12% of it was on screen, then 0.8s to come in. Until then
 * the page's background showed where the section is.
 *
 * The page is scrolled by a wheel at a reading pace, and every animation
 * frame, for every section on screen, the box that carries its colour (the
 * section, or the first box in it as wide and half as tall that paints a
 * background) drawn below half opacity or clipped away is measured: the
 * tallest such band and how long any lasted. Every template by default.
 */
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { importTemplate, serve } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
import { existsSync, readdirSync } from "node:fs"
const ROOT = "theme-packages/materia/templates"
const TEMPLATES = process.env.TEMPLATES ? process.env.TEMPLATES.split(",") : readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, "config")))
const WIDTH = Number(process.env.WIDTH ?? 1440)
const HEIGHT = WIDTH < 700 ? 844 : 900

const FILM = () => {
  const w = window as unknown as { __band: { px: number; ms: number; first: number; on: boolean; who: Record<string, number> } }
  w.__band = { px: 0, ms: 0, first: -1, on: true, who: {} }
  let last = performance.now()
  /* Whether the FAQ's own reveal still plays: its contents armed, then shown. */
  const armed = new Set<string>()
  new MutationObserver((rs) => rs.forEach((r) => { const t = r.target as HTMLElement; if (t.hasAttribute("data-faq-armed")) armed.add(t.dataset.faqSection ?? "?") })).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-faq-armed"] })
  ;(window as unknown as { __armed: Set<string> }).__armed = armed
  const opacityOf = (el: Element) => { let o = 1; for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o }
  const painted = (el: Element) => { const cs = getComputedStyle(el); return !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || cs.backgroundImage !== "none" }
  /* A section's colour: the section, or the first box in it (three deep) as wide and half as tall that paints a background. */
  const colourOf = (s: HTMLElement) => {
    if (painted(s)) return s
    const r = s.getBoundingClientRect()
    let level: Element[] = [s]
    for (let d = 0; d < 3; d++) {
      const next: Element[] = []
      for (const p of level) for (const c of p.children) {
        const b = c.getBoundingClientRect()
        if (b.width >= r.width * 0.95 && b.height >= r.height * 0.5) { if (painted(c)) return c; next.push(c) }
      }
      level = next
    }
    return null
  }
  const tick = () => {
    if (!w.__band.on) return
    const now = performance.now()
    let band = 0
    for (const s of document.querySelectorAll<HTMLElement>(".shopify-section")) {
      if (/header|announcement|popup|drawer|overlay|cart|notification/i.test(s.id)) continue
      const r = s.getBoundingClientRect()
      const on = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)
      if (on <= 40 || getComputedStyle(s).display === "none") continue
      const box = colourOf(s)
      if (!box) continue
      const clip = getComputedStyle(box).clipPath
      const clipped = /inset\(0(px)? 0(px)? (9\d|100)%/.test(clip)
      if (opacityOf(box) < 0.5 || clipped) { band = Math.max(band, on); const id = s.id.replace(/^shopify-section-(template--\d+__|sections--\d+__)?/, ""); w.__band.who[id] = Math.max(w.__band.who[id] ?? 0, Math.round(on)) }
    }
    if (band > 0) { w.__band.ms += now - last; w.__band.px = Math.max(w.__band.px, Math.round(band)); if (w.__band.first < 0) w.__band.first = Math.round(now) }
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  let worst = 0
  for (const t of TEMPLATES) {
    const imported = await importTemplate(`materia/${t}`)
    const built = auditSite(imported, t, false, { own: true })
    const { base, server } = await serve(built, join("scripts", "theme-templates", "products", t))
    const page = await browser.newPage()
    await page.setViewport({ width: WIDTH, height: HEIGHT, isMobile: WIDTH < 700, hasTouch: WIDTH < 700 })
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    if (process.env.OLD_HEAD) {
      await page.setRequestInterception(true)
      page.on("request", (req) => {
        if (req.resourceType() !== "document") { void req.continue(); return }
        void fetch(req.url()).then(async (r) => req.respond({ status: r.status, contentType: "text/html", body: (await r.text()).replace(/<style data-sl-faq-fix>[\s\S]*?<\/style>/, "") })).catch(() => req.continue())
      })
    }
    await page.evaluateOnNewDocument(FILM)
    await page.goto(base + (process.env.PAGE ? `/pages/${process.env.PAGE}` : "/"), { waitUntil: "networkidle0", timeout: 90000 }).catch(() => {})
    const roots = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-faq-root]")].map((r) => `${r.dataset.faqRoot}${r.hasAttribute("data-faq-reveal") ? "+reveal" : ""}`))
    const firstScreen = await page.evaluate(() => { const b = (window as unknown as { __band: { px: number; ms: number; who: Record<string, number> } }).__band; return { px: b.px, ms: b.ms, who: { ...b.who } } })
    await page.evaluate(() => { const w = window as unknown as { __band: { px: number; ms: number; first: number; who: Record<string, number> } }; w.__band.px = 0; w.__band.ms = 0; w.__band.who = {} })
    await page.mouse.move(WIDTH / 2, HEIGHT / 2)
    const h = await page.evaluate(() => document.documentElement.scrollHeight)
    /* A reading pace: 120px every 60ms. */
    for (let y = 0; y < h; y += 120) { await page.mouse.wheel({ deltaY: 120 }); await sleep(60) }
    await sleep(1200)
    const scrolled = await page.evaluate(() => (window as unknown as { __band: { px: number; ms: number; who: Record<string, number> } }).__band)
    const rest = await page.evaluate(() => ({ armed: (window as unknown as { __armed: Set<string> }).__armed.size, faint: [...document.querySelectorAll<HTMLElement>("[data-faq-root] > [class$='__inner']")].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.99).length }))
    worst = Math.max(worst, scrolled.px, firstScreen.px)
    console.log(`${t}${process.env.PAGE ? "/" + process.env.PAGE : ""} ${WIDTH}  roots: ${roots.join(" ") || "none"}  first screen: ${firstScreen.px}px for ${Math.round(firstScreen.ms)}ms  scrolled: band up to ${scrolled.px}px, ${Math.round(scrolled.ms)}ms in all  FAQ reveal played: ${rest.armed}  FAQ contents left faint: ${rest.faint}${Object.keys({ ...firstScreen.who, ...scrolled.who }).length ? "  sections: " + JSON.stringify({ ...firstScreen.who, ...scrolled.who }) : ""}`)
    if (rest.faint) worst = Math.max(worst, 1)
    await page.close()
    server.close()
  }
  await browser.close()
  console.log(worst ? `\nwhite band up to ${worst}px` : "\nno band")
  process.exit(worst ? 1 : 0)
})()
