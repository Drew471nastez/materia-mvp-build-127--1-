/**
 * COUNTRY & CURRENCY, CASH ON DELIVERY'S OPTIONS AND LANGUAGES, DRAWN AND PRESSED.
 *
 *   PROBE_CSS=source node scripts/check-currency-languages.mjs
 *   SHOTS=/some/dir   also saves a picture of each, at both widths
 *
 * The panels (scripts/render-settings-panels.tsx) against a stubbed API, at
 * a phone's width and a computer's: nothing runs off the side or is cut;
 * Store details reads "Selling in", Edit asks keep or convert before Save
 * and sends what was chosen; cash on delivery's options appear only once it
 * is on; each language says where it is, and a running translation shows
 * its progress.
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
const out = mkdtempSync(join(tmpdir(), "storelib-currency-"))
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

const CURRENCIES = ["USD", "EUR", "GBP", "RON", "CAD", "AUD"].map((code) => ({ code, label: code }))
const CURRENCY = {
  ready: true,
  country: "RO",
  currency: "RON",
  chosen: "RON",
  suggested: "RON",
  unsupportedLocal: null,
  detectedCountry: "RO",
  currencies: CURRENCIES,
  catalog: { products: 12, variants: 30, shippingRates: 4, coupons: 2, total: 48 },
  lastChange: null,
}
const PREVIEW = { from: "RON", to: "EUR", counts: CURRENCY.catalog, rate: 0.200912, asOf: "2026-10-13", examples: [{ title: "Stoneware Mug", before: 9900, converted: 1989 }] }
const STORE = { settings: { storeName: "Angus Farm", phone: null, phoneCountry: null, defaultCountry: "RO", checkout: { cashOnDelivery: true, codCountries: ["RO", "MD"], codFeeCents: 1000, codInstructions: "Have the exact amount ready." }, defaultSalesChannelId: null, ready: true }, detectedCountry: "RO", supportEmail: "hello@angus.ro", currency: "RON" }
const MARKETS = {
  ready: true,
  localization: {
    defaultLanguage: "en",
    languages: [
      { code: "ro", published: true },
      { code: "fr", published: false },
      { code: "de", published: false },
    ],
    markets: [
      { id: "home", name: "Home", primary: true, countries: [], currency: null, language: null, rounding: "none", adjustBps: 0, active: true },
      { id: "eu", name: "Europe", primary: false, countries: ["DE", "FR", "IT"], currency: "EUR", language: null, rounding: "whole", adjustBps: 0, active: true },
    ],
    visitorLanguage: false,
    autoTranslate: false,
  },
  autoTranslate: { run: null, available: true },
  baseCurrency: "RON",
  chargeCurrency: "RON",
  fx: { asOf: "2026-10-13", fresh: true, currencies: ["EUR", "USD", "GBP"], rates: { EUR: 1, RON: 4.97 } },
}
const SUMMARY = { ready: true, progress: { ro: { done: 140, draft: 0, todo: 0, total: 140 }, fr: { done: 120, draft: 20, todo: 0, total: 140 }, de: { done: 0, draft: 0, todo: 140, total: 140 } } }
const API = {
  "GET /api/store/settings": STORE,
  "PUT /api/store/settings": STORE,
  "GET /api/physical/settings": { settings: { defaultLocationId: null }, locations: [] },
  "GET /api/store/currency": CURRENCY,
  "POST /api/store/currency": PREVIEW,
  "PUT /api/store/currency": { ...CURRENCY, currency: "EUR", chosen: "EUR" },
  "GET /api/store/markets": MARKETS,
  "GET /api/store/translations": SUMMARY,
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
async function open(panel, vp, api = API) {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((p, a) => {
    window.__panel = p
    window.__api = a
  }, panel, api)
  await page.goto(`file://${join(out, "index.html")}`)
  await wait(450)
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

for (const [label, vp] of [
  ["a phone", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ["a computer", { width: 1280, height: 900 }],
]) {
  console.log(`\nCountry & currency on ${label}`)
  /* Store details says it in one line and links to where it is set (the owner: one currency, in Languages & Currency). */
  await open("store", vp)
  let f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `Store details: nothing runs off the side or is cut (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`)
  const line = await page.evaluate(() => document.querySelector("[data-selling-in]")?.textContent ?? "")
  say(/Selling in/.test(line) && /Romania · RON/.test(line), `Store details reads "${line.replace(/\s+/g, " ").trim()}"`)
  say(await page.evaluate(() => document.querySelector("[data-currency-link]")?.getAttribute("href") === "/app/settings?tab=markets" && !document.querySelector("[data-currency-edit]")), "and links to Languages & Currency, with no second editor")
  await shot("store-details", vp)
  await open("markets", vp)
  await wait(300)
  const top = await page.evaluate(() => document.querySelector("[data-selling-in]")?.textContent ?? "")
  say(/Romania · RON/.test(top), `Languages & Currency opens on the store currency: "${top.replace(/\s+/g, " ").trim()}"`)
  await shot("country-currency", vp)
  await page.click("[data-currency-edit]")
  await wait(200)
  await page.select("#store-currency", "EUR")
  await wait(400)
  const asks = await page.evaluate(() => ({
    choices: [...document.querySelectorAll("[data-currency-mode]")].map((b) => b.getAttribute("data-currency-mode")),
    checked: [...document.querySelectorAll("[data-currency-mode][aria-checked=true]")].length,
    save: document.querySelector("[data-currency-save]")?.disabled,
    facts: document.querySelector("[data-currency-facts]")?.textContent ?? "",
  }))
  say(asks.choices.join() === "keep,convert" && asks.checked === 0 && asks.save === true, "a new currency asks keep or convert, picks neither, and Save waits")
  say(/48 prices change/.test(asks.facts) && /0\.200912/.test(asks.facts), `says how many prices change and the rate: "${asks.facts.slice(0, 90)}"`)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `the editor fits (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`)
  await shot("country-currency-edit", vp)
  await page.click("[data-currency-mode=convert]")
  await wait(100)
  await page.click("[data-currency-save]")
  await wait(400)
  const sent = await page.evaluate(() => window.__sent.filter((s) => s.path === "/api/store/currency" && s.method === "PUT").map((s) => s.body))
  say(sent.length === 1 && sent[0].currency === "EUR" && sent[0].mode === "convert" && sent[0].rate === 0.200912 && sent[0].asOf === "2026-10-13" && typeof sent[0].key === "string", `Save sends the currency, the choice and the rate it showed: ${JSON.stringify(sent[0] ?? null).slice(0, 120)}`)

  console.log(`\nCash on delivery's options on ${label}`)
  await open("checkout", vp)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `nothing runs off the side or is cut (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`)
  const cod = await page.evaluate(() => ({
    options: !!document.querySelector("[data-cod-options]"),
    countries: [...document.querySelectorAll("[data-cod-countries] li")].map((li) => (li.textContent || "").trim()),
    fee: document.querySelector("#cod-fee")?.value,
    note: document.querySelector("#cod-note")?.value,
  }))
  say(cod.options && cod.countries.length === 2 && cod.fee === "10.00" && cod.note === "Have the exact amount ready.", `shows where, the fee and the note: ${JSON.stringify(cod)}`)
  await page.evaluate(() => document.querySelector("[data-cod-options]")?.scrollIntoView())
  await shot("cash-on-delivery", vp)

  console.log(`\nLanguages on ${label}`)
  await open("markets", vp)
  await wait(300)
  f = await fits()
  say(f.over <= 0 && f.cut.length === 0, `nothing runs off the side or is cut (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`)
  const langs = await page.evaluate(() =>
    [...document.querySelectorAll("[data-language]")].map((li) => ({
      code: li.getAttribute("data-language"),
      state: li.getAttribute("data-language-state"),
      line: (li.querySelector("[data-language-progress]")?.textContent || "").trim(),
      next: (li.querySelector("[data-translate-language], [data-publish-language]")?.textContent || "").trim(),
    })),
  )
  const by = Object.fromEntries(langs.map((l) => [l.code, l]))
  say(by.ro?.state === "published" && /140 of 140 translated/.test(by.ro.line) && by.ro.next === "", `Romanian: published, all translated, nothing to press (${JSON.stringify(by.ro)})`)
  say(by.fr?.state === "hidden" && /20 drafts/.test(by.fr.line) && by.fr.next === "Review", `French: hidden, 20 drafts, Review (${JSON.stringify(by.fr)})`)
  say(by.de?.state === "hidden" && /0 of 140 translated/.test(by.de.line) && by.de.next === "", `German: hidden, nothing translated yet (${JSON.stringify(by.de)})`)
  say(await page.evaluate(() => (document.querySelector("[data-start-translation=de]")?.textContent || "").trim() === "Translate"), "and its next step is Translate")
  const folded = await page.evaluate(() => ({ open: document.querySelector("[data-language-options]")?.hasAttribute("open"), visible: !!document.querySelector("[data-visitor-language]")?.checkVisibility() }))
  say(folded.open === false && folded.visible === false, "the two rarely used switches are folded under More options")
  const currencies = await page.evaluate(() => [...document.querySelectorAll("[data-market]")].map((m) => m.getAttribute("data-market")))
  say(currencies.join() === "eu", `More currencies lists only the added ones, not the store's own (${currencies.join()})`)
  await shot("languages", vp)
}

/* A language being translated: its row says so with the count and a bar. */
console.log("\nA translation in progress")
/* Translate with AI on the server (lib/markets/translation-jobs.ts): the job answers at once, and the row reads its count. */
const JOB = { locale: "de", status: "running", done: 60, total: 140, drafted: 60, error: null, startedAt: "", updatedAt: "" }
const SLOW = { ...API, "POST /api/store/translations/jobs": { ready: true, job: JOB }, "GET /api/store/translations/jobs": { ready: true, jobs: {} } }
await open("markets", { width: 1280, height: 900 }, SLOW)
/* Each batch takes a while, as Storelib AI's do: the row is measured while one is out. */
await page.evaluate(() => {
  const real = window.fetch
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url
    if (url.includes("/api/store/translations/jobs") && (!init || !init.method || init.method === "GET")) return new Response(JSON.stringify({ ready: true, jobs: window.__started ? { de: { locale: "de", status: "running", done: 60, total: 140, drafted: 60, error: null, startedAt: "", updatedAt: "" } } : {} }), { status: 200, headers: { "Content-Type": "application/json" } })
    if (url.includes("/api/store/translations/jobs")) window.__started = true
    return real(input, init)
  }
})
await page.click("[data-start-translation=de]")
await wait(1700)
const running = await page.evaluate(() => {
  const li = document.querySelector("[data-language=de]")
  return { state: li?.getAttribute("data-language-state"), bar: !!li?.querySelector("[role=progressbar]"), line: (li?.querySelector("[data-language-progress]")?.textContent || "").trim() }
})
say(running.state === "translating" && running.bar && /60 of 140 texts/.test(running.line), `German shows Translating with the job's own count and a bar (${JSON.stringify(running)})`)
await shot("languages-translating", { width: 1280 })

/* The sheet: the original beside its translation, a dot for where each stands, and a running job said to go on with the tab closed. */
for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1280, height: 900 }]) {
  console.log(`\nThe translation sheet at ${vp.width}px`)
  await open("markets", vp)
  await page.evaluate(() => {
    const real = window.fetch
    const item = (key, label, source, value, status) => ({ key, label, where: "Home", source, value, status, multiline: source.length > 60, rich: false, ai: status === "draft" })
    const loaded = {
      ready: true,
      locale: "fr",
      defaultLanguage: "en",
      languages: ["en", "fr"],
      progress: { done: 120, total: 140 },
      groups: [
        { id: "home", title: "Home", items: [item("h1", "Heading", "Fresh from the farm", "", "missing"), item("h2", "Text", "Our eggs are collected every morning and reach you within two days of being laid.", "Nos œufs sont ramassés chaque matin.", "draft"), item("h3", "Button", "Shop now", "Acheter", "done")] },
      ],
    }
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url
      if (url.includes("/api/store/translations?locale=fr")) return new Response(JSON.stringify(loaded), { status: 200, headers: { "Content-Type": "application/json" } })
      if (url.includes("/api/store/translations/jobs") && (!init || !init.method || init.method === "GET")) return new Response(JSON.stringify({ ready: true, jobs: { fr: { locale: "fr", status: "running", done: 126, total: 140, drafted: 6, error: null, startedAt: "", updatedAt: "" } } }), { status: 200, headers: { "Content-Type": "application/json" } })
      return real(input, init)
    }
  })
  await page.click("[data-translate-language=fr]")
  await wait(600)
  /* The job is seen the way the page sees one started elsewhere: read again when the tab comes back into view. */
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))
  await wait(600)
  const sheet = await page.evaluate(() => {
    const root = document.querySelector("[data-translate-sheet]")
    const bar = root?.querySelector("[data-translate-progress]")
    const rows = [...(root?.querySelectorAll("[data-translation]") ?? [])]
    const row = rows.find((r) => r.getAttribute("data-translation") === "h2")
    const [orig, field] = row ? [...row.querySelectorAll("p, textarea, input")].filter((e) => !e.closest("label")) : []
    return {
      progress: (bar?.textContent || "").replace(/\s+/g, " ").trim(),
      running: bar?.getAttribute("data-translate-progress"),
      statuses: rows.map((r) => r.querySelector("[data-status]")?.getAttribute("data-status")),
      pills: root?.querySelectorAll("[data-translation] .rounded-full.px-2").length ?? 0,
      sideBySide: orig && field ? Math.abs(orig.getBoundingClientRect().top - field.getBoundingClientRect().top) < 2 : false,
      over: document.documentElement.scrollWidth - innerWidth,
    }
  })
  say(sheet.running === "running" && /Translating 126 of 140/.test(sheet.progress) && /90%/.test(sheet.progress) && /You can close this or the tab/.test(sheet.progress), `a running job: its count, its share and that it goes on with the tab closed ("${sheet.progress}")`)
  say(sheet.statuses.join() === "missing,draft", `each row says where it stands with a dot (${sheet.statuses.join()})`)
  say(vp.width < 640 ? !sheet.sideBySide : sheet.sideBySide, vp.width < 640 ? "on a phone the translation is under its original" : "on a computer the translation is beside its original")
  say(sheet.over <= 0, `nothing runs off the side (${sheet.over}px over)`)
  await shot("translate-sheet", vp)
}

await browser.close()
console.log(bad ? `\n${bad} failed` : "\nall ok")
process.exit(bad ? 1 : 0)
