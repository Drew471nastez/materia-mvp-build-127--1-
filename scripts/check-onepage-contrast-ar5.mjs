/**
 * ===========================================================================
 *  EVERY THEME, EVERY BUTTON STYLE, THE OVERRIDES THAT BREAK PAGES: NO WORD
 *  UNDER 4.5:1 (round AR5)
 * ===========================================================================
 * The live page's own component (scripts/render-onepage-ar5.tsx), one page
 * holding every block that draws words or a button, drawn at 390x6000 (a
 * phone, tall enough that every block is on screen and has arrived) in:
 *
 *   every theme in the Design tab
 *   x the theme's own button style, then Solid, Soft, Outline and Glass
 *   x the overrides that used to make words vanish:
 *       none        the theme as it is
 *       same-ink    the button's words in the button's colour, the page's
 *                   words, small print and name in the page's colour
 *       pale        a pale yellow button with white words, near white text
 *                   on whatever the theme's page is
 *       dark        near black everything on a near black page
 *
 * In each, every visible text node is measured against what is painted
 * under it (scripts/ar5-measure.mjs): 4.5:1 for text, 3:1 for large text.
 * Both builders are run: the published copy (/l/<slug>) and the draft (the
 * editor's preview frame).
 *
 *   node scripts/check-onepage-contrast-ar5.mjs
 *   THEMES=default,air node scripts/check-onepage-contrast-ar5.mjs
 *   VIEWS=live node scripts/check-onepage-contrast-ar5.mjs
 */
import { existsSync, writeFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
import { MEASURE } from "./ar5-measure.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const STYLES = ["theme", "filled", "soft", "outline", "glass"]
const OVERRIDES = {
  none: () => ({}),
  "same-ink": (t) => ({ button_text_color: t.button_color, text_color: t.background_color, secondary_text_color: t.background_color, title_color: t.background_color, button_hover_text: t.button_hover_fill ?? null }),
  pale: () => ({ button_color: "#fff3a6", button_text_color: "#ffffff", text_color: "#fafafa", secondary_text_color: "#f1f1f1", title_color: "#ffffff" }),
  dark: () => ({ background_type: "solid", background_color: "#0d0d0f", background_gradient: "", text_color: "#151517", secondary_text_color: "#202024", title_color: "#18181b", button_color: "#1a1a1d", button_text_color: "#111113" }),
}

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-ar5.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const CALM = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}"
const views = (process.env.VIEWS || "live,preview").split(",")
const report = { cases: 0, checked: 0, onPhoto: 0, fails: [], perView: {} }
try {
  for (const view of views) {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 6000, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    page.on("pageerror", (e) => console.error("pageerror", e.message))
    await page.goto(`${base}/app/onepage${view === "preview" ? "?preview" : ""}`, { waitUntil: "load" })
    await page.waitForFunction(() => typeof window.__ar5Render === "function", { timeout: 20000 })
    await page.addStyleTag({ content: CALM })
    const themes = await page.evaluate(() => window.__ar5Themes)
    const only = process.env.THEMES ? process.env.THEMES.split(",") : null
    const v = { cases: 0, checked: 0, onPhoto: 0, fails: 0 }
    for (const t of themes) {
      if (only && !only.includes(t.id)) continue
      for (const style of STYLES) {
        for (const [name, make] of Object.entries(OVERRIDES)) {
          const cfg = { ...t.theme_config, ...(style === "theme" ? {} : { button_style: style }) }
          const theme = { ...cfg, ...make(cfg), template_id: t.id }
          const t0 = Date.now()
          await page.evaluate((th) => window.__ar5Render(th), theme)
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          const t1 = Date.now()
          const m = await page.evaluate(MEASURE)
          if (process.env.TIMING) console.log(`render ${t1 - t0}ms, measure ${Date.now() - t1}ms`)
          v.cases++
          v.checked += m.checked
          v.onPhoto += m.onPhoto
          v.fails += m.fails.length
          for (const f of m.fails) report.fails.push({ view, theme: t.id, style, override: name, ...f })
        }
      }
      process.stdout.write(`${view} ${t.id}: ${report.fails.filter((f) => f.view === view && f.theme === t.id).length} under the bar\n`)
    }
    report.perView[view] = v
    report.cases += v.cases
    report.checked += v.checked
    report.onPhoto += v.onPhoto
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

const out = process.env.OUT || "ar5-contrast.json"
writeFileSync(out, JSON.stringify(report, null, 2))
const byBlock = {}
for (const f of report.fails) byBlock[`${f.block} "${f.text}"`] = (byBlock[`${f.block} "${f.text}"`] || 0) + 1
console.log(`\n${report.cases} cases (${Object.keys(report.perView).join(" + ")}), ${report.checked} text nodes measured, ${report.onPhoto} on a photo (not measured), ${report.fails.length} under the bar`)
for (const [k, n] of Object.entries(byBlock).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${n}x ${k}`)
console.log(`report: ${out}`)
process.exit(report.fails.length ? 1 : 0)
