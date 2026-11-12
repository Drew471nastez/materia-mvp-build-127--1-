/**
 * THE TIPS BLOCK AND ITS AMOUNT SHEET, MEASURED (round AS).
 *
 * The real tips card and sheet (components/onepage/tip-block) in the real
 * BlockSheetProvider (scripts/render-onepage-tips-as.tsx), on a phone (390,
 * touch) and a computer (1440), in several shipped themes, light and dark:
 *
 *   card      an icon, the title and the line under it; the amounts in one
 *             row with Other, the middle one picked; "Tip $10" follows the
 *             pick; every amount's words read on it at 4.5:1 (picked or not)
 *   sheet     Other raises the sheet in the page's colours: the amount big,
 *             between - and +; + and - step on the grid (5 to 6, then down
 *             to 4); Show keypad opens the keypad by its own height; keys
 *             type 12.5 as $12.50; Continue is the full width; no foot bar,
 *             Close at the top right
 *   pay       Continue sends the amount, the block and where it came from
 *             (the sheet, the host, the referring site) and goes to Stripe;
 *             "Tip $5" from the card goes straight there, marked "card";
 *             with a note asked for, the card's Tip opens the sheet instead
 *   floor     a typed 0.5 says "At least $1" and does not leave the page
 *   currency  a RON store writes its amounts as "10 lei"
 *
 * Screenshots of each theme's card, sheet and keypad go to SHOTS (default
 * /tmp/op-tips-shots) for the visual review.
 *
 *   CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/check-onepage-tips-as.mjs
 *   REPORT=1 prints without failing. THEMES=gallery,ember picks themes.
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/tmp/chromium"].find((p) => existsSync(p))
const SHOTS = process.env.SHOTS || "/tmp/op-tips-shots"
mkdirSync(SHOTS, { recursive: true })
const THEMES = (process.env.THEMES || "gallery,ember,lagoon,acid,playful,vaporwave").split(",")
const posted = []
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-tips-as.tsx",
  api: (req, body) => {
    if (req.url !== "/api/onepage/tip") return null
    try {
      posted.push(JSON.parse(body))
    } catch {
      posted.push(null)
    }
    return { body: { url: "https://checkout.stripe.com/c/pay/probe" } }
  },
})
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

/* The contrast of an element's words on what is drawn behind them (its own fill, else the first ancestor's that has one). */
const CONTRAST = `(sel) => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  const out = []
  for (const el of document.querySelectorAll(sel)) {
    const layers = []
    for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) layers.push(c) }
    let ground = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }
    for (const l of layers.reverse()) ground = over(l, ground)
    const ink = over(parse(getComputedStyle(el).color), ground)
    const a = lum(ink), b = lum(ground)
    out.push(Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100)
  }
  return out
}`

async function setup(page, viewport, query) {
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 2, isMobile: viewport.touch, hasTouch: viewport.touch })
  await page.setRequestInterception(true)
  page.removeAllListeners("request")
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return void r.continue()
    if (u.hostname === "checkout.stripe.com") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><title>Stripe</title><p data-stripe>Stripe Checkout</p>" })
    return void r.respond({ status: 204, body: "" })
  })
  await page.goto(`${base}/app/onepage?${query}`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-tip-send]")
  await sleep(300)
}

async function tap(page, sel, touch) {
  const el = await page.$(sel)
  if (!el) return false
  if (touch) await el.tap()
  else await el.click()
  return true
}

const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\u00a0/g, " ").trim()).catch(() => null)

for (const [label, viewport] of [["390", { width: 390, height: 844, touch: true }], ["1440", { width: 1440, height: 900, touch: false }]]) {
  for (const theme of THEMES) {
    const page = await browser.newPage()
    const at = `${label} ${theme}`
    await setup(page, viewport, `theme=${theme}`)
    /* ── The card. ── */
    const card = await page.$("[data-onepage-app='tips']")
    await card.screenshot({ path: `${SHOTS}/${theme}-${label}-card.png` })
    const amounts = await page.$$eval("[data-tip-amount]", (els) => els.map((e) => ({ v: e.getAttribute("data-tip-amount"), on: e.getAttribute("aria-checked"), top: Math.round(e.getBoundingClientRect().top), h: Math.round(e.getBoundingClientRect().height) })))
    check(amounts.length === 4 && new Set(amounts.map((a) => a.top)).size === 1, `${at}: three amounts and Other in one row (${amounts.map((a) => a.v).join(", ")})`)
    check(amounts[1]?.on === "true" && amounts.filter((a) => a.on === "true").length === 1, `${at}: the middle amount is picked`)
    check(amounts.every((a) => a.h >= 44), `${at}: each amount is at least 44px tall (${amounts.map((a) => a.h).join(", ")})`)
    check((await text(page, "[data-tip-send]")) === "Tip $10", `${at}: the button says Tip $10 (${await text(page, "[data-tip-send]")})`)
    const ratios = await page.evaluate(`(${CONTRAST})("[data-tip-amount]")`)
    check(ratios.every((r) => r >= 4.5), `${at}: every amount reads at 4.5:1 or more (${ratios.join(", ")})`)
    await tap(page, "[data-tip-amount='500']", viewport.touch)
    await sleep(250)
    check((await text(page, "[data-tip-send]")) === "Tip $5", `${at}: picking $5 makes it Tip $5`)
    const ratiosPicked = await page.evaluate(`(${CONTRAST})("[data-tip-amount]")`)
    check(ratiosPicked.every((r) => r >= 4.5), `${at}: after the pick, every amount still reads (${ratiosPicked.join(", ")})`)

    /* ── The sheet. ── */
    await tap(page, "[data-tip-amount='other']", viewport.touch)
    await page.waitForSelector("[data-block-sheet-open] [data-tip-sheet]")
    await sleep(450)
    const value = () => page.$eval("[data-tip-value]", (el) => Number(el.getAttribute("data-tip-value")))
    check((await value()) === 500, `${at}: the sheet opens on the amount picked ($5)`)
    const shape = await page.evaluate(() => {
      const panel = document.querySelector("[data-block-sheet-panel]").getBoundingClientRect()
      const go = document.querySelector("[data-tip-continue]").getBoundingClientRect()
      const sheet = document.querySelector("[data-tip-sheet]").getBoundingClientRect()
      return { foot: !!document.querySelector("[data-block-sheet-foot]") && getComputedStyle(document.querySelector("[data-block-sheet-foot]")).display !== "none", close: !!document.querySelector("[data-block-sheet-close]"), goW: Math.round(go.width), sheetW: Math.round(sheet.width), title: document.querySelector("[data-block-sheet-title]").textContent, panelBottom: Math.round(panel.bottom), goBottom: Math.round(go.bottom), size: parseFloat(getComputedStyle(document.querySelector("[data-tip-value]")).fontSize) }
    })
    check(!shape.foot && shape.close, `${at}: no foot bar, Close at the top`)
    /* The sheet's column has 4px of room either side for the buttons' focus rings. */
    check(shape.goW >= shape.sheetW - 8, `${at}: Continue is the full width (${shape.goW} of ${shape.sheetW})`)
    check(shape.size >= 48, `${at}: the amount is big (${shape.size}px)`)
    check(shape.title === "Enter tip amount", `${at}: titled "${shape.title}"`)
    await page.screenshot({ path: `${SHOTS}/${theme}-${label}-sheet.png` })
    /*
      The amount is large text (3:1); Continue 4.5:1; Show keypad as well as the sheet's own title reads, which is the
      theme's sheet ink (lib/onepage/sheet-theme: on Classic 98's teal no ink reaches 4.5:1, white is 4.4).
    */
    const [amountRatio, continueRatio, toggleRatio, titleRatio] = await page.evaluate(`[...(${CONTRAST})("[data-tip-value]"), ...(${CONTRAST})("[data-tip-continue]"), ...(${CONTRAST})("[data-tip-keypad-toggle]"), ...(${CONTRAST})("[data-block-sheet-title]")]`)
    check(amountRatio >= 3 && continueRatio >= 4.5 && toggleRatio >= Math.min(4.5, titleRatio), `${at}: the amount (${amountRatio}), Continue (${continueRatio}) and Show keypad (${toggleRatio}, the title ${titleRatio}) read`)
    await tap(page, "[data-tip-plus]", viewport.touch)
    await sleep(80)
    const up = await value()
    await tap(page, "[data-tip-minus]", viewport.touch)
    await sleep(80)
    await tap(page, "[data-tip-minus]", viewport.touch)
    await sleep(80)
    const down = await value()
    check(up === 600 && down === 400, `${at}: + steps to $6, - twice to $4 (${up}, ${down})`)

    /* ── The keypad. ── */
    const closedH = await page.$eval("[data-tip-keypad]", (el) => Math.round(el.parentElement.getBoundingClientRect().height))
    await tap(page, "[data-tip-keypad-toggle]", viewport.touch)
    /* The keypad's own opening (200ms) and the sheet easing to its new height (320ms) before a key is pressed. */
    await sleep(700)
    const openH = await page.$eval("[data-tip-keypad]", (el) => Math.round(el.parentElement.getBoundingClientRect().height))
    check(closedH === 0 && openH > 200, `${at}: Show keypad opens it (${closedH}px to ${openH}px)`)
    for (const k of ["back", "1", "2", ".", "5"]) await tap(page, `[data-tip-key='${k}']`, viewport.touch)
    await sleep(80)
    check((await value()) === 1250 && (await text(page, "[data-tip-value]")) === "$12.50", `${at}: keys type 12.5 as $12.50 (${await text(page, "[data-tip-value]")})`)
    await page.screenshot({ path: `${SHOTS}/${theme}-${label}-keypad.png` })

    /* ── Continue. ── */
    const before = posted.length
    await Promise.all([page.waitForNavigation({ timeout: 5000 }).catch(() => null), tap(page, "[data-tip-continue]", viewport.touch)])
    const sent = posted[before]
    check(!!sent && sent.amount_cents === 1250 && sent.block_id === "tips1" && sent.source?.placement === "sheet" && sent.source?.host === "127.0.0.1", `${at}: Continue sends $12.50 from the sheet (${JSON.stringify(sent?.source ?? null)})`)
    check(new URL(page.url()).hostname === "checkout.stripe.com", `${at}: and goes to Stripe Checkout`)

    /* ── The card's own Tip goes straight to Stripe. ── */
    await setup(page, viewport, `theme=${theme}`)
    const n = posted.length
    await Promise.all([page.waitForNavigation({ timeout: 5000 }).catch(() => null), tap(page, "[data-tip-send]", viewport.touch)])
    check(posted[n]?.amount_cents === 1000 && posted[n]?.source?.placement === "card", `${at}: Tip $10 from the card pays $10, marked card`)
    await page.close()
  }
}

/* ── A note asked for, the floor, a store in lei. ── */
{
  const page = await browser.newPage()
  await setup(page, { width: 390, height: 844, touch: true }, "theme=gallery&message=1")
  await (await page.$("[data-tip-send]")).tap()
  await page.waitForSelector("[data-block-sheet-open] [data-tip-message]").catch(() => null)
  check(!!(await page.$("[data-block-sheet-open] [data-tip-message]")), "with a note asked for, Tip opens the sheet with the note field")
  await page.screenshot({ path: `${SHOTS}/gallery-390-note.png` })
  await setup(page, { width: 390, height: 844, touch: true }, "theme=gallery")
  await (await page.$("[data-tip-amount='other']")).tap()
  await page.waitForSelector("[data-tip-keypad-toggle]")
  await sleep(400)
  await (await page.$("[data-tip-keypad-toggle]")).tap()
  await sleep(700)
  for (const k of ["back", "back", "back", "0", ".", "5"]) await (await page.$(`[data-tip-key='${k}']`)).tap()
  const n = posted.length
  await (await page.$("[data-tip-continue]")).tap()
  await sleep(300)
  await page.screenshot({ path: `${SHOTS}/gallery-390-floor.png` })
  check(posted.length === n && (await text(page, "[data-tip-hint]")) === "At least $1", `a typed $0.50 says "${await text(page, "[data-tip-hint]")}" and sends nothing`)
  await setup(page, { width: 390, height: 844, touch: true }, "theme=gallery&currency=ron")
  const lei = await page.$$eval("[data-tip-amount]", (els) => els.map((e) => e.textContent.replace(/\u00a0/g, " ").trim()))
  check(lei.slice(0, 3).join("|") === "10 lei|20 lei|50 lei", `a RON store writes its amounts in lei (${lei.join(", ")})`)
  await page.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots in ${SHOTS}`)
if (failures.length && !report) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log(failures.length ? `\n${failures.length} over (REPORT)` : "\nall passed")
