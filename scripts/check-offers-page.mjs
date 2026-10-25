/**
 * ===========================================================================
 *  UPSELLS AND BUNDLES, DRAWN, PRESSED AND TIMED
 * ===========================================================================
 *   node scripts/check-offers-page.mjs        (SHOTS=dir to keep screenshots)
 *
 * The store's page (/app/offers) and its editor, a product page's bundles
 * and upsells, the checkout's Add to your order and the cart's suggestions
 * (scripts/render-offers.tsx), against a stubbed API, in headless Chromium at
 * a phone's width (390) and a computer's (1280). It reports the numbers:
 *
 *   the list     the gutter, the card's width, the rows' heights, list or
 *                table, nothing sideways, the views' counts, the search
 *   the editor   a sheet from the bottom on a phone, a centred dialog on a
 *                computer; how long it takes to open and to close (sampled
 *                every frame until it stops moving); every field's message
 *                when Save is pressed empty; the preview's price; the body
 *                Save sends, with every setting; Ctrl+Enter saves; closing
 *                with edits asks first
 *   storefront   each element in the block's own colour; Add all and Add
 *                put the right lines in the cart; the cart's suggestions
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
if (!existsSync(CHROMIUM)) { console.error("No browser"); process.exit(1) }
const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-offers-page-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-offers.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", COLL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const P = (id, title, priceCents, extra = {}) => ({ id, title, type: "physical", published: true, priceCents, imageUrl: null, payWhatYouWant: false, ...extra })
const offer = (o) => ({ triggerIds: [], triggerCollectionIds: [], discountType: "percent", discountValue: 10, active: true, placements: ["product", "cart", "checkout"], startsAt: null, endsAt: null, combinesWithCodes: true, maxPerOrder: null, minSubtotalCents: null, ...o })
const DATA = {
  currency: "USD", ready: true, settingsReady: true, physical: true,
  collections: [{ id: COLL, title: "Kitchen" }],
  products: [P(A, "Wildflower honey", 3200), P(B, "Honey dipper", 800), P(C, "Beeswax candle with a long name for small screens", 900, { published: false })],
  offers: [
    offer({ id: "o1", kind: "bundle", title: "Breakfast set", productIds: [A, B], discountValue: 15, placements: ["product", "cart"] }),
    offer({ id: "o2", kind: "checkout", title: "Add a candle", productIds: [C], discountType: "fixed", discountValue: 300, active: false }),
    offer({ id: "o3", kind: "checkout", title: "Autumn upsell", productIds: [B], startsAt: "2099-01-01T00:00:00.000Z" }),
  ],
}
const STORE = {
  "POST /api/store/offers": { offer: offer({ id: "o9", kind: "bundle", title: "Buy it together", productIds: [A, B] }) },
  "PUT /api/store/offers": { offer: offer({ id: "o2", kind: "checkout", title: "Add a candle", productIds: [C], discountType: "fixed", discountValue: 300 }) },
  "PATCH /api/store/offers": { ok: true },
}
const ITEM = (id, title, priceCents, variants) => ({ id, title, slug: id, imageUrl: null, type: "physical", priceCents, variants })
const BUNDLE = { "GET /api/offers/bundles": {
  bundles: [{ offerId: "o1", title: "Breakfast set", label: "15% off", discountType: "percent", discountValue: 15, fullCents: 4000, priceCents: 3400, items: [ITEM("a", "Wildflower honey", 3200, [{ id: "av", name: "Default", priceCents: 3200 }]), ITEM("b", "Honey dipper", 800, [{ id: "b1", name: "Oak", priceCents: 800 }, { id: "b2", name: "Walnut", priceCents: 900 }])] }],
  upsells: [{ offerId: "u1", title: "Add a candle", label: "$3 off", discountType: "fixed", discountValue: 300, offerPriceCents: 600, product: ITEM("c", "Beeswax candle", 900, [{ id: "cv", name: "Default", priceCents: 900 }]) }],
} }
const CART = {
  offers: [{ offerId: "o1", title: "Breakfast set", savedCents: 600, freeShipping: false }], offerCents: 600, lines: [],
  suggestions: [{ offerId: "u1", title: "Add a candle", label: "$3 off", offerPriceCents: 600, product: ITEM("c", "Beeswax candle", 900, [{ id: "cv", name: "Default", priceCents: 900 }]) }],
  completions: [{ offerId: "o4", title: "Tea set", label: "10% off", missing: [ITEM("t", "Teapot", 2500, [{ id: "tv", name: "Default", priceCents: 2500 }])], savingCents: 350 }],
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(panel, vp, extra = {}) {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((p, a, d, c) => { window.__panel = p; window.__api = a; window.__data = d; window.__cart = c }, panel, extra.api ?? {}, extra.data ?? DATA, extra.cart ?? CART)
  await page.goto(`file://${join(out, "index.html")}`)
  await wait(350)
}
const fits = () => page.evaluate(() => {
  const over = document.documentElement.scrollWidth - innerWidth
  const cut = [...document.querySelectorAll("button, label, p, h1, h2, h3")].filter((el) => {
    if (!(el instanceof HTMLElement) || !el.offsetParent) return false
    const r = el.getBoundingClientRect()
    return r.right > innerWidth + 1 || (el.tagName === "BUTTON" && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible")
  }).map((el) => (el.textContent || "").trim().slice(0, 40))
  return { over, cut }
})
const fitLine = (f) => `nothing runs off the side or is cut (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`
/**
 * Samples the editor's form every frame (its own box, which moves with the sheet or the dialog, and its opacity
 * through every ancestor) and says when it last changed: how long it took to settle, or to be gone.
 */
const motion = (closing) => page.evaluate((closing) => new Promise((resolve) => {
  const t0 = performance.now()
  let last = null, changed = t0, frames = 0
  const tick = () => {
    frames++
    const el = document.querySelector("[data-offer-editor]")
    const t = performance.now()
    if (!el) return resolve({ ms: Math.round(t - t0), frames, gone: true })
    const r = el.getBoundingClientRect()
    let op = 1
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) op *= Number(getComputedStyle(n).opacity)
    const now = `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${op.toFixed(2)}`
    if (now !== last) { last = now; changed = t }
    if ((!closing && t - changed > 400) || t - t0 > 2000) return resolve({ ms: Math.round(changed - t0), frames, at: now, gone: false })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}), closing)

for (const [name, vp] of [["a phone (390)", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["a computer (1280)", { width: 1280, height: 900 }]]) {
  const phone = vp.width < 640
  console.log(`\nThe offers list on ${name}`)
  await open("admin", vp, { api: STORE })
  let f = await fits()
  say(f.over <= 0 && f.cut.length === 0, fitLine(f))
  const L = await page.evaluate(() => {
    const card = document.querySelector("[data-offers-card]").getBoundingClientRect()
    const h1 = document.querySelector("h1")
    const shown = (sel) => [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0)
    const rows = shown("[data-row]")
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => t.innerText.replace(/\s+/g, " ").trim())
    const nb = document.querySelector("[data-offer-new]").getBoundingClientRect()
    return { gutter: Math.round(card.left), cardWidth: Math.round(card.width), title: getComputedStyle(h1).fontSize, rows: rows.length, rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)), table: shown("table").length, list: shown("[data-list]").length, tabs, newButton: `${Math.round(nb.width)}x${Math.round(nb.height)}`, text: rows.map((r) => r.innerText.replace(/\s+/g, " ").trim().slice(0, 120)), appGutter: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-gutter")) }
  })
  console.log(`        gutter ${L.gutter}px, card ${L.cardWidth}px, title ${L.title}, rows ${L.rowHeights.join("/")}px, New offer ${L.newButton}, ${L.table ? "table" : "list"}`)
  say(phone ? L.gutter === L.appGutter && L.list === 1 && L.table === 0 : L.table === 1 && L.list === 0 && L.cardWidth <= 1323, `${phone ? `the app's own phone gutter (--app-gutter ${L.appGutter}px, as Coupons and Collections) and a list of whole-row presses` : "a table inside the products page's column"} (${L.gutter}px, ${L.cardWidth}px)`)
  say(L.rows === 3 && L.rowHeights.every((h) => h >= (phone ? 64 : 52)), `three rows, each ${phone ? "at least 64px to press" : "a table row"}: ${L.rowHeights.join(", ")}`)
  say(L.tabs.join(" | ") === "All 3 | Active 1 | Scheduled 1 | Off 1", `views with their counts: ${L.tabs.join(" | ")}`)
  say(/Breakfast set/.test(L.text[0]) && /15% off/.test(L.text[0]) && /Wildflower honey \+ Honey dipper/.test(L.text[0]) && /\$3 off/.test(L.text[1]) && /Off/.test(L.text[1]) && /Scheduled/.test(L.text[2]), `each row says its type, discount, contents and status: ${L.text.map((t) => `"${t}"`).join(" / ")}`)
  await page.type("[data-offer-search]", "candle")
  await wait(60)
  const found = await page.evaluate(() => [...document.querySelectorAll("[data-row]")].filter((el) => el.getClientRects().length > 0).length)
  say(found === 1, `search finds by a product's name: ${found} row`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offers-list-${vp.width}.png`, fullPage: true })

  console.log(`\nThe editor on ${name}`)
  await open("admin", vp, { api: STORE })
  await page.click("[data-offer-new]")
  const opened = await motion(false)
  const D = await page.evaluate(() => {
    const el = document.querySelector("[data-offer-editor]").closest('[role="dialog"]') ?? document.querySelector("[data-offer-editor]").parentElement
    const r = el.getBoundingClientRect()
    const field = document.querySelector("#offer-title")
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), fieldFont: getComputedStyle(field).fontSize, fieldHeight: Math.round(field.getBoundingClientRect().height) }
  })
  console.log(`        opens in ${opened.ms}ms (${opened.frames} frames); panel ${D.width}x${D.height} at ${D.left},${D.top}; fields ${D.fieldFont} in ${D.fieldHeight}px boxes`)
  say(phone ? D.bottom >= 843 && D.width === 390 : Math.abs(D.left + D.width / 2 - 640) <= 2 && D.width <= 640, phone ? `a sheet from the bottom, the screen's width (${D.bottom}px, ${D.width}px)` : `a dialog in the middle, at most 640px wide (${D.width}px)`)
  say(opened.ms <= 450, `it is in place within 450ms: ${opened.ms}ms`)
  say(phone ? D.fieldFont === "16px" && D.fieldHeight >= 44 : D.fieldHeight >= 36, `fields: ${D.fieldFont}, ${D.fieldHeight}px`)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `the editor: ${fitLine(f)}`)
  await page.evaluate(() => { const t = document.querySelector("#offer-title"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(t, ""); t.dispatchEvent(new Event("input", { bubbles: true })) })
  await page.click("[data-offer-save]")
  await wait(120)
  const msgs = await page.evaluate(() => [...document.querySelectorAll("[data-problem] p")].map((p) => p.textContent).filter((t) => t && !/optional/i.test(t)))
  const posted = (await page.evaluate(() => window.__sent)).filter((x) => x.method === "POST").length
  say(msgs.length >= 2 && posted === 0 && msgs.some((m) => /name buyers will see/.test(m)) && msgs.some((m) => /2 to 5 products/.test(m)), `Save empty says what's missing under each field, and sends nothing: ${msgs.join(" | ")}`)
  await page.type("#offer-title", "Buy it together")
  await page.click(`[data-product-picker="offer-products"] [data-pick="${A}"]`)
  await page.click(`[data-product-picker="offer-products"] [data-pick="${B}"]`)
  await wait(60)
  const price = await page.$eval("[data-preview-price]", (el) => el.textContent)
  say(price === "$36", `the preview prices the set from the products and the discount: ${price} (10% off $40)`)
  await page.click('[data-place="cart"]')
  await page.type("#offer-limit", "2")
  await page.keyboard.down("Control")
  await page.keyboard.press("Enter")
  await page.keyboard.up("Control")
  await wait(250)
  const s = (await page.evaluate(() => window.__sent)).find((x) => x.method === "POST")
  const keys = ["kind", "title", "productIds", "triggerIds", "triggerCollectionIds", "minSubtotalCents", "discountType", "discountValue", "placements", "startsAt", "endsAt", "maxPerOrder", "combinesWithCodes", "active"]
  say(!!s && keys.every((k) => k in s.body) && s.body.kind === "bundle" && s.body.productIds.join() === `${A},${B}` && s.body.discountValue === 10 && s.body.placements.join() === "product" && s.body.maxPerOrder === 2, `Ctrl+Enter saves, and the body carries every setting: ${JSON.stringify(s?.body).slice(0, 220)}`)
  const closed = await motion(true)
  console.log(`        closes in ${closed.ms}ms after the save`)
  say(closed.gone && closed.ms <= 500, `it closes, and is gone within 500ms: ${closed.ms}ms`)
  const rowsAfter = await page.evaluate(() => [...document.querySelectorAll("[data-row]")].filter((el) => el.getClientRects().length > 0).length)
  say(rowsAfter === 4, `the new offer is in the list: ${rowsAfter} rows`)

  await open("admin", vp, { api: STORE })
  await page.click("[data-offer-new]")
  await wait(400)
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "Upsell")?.click())
  await wait(100)
  const up = await page.evaluate(() => ({ radios: [...document.querySelectorAll('[data-product-picker="offer-products"] [data-pick]')].map((b) => b.getAttribute("role")), places: [...document.querySelectorAll("[data-place]")].map((b) => b.getAttribute("data-place")), title: document.querySelector("#offer-title").value }))
  say(up.radios.every((r) => r === "radio") && up.places.join() === "product,cart,checkout" && up.title === "Add to your order", `an upsell picks one product and shows on product page, cart and checkout: ${up.places.join(", ")}`)
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "A collection")?.click())
  await wait(100)
  const coll = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Collections"] [role="checkbox"]')].map((b) => b.textContent.trim()))
  say(coll.join() === "Kitchen", `a collection can trigger it: ${coll.join()}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offer-editor-${vp.width}.png` })
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancel")?.click())
  await wait(600)
  const asked = await page.evaluate(() => document.body.textContent.includes("Discard changes?"))
  say(asked, "closing with changes asks before anything is lost")

  await open("admin", vp, { api: STORE })
  await page.click("[data-offer-new]")
  await wait(400)
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Cancel")?.click())
  const plainClose = await motion(true)
  console.log(`        Cancel with nothing changed: gone in ${plainClose.ms}ms`)
  say(plainClose.gone && plainClose.ms <= 500, `Cancel with nothing changed closes at once, no question: ${plainClose.ms}ms`)

  /*
    A QUANTITY BREAK (round AF): its tiers typed in place, each row measured
    (nothing sideways, 44px boxes on a phone), the preview priced by the
    checkout's formula, a tier added, and the tiers in the body Save sends.
  */
  console.log(`\nA quantity break's tiers on ${name}`)
  const QDATA = { ...DATA, offers: [...DATA.offers, offer({ id: "o5", kind: "quantity_break", title: "Buy more, save more", productIds: [A], discountType: "none", discountValue: 0, placements: ["product", "cart"], tiers: [{ quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0, label: "Buy 2 get 1 free", badge: "Most popular" }] })], sold: { o5: 12 } }
  await open("admin", vp, { api: { ...STORE, "POST /api/store/offers": { offer: offer({ id: "o6", kind: "quantity_break", title: "Buy more, save more", productIds: [A], discountType: "none", discountValue: 0, tiers: [] }) } }, data: QDATA })
  const qRow = await page.evaluate(() => [...document.querySelectorAll("[data-row]")].filter((el) => el.getClientRects().length > 0).map((r) => r.innerText.replace(/\s+/g, " ").trim()).find((t) => /Buy more, save more/.test(t)) ?? "")
  const soldCell = await page.evaluate(() => [...document.querySelectorAll("[data-offer-sold]")].filter((el) => el.getClientRects().length > 0).map((el) => el.textContent.trim()))
  say(/Quantity break/.test(qRow) && /Buy 2 get 1 free/.test(qRow) && (phone ? /12 sold/.test(qRow) : soldCell.includes("12")), `the list says its kind, its tiers and what it sold: "${qRow.slice(0, 110)}"${phone ? "" : `, Sold ${soldCell.join("/")}`}`)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `the list with a quantity break: ${fitLine(f)}`)
  await page.click("[data-offer-new]")
  await wait(400)
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "Quantity break")?.click())
  await wait(120)
  await page.click(`[data-product-picker="offer-products"] [data-pick="${A}"]`)
  await wait(80)
  const T = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-tier]")]
    const inputs = rows.flatMap((r) => [...r.querySelectorAll("input, select")])
    const prices = [...document.querySelectorAll("[data-preview-tier] [data-preview-price]")].map((el) => el.textContent)
    const editor = document.querySelector("[data-offer-editor]").getBoundingClientRect()
    const outside = inputs.filter((el) => { const r = el.getBoundingClientRect(); return r.left < editor.left - 1 || r.right > editor.right + 1 }).length
    const placeholder = rows[0]?.querySelector('input[maxlength="60"]')?.getAttribute("placeholder")
    return { rows: rows.length, heights: [...new Set(inputs.map((el) => Math.round(el.getBoundingClientRect().height)))], fonts: [...new Set(inputs.map((el) => getComputedStyle(el).fontSize))], rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)), prices, outside, placeholder, places: [...document.querySelectorAll("[data-place]")].map((b) => b.getAttribute("data-place")).join() }
  })
  console.log(`        ${T.rows} tiers, rows ${T.rowHeights.join("/")}px, fields ${T.fonts.join("/")} in ${T.heights.join("/")}px boxes, preview ${T.prices.join(" / ")}`)
  say(T.rows === 2 && T.outside === 0 && (phone ? T.heights.every((h) => h >= 44) && T.fonts.every((s) => s === "16px") : T.heights.every((h) => h >= 36)), `two starting tiers, every field inside the editor, ${phone ? "16px text in 44px boxes" : "36px boxes or more"}: ${T.heights.join("/")}px, ${T.fonts.join("/")}`)
  say(T.prices.join() === "$64,$96", `the preview is the checkout's formula at $32.00: 2 + 1 free $64, 3 + 2 free $96 (${T.prices.join(", ")})`)
  say(T.placeholder === "Buy 2 get 1 free" && T.places === "product,cart", `a blank label shows the tier's own words ("${T.placeholder}"); it shows on ${T.places}`)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `the tier editor: ${fitLine(f)}`)
  await page.click("[data-tier-add]")
  await wait(80)
  const third = await page.evaluate(() => ({ rows: document.querySelectorAll("[data-tier]").length, prices: [...document.querySelectorAll("[data-preview-tier] [data-preview-price]")].map((el) => el.textContent) }))
  /* 6 at 15% off $32.00: round(3200 * 85 / 100) * 6 = $163.20, one unit past the 3 + 2 block. */
  say(third.rows === 3 && third.prices.join() === "$64,$96,$163.20", `Add tier adds a bigger one, priced in the preview: ${third.prices.join(", ")}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offer-tiers-editor-${vp.width}.png` })
  if (process.env.SHOTS) await page.evaluate(() => document.querySelector("[data-tiers]")?.scrollIntoView({ block: "start" }))
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offer-tiers-rows-${vp.width}.png` })
  await page.evaluate(() => { const i = document.querySelectorAll('[data-tier="1"] input')[0]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "1"); i.dispatchEvent(new Event("input", { bubbles: true })) })
  await page.click("[data-offer-save]")
  await wait(120)
  const tierMsg = await page.evaluate(() => [...document.querySelectorAll("[data-tier] p")].map((p) => p.textContent).filter(Boolean))
  say(tierMsg.some((m) => /bigger than the tier above/.test(m)) && !(await page.evaluate(() => window.__sent)).some((x) => x.method === "POST"), `a tier smaller than the one above is said under it, and nothing is sent: ${tierMsg.join(" | ")}`)
  await page.evaluate(() => { const i = document.querySelectorAll('[data-tier="1"] input')[0]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "3"); i.dispatchEvent(new Event("input", { bubbles: true })) })
  await page.click("[data-offer-save]")
  await wait(300)
  const qs = (await page.evaluate(() => window.__sent)).find((x) => x.method === "POST")
  say(!!qs && qs.body.kind === "quantity_break" && qs.body.productIds.join() === A && qs.body.tiers.length === 3 && qs.body.tiers[0].quantity === 2 && qs.body.tiers[0].freeQuantity === 1 && qs.body.tiers[1].freeQuantity === 2 && qs.body.tiers[2].quantity === 6 && qs.body.tiers[2].discountType === "percent" && qs.body.tiers[2].discountValue === 15 && qs.body.discountType === "none", `Save sends the tiers as the server reads them: ${JSON.stringify(qs?.body?.tiers)?.slice(0, 220)}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offer-tiers-${vp.width}.png`, fullPage: true })

  /*
    THE EDITOR'S HELP (round AG): a line under the kind picker, what to
    watch for before saving (a draft product, another offer on the same
    product and which one a buyer gets), and Try it in a cart, priced by the
    server (stubbed here with the answer applyOffers gives).
  */
  console.log(`\nTry it in a cart, and the warnings, on ${name}`)
  const TRIED = { lines: [{ productId: A, title: "Wildflower honey", quantity: 5, unitCents: 3200, savedCents: 6400, offers: [{ offerId: "x", title: "Buy 3 get 2 free", kind: "quantity_break", savedCents: 6400, tier: 1 }] }], applied: [], subtotalCents: 16000, savedCents: 6400, totalCents: 9600, freeShipping: false }
  const WDATA = { ...DATA, offers: [...DATA.offers, offer({ id: "o7", kind: "quantity_break", title: "Honey by the jar", productIds: [A], discountType: "none", discountValue: 0, placements: ["product", "cart"], tiers: [{ quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0, label: "Buy 2 get 1 free", badge: "" }] })] }
  await open("admin", vp, { api: { ...STORE, "POST /api/store/offers/try": TRIED }, data: WDATA })
  await page.click("[data-offer-new]")
  await wait(400)
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "Quantity break")?.click())
  await wait(120)
  const hint = await page.evaluate(() => document.querySelector("[data-kind-hint]")?.textContent ?? "")
  say(hint === "Buy more of one product, pay less each, or get some free.", `a line under the kind picker says what it does: "${hint}"`)
  await page.click(`[data-product-picker="offer-products"] [data-pick="${C}"]`)
  await wait(120)
  const draftWarn = await page.evaluate(() => [...document.querySelectorAll("[data-offer-warnings] li")].map((li) => li.textContent))
  say(draftWarn.some((w) => /is a draft\. Buyers see this offer once it's published\./.test(w)), `a draft product is said before saving: ${draftWarn.join(" | ").slice(0, 120)}`)
  await page.click(`[data-product-picker="offer-products"] [data-pick="${A}"]`)
  await wait(120)
  const W = await page.evaluate(() => ({ warn: [...document.querySelectorAll("[data-offer-warnings] li")].map((li) => li.textContent), qty: document.querySelector("[data-try-cart] input")?.value }))
  say(W.warn.some((w) => /also has the quantity break “Honey by the jar”\. Only one applies to it: the one that saves more on the whole cart\./.test(w)), `another quantity break on the same product, and which one wins: ${W.warn.join(" | ").slice(0, 160)}`)
  say(W.qty === "5", `the sample cart starts at the biggest tier's units (2 + 1, 3 + 2: ${W.qty})`)
  await page.evaluate(() => document.querySelector("[data-try-cart]")?.scrollIntoView({ block: "center" }))
  await page.click("[data-try-price]")
  await wait(250)
  const tried = await page.evaluate(() => ({ total: document.querySelector("[data-try-total]")?.getAttribute("data-try-total"), text: document.querySelector("[data-try-cart]")?.innerText.replace(/\s+/g, " ").trim(), sent: window.__sent.filter((x) => x.path === "/api/store/offers/try").map((x) => x.body)[0], box: (() => { const r = document.querySelector("[data-try-cart]").getBoundingClientRect(); const e = document.querySelector("[data-offer-editor]").getBoundingClientRect(); return { left: Math.round(r.left - e.left), right: Math.round(e.right - r.right), height: Math.round(r.height) } })() }))
  console.log(`        try box ${tried.box.height}px tall, ${tried.box.left}px and ${tried.box.right}px in from the editor's sides`)
  say(tried.total === "9600" && /Buy 3 get 2 free −\$64/.test(tried.text ?? "") && /Total, \$64 off \$96/.test(tried.text ?? ""), `Price this cart: each line with its offer, then the total: "${(tried.text ?? "").slice(0, 140)}"`)
  say(!!tried.sent && tried.sent.items?.[0]?.productId === A && tried.sent.items?.[0]?.quantity === 5 && tried.sent.offer?.kind === "quantity_break" && tried.sent.offer?.tiers?.length === 2, `it sends the offer as typed and the cart: ${JSON.stringify(tried.sent)?.slice(0, 160)}`)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `the editor with its help: ${fitLine(f)}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offer-try-${vp.width}.png` })

  console.log(`\nStorelib's own product section's tiers on ${name}`)
  await open("breaks", vp, {})
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, fitLine(f))
  const Q = await page.evaluate(() => ({ rows: [...document.querySelectorAll("[data-tier]")].map((r) => ({ h: Math.round(r.getBoundingClientRect().height), total: r.getAttribute("data-tier-total"), on: r.getAttribute("aria-checked") })), heading: getComputedStyle(document.querySelector("[data-quantity-breaks] h3")).color, badge: getComputedStyle([...document.querySelectorAll("[data-tier] span")].find((s) => s.textContent === "Most popular")).backgroundColor }))
  console.log(`        rows ${Q.rows.map((r) => r.h).join("/")}px, totals ${Q.rows.map((r) => r.total).join("/")}`)
  say(Q.rows.map((r) => r.total).join() === "3600,7200,10800" && Q.rows.every((r) => r.h >= 44), `1, 2 + 1 and 3 + 2 at $36.00 are $36.00, $72.00, $108.00, each row at least 44px to press`)
  say(Q.heading === "rgb(18, 52, 86)" && Q.badge === "rgb(255, 238, 170)", `in the block's colours: heading ${Q.heading}, badge ${Q.badge}`)
  await page.evaluate(() => document.querySelectorAll("[data-tier]")[2].click())
  await wait(60)
  const picked = await page.evaluate(() => ({ q: document.querySelector("[data-quantity]")?.getAttribute("data-quantity"), on: [...document.querySelectorAll("[data-tier]")].map((r) => r.getAttribute("aria-checked")).join() }))
  say(picked.q === "5" && picked.on === "false,false,true", `pressing Buy 3 get 2 free sets the buy box's quantity to 5 (${picked.q}) and marks it`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offer-breaks-${vp.width}.png` })

  console.log(`\nA product page's bundles and upsells on ${name}`)
  await open("bundle", vp, { api: BUNDLE })
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, fitLine(f))
  const b = await page.evaluate(() => {
    const c = (sel, prop = "color") => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null }
    return { heading: c("[data-bundle] h3"), price: c("[data-bundle-price]"), badge: c("[data-bundle-label]", "backgroundColor"), button: c("[data-bundle-add]", "backgroundColor"), upsell: document.querySelector("[data-upsell]")?.textContent.replace(/\s+/g, " ") }
  })
  say(b.heading === "rgb(18, 52, 86)" && b.price === "rgb(170, 0, 0)" && b.badge === "rgb(255, 238, 170)" && b.button === "rgb(10, 125, 85)", `each element in its own colour: heading ${b.heading}, price ${b.price}, saving ${b.badge}, button ${b.button}`)
  say(/Beeswax candle/.test(b.upsell ?? "") && /6\.00/.test(b.upsell ?? "") && /9\.00/.test(b.upsell ?? ""), `an upsell with its offer price beside the usual one: "${(b.upsell ?? "").slice(0, 60)}"`)
  await page.select('select[aria-label="Honey dipper option"]', "b2")
  await page.click("[data-bundle-add]")
  await page.click("[data-upsell-add]")
  await wait(80)
  const added = await page.evaluate(() => window.__added.map((l) => `${l.productId}:${l.variantId}`))
  say(added.join() === "a:av,b:b2,c:cv", `Add all puts the set in the cart with the option chosen, Add the upsell: ${added.join(", ")}`)

  console.log(`\nThe checkout's Add to your order on ${name}`)
  await open("checkout", vp, {})
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, fitLine(f))
  await page.evaluate(() => document.querySelectorAll("[data-suggestion-add]")[0].click())
  await wait(60)
  const ad = await page.evaluate(() => window.__added)
  say(ad.length === 1 && ad[0].product === "c" && ad[0].variant === "cv", `Add puts the offered product in the order: ${JSON.stringify(ad[0])}`)

  console.log(`\nThe cart's offers on ${name}`)
  await open("cart", vp, {})
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, fitLine(f))
  const cart = await page.evaluate(() => ({ rows: [...document.querySelectorAll("[data-cart-offer]")].map((r) => r.textContent.replace(/\s+/g, " ").trim()), saving: document.querySelector("[data-cart-offer-savings]")?.textContent.replace(/\s+/g, " ").trim() }))
  say(cart.rows.length === 2 && /Teapot/.test(cart.rows[0]) && /Save \$3\.50 on the set/.test(cart.rows[0]) && /\$6\.00/.test(cart.rows[1]) && /−\$6\.00|−\$6\.00/.test(cart.saving ?? ""), `the rest of a bundle, an upsell, and what the cart saves: ${cart.rows.map((r) => r.slice(0, 40)).join(" | ")} | ${cart.saving}`)
  await page.evaluate(() => document.querySelectorAll("[data-cart-offer-add]").forEach((b) => b.click()))
  await wait(60)
  const cartAdded = await page.evaluate(() => window.__added.map((l) => `${l.productId}:${l.variantId}`))
  say(cartAdded.join() === "t:tv,c:cv", `Add puts each in the cart: ${cartAdded.join(", ")}`)
}

await browser.close()
console.log(bad ? `\n${bad} failed` : "\nThe offers list, its editor, the product page, the checkout and the cart fit, do what they say and move in time.")
process.exit(bad ? 1 : 0)
