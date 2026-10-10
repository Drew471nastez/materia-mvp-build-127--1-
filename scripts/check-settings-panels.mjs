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
}
await browser.close()
console.log(bad ? `\n${bad} failed\n` : "\nBoth panels fit, read the store's own values, and save what they show.\n")
process.exit(bad ? 1 : 0)
