/**
 * ROUND T'S SETTINGS PANELS, DRAWN AND PRESSED.
 *
 *   PROBE_CSS=source node scripts/check-settings-panels.mjs
 *
 * Each panel (scripts/render-settings-panels.tsx) against a stubbed API, at
 * a phone's width and a computer's: nothing runs off the side, no label or
 * control is cut, and what a press sends is what the panel says it does.
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
const out = mkdtempSync(join(tmpdir(), "storelib-panels-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-panels.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#fafafa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const STORE = { settings: { storeName: null, phone: null, phoneCountry: null, defaultCountry: null, checkout: {}, defaultSalesChannelId: null, ready: true }, detectedCountry: "RO", supportEmail: "hello@angus.ro", currency: "RON" }
const PHYS = { settings: { defaultLocationId: "loc-1" }, locations: [{ id: "loc-1", name: "My Store Warehouse" }, { id: "loc-2", name: "Studio" }] }
const API = {
  "GET /api/store/settings": STORE,
  "PUT /api/store/settings": { settings: { ...STORE.settings, storeName: "Angus Farm", defaultCountry: "RO", checkout: { phone: "required" } } },
  "GET /api/physical/settings": PHYS,
  "PUT /api/physical/settings": { settings: {} },
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(panel, vp, api = API) {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((p, a) => { window.__panel = p; window.__api = a }, panel, api)
  await page.goto(`file://${join(out, "index.html")}`)
  await wait(350)
}
const fits = () => page.evaluate(() => {
  const over = document.documentElement.scrollWidth - innerWidth
  const cut = [...document.querySelectorAll("button, label, p, h2, span, option")].filter((el) => {
    if (!(el instanceof HTMLElement) || !el.offsetParent) return false
    const r = el.getBoundingClientRect()
    return r.right > innerWidth + 1 || (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible" && el.tagName === "BUTTON")
  }).map((el) => (el.textContent || "").trim().slice(0, 40))
  return { over, cut }
})

for (const [name, vp] of [["a phone", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["a computer", { width: 1280, height: 900 }]]) {
  console.log(`\nStore details on ${name}`)
  await open("store", vp)
  const f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `nothing runs off the side or is cut (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`)
  const r = await page.evaluate(() => ({
    email: document.querySelector("#store-email")?.value,
    suggest: [...document.querySelectorAll("[data-suggest-country]")].map((b) => b.textContent),
    phonePrefix: document.querySelector("[data-phone-prefix]")?.getAttribute("data-phone-prefix") ?? null,
    help: !!document.querySelector('[data-how-it-works="store"]'),
    location: document.querySelector("#store-location")?.value,
  }))
  say(r.email === "hello@angus.ro", `the contact email is the one receipts carry (${r.email})`)
  say(r.phonePrefix === "+40", `the phone starts in the country they are in: ${r.phonePrefix}`)
  say(r.suggest.some((t) => /Romania/.test(t)), `an unset country suggests where they are: "${r.suggest.join(" / ")}"`)
  say(r.help, "How it works is there")
  say(r.location === "loc-1", `orders ship from the default location (${r.location})`)
  if (name === "a phone") {
    await page.type("#store-name", "Angus Farm")
    await page.type("#store-phone", "751048522")
    const shown = await page.$eval("#store-phone", (el) => el.value)
    say(/751 048 522/.test(shown), `a number is grouped as it is typed: "${shown}"`)
    await page.click("[data-suggest-country]:last-of-type")
    await wait(50)
    const country = await page.$eval("#store-country", (el) => el.value)
    say(country === "RO", `Use Romania fills the country (${country})`)
    const saves = await page.$$("button")
    for (const b of saves) {
      const t = await b.evaluate((x) => x.textContent?.trim())
      if (t === "Save") { await b.click(); break }
    }
    await wait(200)
    const sent = await page.evaluate(() => window.__sent)
    const put = sent.find((s) => s.method === "PUT" && s.path === "/api/store/settings")
    say(!!put && put.body.storeName === "Angus Farm" && put.body.phone === "+40 751 048 522" && put.body.phoneCountry === "RO" && put.body.supportEmail === "hello@angus.ro", `Save sends the name, the email and the phone with its code: ${JSON.stringify(put?.body)}`)
  }

  console.log(`\nCheckout on ${name}`)
  await open("checkout", vp)
  const g = await fits()
  say(g.over <= 0 && g.cut.length === 0, `nothing runs off the side or is cut (${g.over}px over${g.cut.length ? `, cut: ${g.cut.join(" | ")}` : ""})`)
  const seg = await page.evaluate(() => [...document.querySelectorAll("[data-segmented]")].map((s) => ({ label: s.getAttribute("data-segmented"), w: Math.round(s.getBoundingClientRect().width), checked: s.querySelector("[aria-checked=true]")?.textContent, cut: [...s.querySelectorAll("button")].some((b) => b.scrollWidth > b.clientWidth + 1) })))
  say(seg.length === 4 && seg.every((s) => !s.cut), `four choices, none of their words cut: ${seg.map((s) => `${s.label} ${s.w}px "${s.checked}"`).join(", ")}`)
  say(seg.find((s) => s.label === "Phone number")?.checked === "Optional" && seg.find((s) => s.label === "Company name")?.checked === "Don't include", "the defaults are what checkout did before: phone optional, no company")
  if (name === "a computer") {
    await page.evaluate(() => [...document.querySelectorAll('[data-segmented="Phone number"] button')].find((b) => b.textContent === "Required").click())
    await page.evaluate(() => [...document.querySelectorAll('[data-segmented="Company name"] button')].find((b) => b.textContent === "Optional").click())
    await wait(800)
    const sent = await page.evaluate(() => window.__sent.filter((s) => s.method === "PUT"))
    say(sent.length === 1 && sent[0].body.checkout.phone === "required" && sent[0].body.checkout.company === "optional", `two quick changes are one save, with both: ${JSON.stringify(sent.map((s) => s.body))}`)
    const line = await page.$eval("[data-checkout-saved]", (el) => el.textContent)
    say(/Saved/.test(line), `and it says so: "${line}"`)
  }

  console.log(`\nTaxes on ${name}`)
  const TAX = { enabled: true, included: true, onShipping: false, digital: false, ready: true, detectedCountry: "RO", currency: "RON",
    regions: [{ id: "r-ro", country: "RO", region: null, name: "TVA", rateBps: 1900 }, { id: "r-ca", country: "US", region: "CA", name: "Sales tax", rateBps: 725 }],
    overrides: [{ id: "o-1", taxRateId: "r-ro", productId: "p-1", name: "", rateBps: 500, productTitle: "Field notes, printed" }],
    products: [{ id: "p-1", title: "Field notes, printed" }, { id: "p-2", title: "Honey 500g" }] }
  await open("taxes", vp, { ...API, "GET /api/store/taxes": TAX, "PUT /api/store/taxes": { ...TAX, digital: true } })
  const h = await fits()
  say(h.over <= 0 && h.cut.length === 0, `nothing runs off the side or is cut (${h.over}px over${h.cut.length ? `, cut: ${h.cut.join(" | ")}` : ""})`)
  const t = await page.evaluate(() => ({
    rows: [...document.querySelectorAll("[data-tax-region]")].map((li) => li.textContent.replace(/\s+/g, " ").trim()),
    inclusive: document.querySelector("[data-tax-inclusive]")?.textContent.replace(/\s+/g, " ").trim(),
    shipping: [...document.querySelectorAll("label, p")].some((el) => /tax on shipping/i.test(el.textContent || "")),
    pulse: !!document.querySelector(".animate-pulse"),
  }))
  say(t.rows.length === 2 && /Romania/.test(t.rows[0] + t.rows[1]) && /California/.test(t.rows.join(" ")), `both regions listed by name: ${t.rows.join(" | ")}`)
  say(/RON/.test(t.inclusive ?? "") && /include/i.test(t.inclusive ?? ""), `inclusivity is per currency, with the store's own: "${t.inclusive}"`)
  say(t.shipping, "tax on shipping is offered with physical products on")
  say(!t.pulse, "no grey outline while it loads")
  if (name === "a computer") {
    await page.evaluate(() => document.querySelector("[data-tax-region] button").click())
    await wait(150)
    const ed = await page.evaluate(() => document.querySelector("[data-region-editor]")?.textContent.replace(/\s+/g, " ").trim() ?? "")
    say(/Field notes, printed/.test(ed) && /5%/.test(ed), `a region opens with its product rates: "${ed.slice(0, 120)}"`)
    await page.evaluate(() => document.querySelector("[data-create-region]").click())
    await wait(250)
    const form = await page.evaluate(() => !!document.querySelector("[data-create-region-form]"))
    say(form, "Create region opens its form")
    const m = await fits()
    say(m.over <= 0 && m.cut.length === 0, `and the form fits (${m.over}px over${m.cut.length ? `, cut: ${m.cut.join(" | ")}` : ""})`)
  }

  console.log(`\nThe checkout's tax line on ${name}`)
  await open("totals", vp)
  const k = await fits()
  say(k.over <= 0 && k.cut.length === 0, `nothing runs off the side or is cut (${k.over}px over${k.cut.length ? `, cut: ${k.cut.join(" | ")}` : ""})`)
  const read = () => page.evaluate(() => [...document.querySelectorAll("[data-totals-probe]")].map((el) => ({ kind: el.getAttribute("data-totals-probe"), text: el.textContent.replace(/\s+/g, " ").trim(), line: el.querySelector("[data-tax-line]")?.getBoundingClientRect().height })))
  const before = await read()
  const added = before.find((b) => b.kind === "added"), incl = before.find((b) => b.kind === "included")
  say(/Tax/.test(added.text) && /\$5\.51/.test(added.text) && /\$34\.51/.test(added.text), `added: the tax over the total, and in it: "${added.text}"`)
  say(/Includes \$4\.63 tax/.test(incl.text) && /\$29\.00/.test(incl.text), `included: the total stays, the tax under it: "${incl.text}"`)
  await page.select('[data-totals-probe="added"] select', "BG")
  await wait(80)
  const bg = (await read()).find((b) => b.kind === "added")
  say(/\$5\.80/.test(bg.text) && /\$34\.80/.test(bg.text), `another country, its own rate: "${bg.text}"`)
  await page.select('[data-totals-probe="added"] select', "")
  await wait(80)
  const none = (await read()).find((b) => b.kind === "added")
  say(/\$29\.00/.test(none.text), `a country with no region pays none: "${none.text}"`)
}
await browser.close()
console.log(bad ? `\n${bad} failed\n` : "\nEvery panel fits, reads the store's own values, and saves what it shows.\n")
process.exit(bad ? 1 : 0)
