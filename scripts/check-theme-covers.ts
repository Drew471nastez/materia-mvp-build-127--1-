/**
 * ===========================================================================
 *  EVERY TEMPLATE'S HOME PAGE, AS THE COVER PHOTOGRAPHS IT, MEASURED (round 30)
 * ===========================================================================
 *   npx tsx scripts/check-theme-covers.ts [template ...]
 *
 * The two things the owner caught on the marketplace's covers, measured on
 * every template (or the ones named) at 1440 x 900 and at a phone's 390 x
 * 844, in the page the cover script photographs (scripts/theme-templates/
 * cover-prep.ts):
 *
 *   • card buttons: how many wishlist and quick view buttons headless
 *     Chromium draws on the cards as it is (what an old cover showed), and
 *     that none is visible once the cover's own styles are in
 *   • backgrounds painted in every screen: what is fixed to the screen at
 *     half its height or more, and what has a background attached to it;
 *     with the cover's styles none is attached to the screen, and past the
 *     first screen nothing fixed to it is still visible
 *
 * Prints a line per template and screen, and fails when a cover would still
 * show either. RAW counts say which covers built before round 30 need
 * building again.
 */
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { CODE_TEMPLATES } from "../lib/themes/marketplace-shared"
import { importTemplate, serve, siteFor } from "./theme-templates/site"
import { SAMPLE_SHOPS } from "./theme-templates/shops"
import { BACKDROP_SHARE, COVER_CARD_CONTROLS, COVER_CSS, releaseForPhotograph } from "./theme-templates/cover-prep"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const names = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** In the page: card controls drawn, backdrops fixed to the screen, backgrounds attached to it. */
function measure(controls: string[], share: number) {
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false
    }
    return true
  }
  const cards = document.querySelectorAll(".product-item").length
  const buttons = Array.from(document.querySelectorAll(controls.join(", "))).filter((el) => el.matches(".pc-action, .product-item__button-wishlist, button-quickview") && shown(el)).length
  let backdrops = 0
  let attached = 0
  const which: string[] = []
  /* On the screen: a drawer parked off it is not painted. */
  const onScreen = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.right > 1 && r.left < innerWidth - 1 && r.bottom > 1 && r.top < innerHeight - 1
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("html, body, body *"))) {
    const cs = getComputedStyle(el)
    if (cs.position === "fixed" && el.offsetHeight >= innerHeight * share && shown(el) && onScreen(el)) {
      backdrops++
      which.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 2).join(".")}`)
    }
    if (cs.backgroundAttachment.split(",").some((a) => a.trim() === "fixed") && cs.backgroundImage !== "none" && el.offsetHeight > 0) attached++
  }
  return { cards, buttons, backdrops, attached, which }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] })
  let failed = 0
  const needs: string[] = []
  try {
    for (const t of CODE_TEMPLATES.filter((x) => names.length === 0 || names.includes(x.template) || names.includes(x.slug))) {
      const imported = await importTemplate(`materia/${t.template}`)
      const shop = SAMPLE_SHOPS[t.template] ?? { name: t.name, products: [] }
      const built = siteFor(imported, { name: shop.name, products: shop.products })
      const { base, server } = await serve(built, join("scripts", "theme-templates", "products", t.template), { eager: true })
      for (const [vpName, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]] as const) {
        const p = await browser.newPage()
        await p.setViewport(vp)
        await p.evaluateOnNewDocument("window.__name = (f) => f")
        await p.goto(`${base}/`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => null)
        await sleep(600)
        const raw = await p.evaluate(measure, [...COVER_CARD_CONTROLS], BACKDROP_SHARE)
        await p.addStyleTag({ content: COVER_CSS })
        await sleep(150)
        await p.evaluate(releaseForPhotograph, true, BACKDROP_SHARE)
        const cover = await p.evaluate(measure, [...COVER_CARD_CONTROLS], BACKDROP_SHARE)
        await p.evaluate(() => scrollTo(0, innerHeight))
        await sleep(200)
        await p.evaluate(releaseForPhotograph, false, BACKDROP_SHARE)
        const later = await p.evaluate(measure, [...COVER_CARD_CONTROLS], BACKDROP_SHARE)
        const ok = cover.buttons === 0 && cover.attached === 0 && later.backdrops === 0
        if (!ok) failed++
        if (raw.buttons > 0 || raw.attached > 0 || raw.backdrops > 0) needs.push(`${t.template} ${vpName}`)
        console.log(`  ${ok ? "ok  " : "FAIL"}  ${t.template.padEnd(14)} ${vpName.padEnd(7)} cards ${raw.cards}, card buttons ${raw.buttons} -> ${cover.buttons}, screen backgrounds ${raw.attached} -> ${cover.attached}, backdrops ${raw.backdrops} -> ${later.backdrops} past the first screen${raw.which.length ? ` (${raw.which.join(", ")})` : ""}`)
        await p.close()
      }
      server.close()
    }
  } finally {
    await browser.close()
  }
  console.log(needs.length ? `\nCovers built before round 30 showed one of these on: ${needs.join(", ")}` : "\nNo template draws either.")
  console.log(failed ? `\n${failed} failed\n` : "\nall passed\n")
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
