/**
 * MORE CURRENCIES, DRAWN AND PRESSED (the owner: a store in Romania whose
 * "BRL for 239 countries" had Romania in it).
 *
 *   PROBE_CSS=source node scripts/check-more-currencies.mjs
 *   SHOTS=/some/dir   also saves a picture of each, at both widths
 *
 * Settings › Languages & Currency (scripts/render-settings-panels.tsx)
 * against a stubbed API, at a phone's width and a computer's: each extra
 * currency reads "BRL · All other countries" or "EUR · France and 2 more";
 * the store currency card says who sees it; the editor offers All other
 * countries as one choice, shows Romania disabled with why, and saves the
 * choice as a flag with no list. Nothing runs off the side or is cut.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
if (!existsSync(CHROMIUM)) {
  console.error("No browser")
  process.exit(1)
}
const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-more-currencies-"))
execFileSync(
  "npx",
  [
    "--no-install",
    "esbuild",
    join(root, "scripts/render-settings-panels.tsx"),
    "--bundle",
    "--format=iife",
    "--platform=browser",
    "--jsx=automatic",
    "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@=${root}`,
    "--loader:.css=empty",
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
)
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const CURRENCY = {
  ready: true,
  country: "RO",
  currency: "RON",
  chosen: "RON",
  suggested: "RON",
  unsupportedLocal: null,
  detectedCountry: "RO",
  currencies: ["USD", "EUR", "GBP", "RON", "CAD", "AUD"].map((code) => ({ code, label: code })),
  catalog: { products: 12, variants: 30, shippingRates: 4, coupons: 2, total: 48 },
  lastChange: null,
}
const MARKETS = {
  ready: true,
  localization: {
    defaultLanguage: "ro",
    languages: [],
    markets: [
      { id: "home", name: "Home", primary: true, countries: ["RO"], currency: null, language: null, rounding: "none", adjustBps: 0, active: true },
      { id: "eu", name: "Europe", primary: false, countries: ["DE", "FR", "IT"], currency: "EUR", language: null, rounding: "whole", adjustBps: 0, active: true },
      { id: "brl", name: "Brasil", primary: false, rest: true, countries: [], currency: "BRL", language: null, rounding: "none", adjustBps: 0, active: true },
    ],
    visitorLanguage: false,
    autoTranslate: false,
  },
  autoTranslate: { run: null, available: true },
  baseCurrency: "RON",
  homeCountry: "RO",
  chargeCurrency: "RON",
  fx: { asOf: "2026-10-13", fresh: true, currencies: ["BRL", "EUR", "GBP", "USD"], rates: { EUR: 1, RON: 4.97, BRL: 6.2 } },
}
const API = {
  "GET /api/store/currency": CURRENCY,
  "GET /api/store/markets": MARKETS,
  "PUT /api/store/markets": { localization: MARKETS.localization },
  "GET /api/store/translations": { ready: true, progress: {} },
  "GET /api/store/translations/jobs": { ready: true, jobs: {} },
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => {
  if (!ok) bad++
  console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(vp, api = API) {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((a) => {
    window.__panel = "markets"
    window.__api = a
  }, api)
  await page.goto(`file://${join(out, "index.html")}`)
  await wait(700)
}
const fits = () =>
  page.evaluate(() => {
    const over = document.documentElement.scrollWidth - innerWidth
    const cut = [...document.querySelectorAll("button, label, p, h2, span")]
      .filter((el) => el instanceof HTMLElement && el.offsetParent && el.getBoundingClientRect().right > innerWidth + 1)
      .map((el) => (el.textContent || "").trim().slice(0, 40))
    return { over, cut }
  })
const shot = async (name, vp) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${vp.width}.png`, fullPage: true })
}
const text = (sel) => page.evaluate((s) => (document.querySelector(s)?.textContent ?? "").replace(/\s+/g, " ").trim(), sel)

for (const [label, vp] of [
  ["a phone", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ["a computer", { width: 1280, height: 900 }],
]) {
  console.log(`\nMore currencies on ${label}`)
  await open(vp)
  let f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `nothing runs off the side or is cut (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`)
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-market-summary]")].map((e) => e.textContent))
  say(rows.join("|") === "EUR · France and 2 more|BRL · All other countries", `each currency says where it is seen: ${rows.join(" | ")}`)
  const page1 = await page.evaluate(() => document.body.innerText)
  say(/What you price in\. Visitors in Romania, and anywhere not listed under More currencies, see prices in it and pay in it\./.test(page1), "the store currency card says who sees lei")
  say(/Everyone else sees RON\. Anyone can switch with your website's currency selector\./.test(page1), "the More currencies card says everyone else sees RON, and anyone can switch")
  await shot("more-currencies", vp)

  /* A new currency: All other countries is taken by reais, Romania is the store's. */
  await page.click("[data-add-market]")
  await wait(300)
  const restOff = await page.evaluate(() => document.querySelector("[data-scope=rest]")?.disabled === true)
  say(restOff, `"All other countries" is off while reais have it: "${await text("[data-scope=rest]")}"`)
  say(/Romania is your store's country: its visitors always see RON\./.test(await text("[data-market-home-note]")), "the editor says Romania always sees RON")
  await page.type("[data-market-editor] input[placeholder='Search a country to add']", "Roman")
  await wait(200)
  const romania = await page.evaluate(() => {
    const b = document.querySelector("[data-country-home]")
    return b ? { disabled: b.disabled, text: b.textContent.replace(/\s+/g, " ").trim() } : null
  })
  say(!!romania && romania.disabled && /Your store's country/.test(romania.text), `searched, Romania is shown disabled: ${JSON.stringify(romania)}`)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `the editor fits (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`)
  await shot("more-currencies-new", vp)
  await page.keyboard.press("Escape")
  await wait(300)

  /* Reais: All other countries, picked, saved as a flag. */
  await page.click("[data-market=brl] button")
  await wait(300)
  say(await page.evaluate(() => document.querySelector("[data-scope=rest]")?.getAttribute("aria-checked") === "true" && !document.querySelector("[data-market-regions]")), "reais open on All other countries, with no country list to tick")
  await shot("more-currencies-rest", vp)
  await page.evaluate(() => (window.__settingsPanelsSent.length = 0))
  const done = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Done"))
  await done.click()
  await wait(400)
  const sent = await page.evaluate(() => window.__settingsPanelsSent.filter((s) => s.method === "PUT" && s.path === "/api/store/markets").map((s) => s.body.localization.markets.find((m) => m.id === "brl")))
  say(sent.length === 1 && sent[0].rest === true && sent[0].countries.length === 0, `saved as a flag with no list: ${JSON.stringify(sent[0] && { rest: sent[0].rest, countries: sent[0].countries.length })}`)
}

await browser.close()
console.log(bad ? `\n${bad} failed` : "\nall good")
process.exit(bad ? 1 : 0)
