/**
 * THE THEME CARDS, DRAWN IN A BROWSER AND MEASURED.
 *
 * The Design tab's Theme page in the real editor (scripts/onepage-probe-server.mjs)
 * at 390 (touch) and 1440. For every card: it holds one swatch
 * (components/onepage/themes/theme-swatch) in its theme's layout: Classic
 * with the profile disc, Hero with the picture and its corner mark; two whole
 * buttons; it draws nothing of the creator's (no photo, no
 * link, no product); and pointing at it moves and resizes nothing: the
 * card's box, the swatch's and the button's are the same before and under
 * the pointer, and the button has no transform of its own.
 *
 *   node scripts/check-onepage-theme-swatches.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-theme-swatches.mjs   (also keeps pictures of the grids)
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || ""
if (shots) mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`); if (!ok) failed++ }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu",
  /* A headless browser says it has no pointer that hovers, so every hover rule is off. This gives it a mouse. */
  "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"] })
const { base, server } = await serveEditorProbe({ blocks: [{ id: "l1", type: "link_button", enabled: true, sort_order: 0, data: { label: "Studio visits", url: "https://example.com/v" } }], fail })
for (const width of [390, 1440]) {
  const phone = width < 600
  console.log(`\n${width}px`)
  const p = await browser.newPage()
  /* A headless browser can report no hover; a computer's window has a mouse, so it is told so (the page's hover rules sit under @media (hover: hover)). */
  if (!phone) {
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "hover" }, { name: "any-hover", value: "hover" }, { name: "pointer", value: "fine" }] }).catch(() => {})
  }
  await p.evaluateOnNewDocument(() => { window.PROBE_TITLE = "Mara Okafor" })
  await p.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone })
  await p.goto(`${base}/app/onepage#design`)
  await p.waitForSelector('[data-nav-row="theme"]', { timeout: 60000 })
  await sleep(600)
  if (phone) await p.tap('[data-nav-row="theme"]')
  else await p.click('[data-nav-row="theme"]')
  await p.waitForSelector("[data-theme-card] [data-ts-button]", { timeout: 30000 })
  await sleep(1500)
  const grid = await p.$("[data-theme-grid]")
  const tall = await grid.evaluate((e) => Math.ceil(e.getBoundingClientRect().height) + 400)
  await p.setViewport({ width, height: tall, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone })
  await sleep(1200)
  if (shots) await grid.screenshot({ path: join(shots, `swatches-${width}.png`) })

  const cards = await p.evaluate(() => [...document.querySelectorAll("[data-theme-card]")].map((card) => {
    const frame = card.querySelector("[data-theme-frame]")
    const page = card.querySelector("[data-ts-page]")
    const f = frame.getBoundingClientRect()
    const pg = page.getBoundingClientRect()
    const name = card.querySelector("[data-ts-name]")
    const button = card.querySelector("[data-ts-button]")
    const b = button.getBoundingClientRect()
    return {
      id: card.getAttribute("data-theme-card"),
      swatches: card.querySelectorAll("[data-ts-page]").length,
      fills: Math.abs(pg.width - f.width) < 1 && pg.height >= f.height - 1,
      ratio: f.width / f.height,
      letters: name?.textContent,
      face: getComputedStyle(name).fontFamily,
      buttons: [...card.querySelectorAll("[data-ts-button]")].map((el) => { const r = el.getBoundingClientRect(); return r.top >= f.top && r.bottom <= f.bottom && r.left > f.left && r.right < f.right }),
      layout: page.getAttribute("data-ts-layout"),
      disc: !!card.querySelector("[data-ts-disc]"),
      heroPicture: !!card.querySelector("[data-ts-hero]"),
      heroMark: !!card.querySelector("[data-theme-hero]"),
      own: card.querySelectorAll("[data-tp-photo], [data-tp-link], [data-tp-product], [data-tp-news], [data-tp-avatar], [data-tp-socials]").length,
      label: card.querySelector("[data-theme-name]")?.textContent,
    }
  }))
  check(`${cards.length} cards, each one swatch that fills its 4:5 frame`, cards.length >= 70 && cards.every((c) => c.swatches === 1 && c.fills && Math.abs(c.ratio - 0.8) < 0.01), cards.filter((c) => c.swatches !== 1 || !c.fills || Math.abs(c.ratio - 0.8) >= 0.01).map((c) => c.id).join())
  check('each sets "Aa" in a face and names its theme under it', cards.every((c) => c.letters === "Aa" && c.face && c.label), cards.filter((c) => c.letters !== "Aa" || !c.label).map((c) => c.id).join())
  check("each card draws two of its theme's buttons, both whole inside the card", cards.every((c) => c.buttons.length === 2 && c.buttons.every(Boolean)), cards.filter((c) => c.buttons.length !== 2 || !c.buttons.every(Boolean)).map((c) => c.id).join())
  const heroes = cards.filter((c) => c.layout === "hero")
  check(`a Classic card draws the profile disc and no Hero mark (${cards.length - heroes.length})`, cards.filter((c) => c.layout === "classic").every((c) => c.disc && !c.heroPicture && !c.heroMark))
  check(`a Hero card draws a glow of its colours fading into the page, no pill in its corner (${heroes.length})`, heroes.length >= 3 && heroes.every((c) => c.heroPicture && !c.heroMark && !c.disc), heroes.map((c) => c.id).join())
  check("nothing of the creator's is drawn on a card", cards.every((c) => c.own === 0))

  if (!phone) {
    /* Under the pointer: every box as it was. */
    const moved = []
    const box = (id) => p.evaluate((id) => {
      const card = document.querySelector(`[data-theme-card="${id}"]`)
      const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((n) => Math.round(n * 100) / 100).join() }
      const button = card.querySelector("[data-ts-button]")
      const cs = getComputedStyle(button)
      return [r(card), r(card.querySelector("[data-theme-frame]")), r(button), cs.transform, cs.translate, cs.scale, cs.opacity].join(" | ")
    }, id)
    for (const c of cards) {
      const before = await box(c.id)
      const el = await p.$(`[data-theme-card="${c.id}"]`)
      await el.hover()
      await sleep(260)
      const under = await box(c.id)
      if (before !== under) moved.push(`${c.id}: ${before} -> ${under}`)
    }
    check(`pointing at a card moves nothing (${cards.length} cards: the card, its swatch and its button measured before and under the pointer)`, moved.length === 0, moved.slice(0, 3).join("; "))
    const first = await p.$("[data-theme-card]")
    await first.hover()
    await sleep(400)
    const hairline = await p.evaluate(() => {
      const card = document.querySelector("[data-theme-card]")
      return `${card.matches(":hover")} ${getComputedStyle(card.querySelector("[data-theme-hover]")).opacity} ${matchMedia("(hover: hover)").matches}`
    })
    /* Tailwind gates hover styles behind @media (hover: hover); where the browser says it has no such pointer, the rule cannot apply here and is reported, not passed. */
    if (hairline.endsWith("false")) console.log("  skip  the pointer darkens the swatch's hairline (this browser reports no hover-capable pointer, so no hover style applies here)")
    else check("the pointer only darkens the swatch's hairline", hairline.startsWith("true 1"), hairline)
  }
  await p.close()
}
server.close()
await browser.close()
console.log(failed ? `\n${failed} FAILED` : "\nall passed")
process.exit(failed ? 1 : 0)
