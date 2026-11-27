/**
 * ===========================================================================
 *  ROUND 69: WHAT A SITE FROM A TEMPLATE LOOKS LIKE ONCE THE PLAN IS PLACED
 * ===========================================================================
 * Draws, in headless Chromium, the home page a Start with AI job writes
 * BEFORE the model's first turn (lib/ai-builder/agent/blueprint.ts): the base
 * template's frame with home replaced by the blueprint's sections (their
 * preset items, the layout a template gave each) and the blueprint's fonts,
 * schemes and motion; beside it, the template as it ships. Measured, not
 * judged: the sections drawn, the heading and body faces Chromium computed,
 * the section backgrounds, the page height. The words are the presets' and
 * the sample shop's (the model writes the business's), so this is the
 * structure and the look, never the copy.
 *
 *   node_modules/.bin/esbuild scripts/check-ai-blueprint-look.ts --bundle --platform=node --format=esm \
 *     --packages=external --alias:@=. --outfile=.tmp-test/look.mjs && node .tmp-test/look.mjs <outdir>
 *
 * Writes <outdir>/<case>-<template|plan>-<desktop|phone>.png and prints one JSON line per drawing.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { importTemplate, serve, siteFor } from "./theme-templates/site"
import { COVER_CSS } from "./theme-templates/cover-prep"
import { SAMPLE_SHOPS } from "./theme-templates/shops"
import { blueprintHome, blueprintSettings, composeMateriaSite, schemeKeys } from "../lib/storelib-ai/materia/compose"
import { presetParts } from "../lib/ai-builder/agent/content-check"
import { materiaSection } from "../lib/storelib-ai/materia/catalogue"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"
const out = process.argv[2] ?? ".tmp-test/look"
const CASES = [
  { name: "coach", prompt: "A website for my personal training business with my programs, client results, prices and a way to book a free first call.", category: "fitness_coach" },
  { name: "candles", prompt: "An online shop for my hand-poured soy candles, with a warm and calm look, best sellers on the home page and the story of how they are made.", category: "candle_shop" },
  { name: "label", prompt: "Streetwear label from Berlin, limited drops of heavyweight hoodies and caps." },
]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  mkdirSync(out, { recursive: true })
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] })
  try {
    for (const c of CASES) {
      const bp = composeMateriaSite({ prompt: c.prompt, category: c.category ?? null })
      for (const variant of ["template", "plan"] as const) {
        const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${bp.base}`)
        if (variant === "plan") {
          const settings = imported.theme.settings as { shopify: Record<string, unknown> }
          const keys = schemeKeys(settings.shopify)
          settings.shopify = blueprintSettings(bp, settings.shopify)
          const home = imported.theme.pages.find((p) => p.page_key === "home")!
          let n = 0
          const mint = (t: string) => `${t.slice(0, 30)}-look-${++n}`
          const body = blueprintHome(bp, keys).filter((p) => imported.files[`sections/${p.type}.storelib`]).map((p) => {
            const preset = presetParts(p.type, imported.files, mint)
            return { id: mint(p.type), type: p.type, name: materiaSection(p.type)?.name ?? p.type, settings: { ...(preset?.settings ?? {}), ...p.settings }, blocks: preset?.blocks ?? [] }
          })
          const frame = (home.sections as { group?: string }[]).filter((s) => !!s.group)
          home.sections = [...frame.filter((s) => s.group !== "footer"), ...body, ...frame.filter((s) => s.group === "footer")] as never
        }
        const shop = SAMPLE_SHOPS[bp.base] ?? { name: "Sample store", products: [] }
        const built = siteFor(imported, { name: shop.name, products: shop.products })
        const { base, server } = await serve(built, join("scripts", "theme-templates", "products", bp.base), { eager: true })
        try {
          for (const [vpName, vp] of [["desktop", { width: 1280, height: 860, deviceScaleFactor: 2 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]] as const) {
            const p = await browser.newPage()
            await p.setViewport(vp)
            const errors: string[] = []
            p.on("pageerror", (e) => errors.push(String(e).slice(0, 120)))
            await p.evaluateOnNewDocument("window.__name = (f) => f")
            await p.goto(`${base}/`, { waitUntil: "networkidle2", timeout: 60_000 }).catch((e) => errors.push(String(e).slice(0, 120)))
            await p.addStyleTag({ content: COVER_CSS }).catch(() => undefined)
            await p.evaluate(async () => {
              const step = Math.round(innerHeight * 0.8)
              for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)) }
              scrollTo(0, 0)
            }).catch(() => undefined)
            await sleep(800)
            const facts = await p.evaluate(() => {
              const sections = [...document.querySelectorAll("main [id^='shopify-section'], main section, [data-section-type], .shopify-section")].filter((e) => !e.closest("header, footer"))
              const h = document.querySelector("main h1, main h2") as HTMLElement | null
              const b = document.querySelector("main p") as HTMLElement | null
              const bgs = [...new Set([...document.querySelectorAll("main .shopify-section, main [id^='shopify-section']")].map((e) => getComputedStyle(e.firstElementChild ?? e).backgroundColor))].slice(0, 6)
              return { sections: sections.length, heading: h ? getComputedStyle(h).fontFamily.split(",")[0] : null, body: b ? getComputedStyle(b).fontFamily.split(",")[0] : null, backgrounds: bgs, height: document.documentElement.scrollHeight, sideScroll: document.documentElement.scrollWidth > innerWidth + 1 }
            })
            const file = join(out, `${c.name}-${variant}-${vpName}.png`)
            const shot = await p.screenshot({ fullPage: true, captureBeyondViewport: true, type: "png" })
            writeFileSync(file, shot)
            console.log(JSON.stringify({ case: c.name, base: bp.base, variant, viewport: vpName, ...facts, errors: errors.length, file, ...(variant === "plan" ? { plan: bp.home.map((s) => s.type), type: `${bp.type.display}/${bp.type.body}`, palette: bp.palette.id } : {}) }))
            await p.close()
          }
        } finally {
          server.close()
        }
      }
    }
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
