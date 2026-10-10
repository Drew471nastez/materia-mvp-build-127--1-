/**
 * UPSELLS AND BUNDLES, DRAWN AND PRESSED.
 *
 *   node scripts/check-offers.mjs        (SHOTS=dir to keep screenshots)
 *
 * The store's page (/app/offers), a product page's "Buy it together" and the
 * checkout's "Add to your order" (scripts/render-offers.tsx) against a
 * stubbed API, at a phone's width and a computer's: nothing runs off the
 * side, the editor sends what it shows, the set's price reads right, and
 * Add all puts every item in the cart with its option.
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
const out = mkdtempSync(join(tmpdir(), "storelib-offers-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-offers.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const P = (id, title, priceCents, extra = {}) => ({ id, title, type: "physical", published: true, priceCents, imageUrl: null, ...extra })
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const STORE = {
  "GET /api/store/offers": { ready: true, products: [P(A, "Wildflower honey", 3200), P(B, "Honey dipper", 800), P(C, "Beeswax candle with a long name for small screens", 900, { published: false })], offers: [
    { id: "o1", kind: "bundle", title: "Breakfast set", productIds: [A, B], triggerIds: [], discountType: "percent", discountValue: 15, active: true },
    { id: "o2", kind: "checkout", title: "Add a candle", productIds: [C], triggerIds: [], discountType: "fixed", discountValue: 300, active: false },
  ] },
  "POST /api/store/offers": { offer: { id: "o3", kind: "bundle", title: "Buy it together", productIds: [A, C], triggerIds: [], discountType: "percent", discountValue: 10, active: true } },
  "PUT /api/store/offers": { offer: { id: "o2", kind: "checkout", title: "Add a candle", productIds: [C], triggerIds: [], discountType: "fixed", discountValue: 300, active: true } },
}
const BUNDLE = { "GET /api/offers/bundles": { bundles: [{ offerId: "o1", title: "Breakfast set", label: "15% off", discountType: "percent", discountValue: 15, fullCents: 4000, priceCents: 3400, items: [
  { id: "a", title: "Wildflower honey", slug: "honey", imageUrl: null, type: "physical", priceCents: 3200, variants: [{ id: "av", name: "Default", priceCents: 3200 }] },
  { id: "b", title: "Honey dipper", slug: "dipper", imageUrl: null, type: "physical", priceCents: 800, variants: [{ id: "b1", name: "Oak", priceCents: 800 }, { id: "b2", name: "Walnut", priceCents: 900 }] },
] }] } }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(panel, vp, api) {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((p, a) => { window.__panel = p; window.__api = a }, panel, api)
  await page.goto(`file://${join(out, "index.html")}`)
  await wait(400)
}
const fits = () => page.evaluate(() => {
  const over = document.documentElement.scrollWidth - innerWidth
  const cut = [...document.querySelectorAll("button, label, p, h1, h2, h3, span")].filter((el) => {
    if (!(el instanceof HTMLElement) || !el.offsetParent) return false
    const r = el.getBoundingClientRect()
    return r.right > innerWidth + 1 || (el.tagName === "BUTTON" && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible")
  }).map((el) => (el.textContent || "").trim().slice(0, 40))
  return { over, cut }
})
const fitLine = (f) => `nothing runs off the side or is cut (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`

for (const [name, vp] of [["a phone", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["a computer", { width: 1280, height: 900 }]]) {
  console.log(`\nThe store's Upsells and bundles on ${name}`)
  await open("admin", vp, STORE)
  let f = await fits()
  say(f.over <= 0 && f.cut.length === 0, fitLine(f))
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-offer]")].map((r) => r.textContent.replace(/\s+/g, " ").trim()))
  say(rows.length === 2 && /Breakfast set/.test(rows[0]) && /2 products together · 15% off/.test(rows[0]) && /Offers Beeswax candle/.test(rows[1]) && /\$3\.00 off/.test(rows[1]), `each offer says what it is: "${rows[0]?.slice(0, 60)}" / "${rows[1]?.slice(0, 60)}"`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offers-${vp.width}.png` })
  await page.evaluate(() => document.querySelectorAll('[data-offer] [role="switch"]')[1].click())
  await wait(150)
  const sw = (await page.evaluate(() => window.__sent)).at(-1)
  say(sw?.method === "PUT" && sw.body.id === "o2" && sw.body.active === true, `switching one on saves just that: ${JSON.stringify(sw?.body).slice(0, 80)}`)

  await page.click("[data-offer-new]")
  await wait(250)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `the editor: ${fitLine(f)}`)
  if (name === "a phone") {
    const d = await page.evaluate(() => (({ bottom, width }) => ({ bottom, width }))(document.querySelector('[role="dialog"]').getBoundingClientRect()))
    say(Math.round(d.bottom) === 844 && d.width === 390, `the editor is a sheet from the bottom (${Math.round(d.bottom)}px)`)
  }
  await page.click(`[data-product-picker="offer-products"] [data-pick="${"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}"]`)
  await page.click(`[data-product-picker="offer-products"] [data-pick="${"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}"]`)
  await wait(80)
  const pv = await page.$eval("[data-offer-preview]", (el) => el.textContent)
  say(pv === "Together $36.90, instead of $41.00.", `the price buyers see, as it's set up: "${pv}"`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/offer-editor-${vp.width}.png` })
  await page.click("[data-offer-save]")
  await wait(250)
  const s = (await page.evaluate(() => window.__sent)).find((x) => x.method === "POST")
  say(s && s.body.kind === "bundle" && s.body.productIds.length === 2 && s.body.discountType === "percent" && s.body.discountValue === 10 && s.body.triggerIds.length === 0, `Save sends the bundle as shown: ${JSON.stringify(s?.body).slice(0, 140)}`)
  const after = await page.evaluate(() => ({ rows: document.querySelectorAll("[data-offer]").length, open: !!document.querySelector('[role="dialog"]') }))
  say(after.rows === 3 && !after.open, `and it's in the list: ${after.rows}`)

  await open("admin", vp, STORE)
  await page.click("[data-offer-new]")
  await wait(200)
  await page.click('[data-offer-kind="checkout"]')
  await wait(80)
  const radios = await page.evaluate(() => [...document.querySelectorAll('[data-product-picker="offer-products"] [data-pick]')].map((b) => b.getAttribute("role")))
  say(radios.every((r) => r === "radio"), `a checkout offer picks one product: ${radios[0]}`)

  console.log(`\nA product page's Buy it together on ${name}`)
  await open("bundle", vp, BUNDLE)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, fitLine(f))
  const b = await page.evaluate(() => ({ text: document.querySelector("[data-bundle]")?.textContent.replace(/\s+/g, " "), price: document.querySelector("[data-bundle-price]")?.textContent, select: !!document.querySelector('select[aria-label="Honey dipper option"]') }))
  say(/This item: Wildflower honey/.test(b.text ?? "") && b.price === "$34.00" && /\$40\.00/.test(b.text ?? "") && b.select, `this product first, the set's price with the saving, a choice for the other: ${b.price}`)
  await page.select('select[aria-label="Honey dipper option"]', "b2")
  await wait(60)
  const repriced = await page.$eval("[data-bundle-price]", (el) => el.textContent)
  say(repriced === "$34.85", `another option with its own price reprices the set: ${repriced}`)
  await page.click("[data-bundle-add]")
  await wait(80)
  const added = await page.evaluate(() => window.__added.map((l) => `${l.productId}:${l.variantId}`))
  say(added.join() === "a:av,b:b2", `Add all puts both in the cart, with the option chosen: ${added.join(", ")}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bundle-${vp.width}.png` })

  console.log(`\nThe checkout's Add to your order on ${name}`)
  await open("checkout", vp, {})
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, fitLine(f))
  const c = await page.evaluate(() => [...document.querySelectorAll("[data-suggestion]")].map((el) => el.textContent.replace(/\s+/g, " ").trim()))
  say(c.length === 2 && /\$4\.50/.test(c[0]) && /\$9\.00/.test(c[0]) && /50% off/.test(c[0]), `the offer price beside the usual one: "${c[0]?.slice(0, 70)}"`)
  await page.evaluate(() => document.querySelectorAll("[data-suggestion-add]")[1].click())
  await wait(60)
  const ad = await page.evaluate(() => window.__added)
  say(ad.length === 1 && ad[0].product === "d" && ad[0].variant === "d1", `Add takes the option shown: ${JSON.stringify(ad[0])}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/checkout-offers-${vp.width}.png` })
}

await browser.close()
console.log(bad ? `\n${bad} failed` : "\nThe store's page, the product page and the checkout fit and do what they say.")
process.exit(bad ? 1 : 0)
