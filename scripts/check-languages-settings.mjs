/**
 * LANGUAGES & CURRENCY, THE GLOSSARY AND THE CHECKOUT TAB, DRAWN AND MEASURED.
 *
 *   PROBE_CSS=source node scripts/check-languages-settings.mjs
 *   SHOTS=/some/dir   also saves a picture of each, at both widths
 *
 * The real panels (scripts/render-settings-panels.tsx) against a stubbed
 * API, at 390 and 1280:
 *
 *   the Glossary button    on the same row as Add language: its top, height
 *                          and middle against Add language's and the row's
 *                          (0 to 1 px), and where it sits before and after
 *                          the languages' progress arrives (0 px)
 *   the loading card       as tall as the card it turns into
 *   layout shift           every layout-shift entry not caused by a press,
 *                          from opening the panel to the end (0), and the
 *                          glossary list not moving when Keep product names
 *                          is switched
 *   the glossary           Add term, Keep as written or Translate as, a
 *                          duplicate and a too short word refused in the
 *                          form, edit, remove and Undo; what is sent
 *   the Checkout tab       the cards' order: Checkout text above Abandoned
 *                          checkouts, and its #checkout-text anchor
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
const out = mkdtempSync(join(tmpdir(), "storelib-languages-"))
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

const loc = (languages) => ({
  ready: true,
  localization: {
    defaultLanguage: "en",
    languages,
    markets: [{ id: "home", name: "Home", primary: true, countries: [], currency: null, language: null, rounding: "none", adjustBps: 0, active: true }],
    visitorLanguage: false,
    autoTranslate: false,
  },
  autoTranslate: { run: null, available: true },
  baseCurrency: "RON",
  chargeCurrency: "RON",
  fx: { asOf: "2026-10-13", fresh: true, currencies: ["EUR", "USD"], rates: { EUR: 1, RON: 4.97 } },
})
const MARKETS = loc([
  { code: "ro", published: true },
  { code: "fr", published: false },
])
const SUMMARY = { ready: true, progress: { ro: { done: 140, draft: 0, todo: 0, review: 0, total: 140 }, fr: { done: 120, draft: 20, todo: 0, review: 3, total: 140 } } }
const RULES = { ready: true, rules: { glossary: [{ term: "Storelib Pro", keep: true }], noTranslate: ["section:s1:heading"], keepProductNames: true } }
const CURRENCY = { ready: true, country: "RO", currency: "RON", chosen: "RON", suggested: "RON", unsupportedLocal: null, detectedCountry: "RO", currencies: [{ code: "RON", label: "RON" }], catalog: { products: 1, variants: 1, shippingRates: 0, coupons: 0, total: 1 }, lastChange: null }
const STORE = { settings: { storeName: "Angus Farm", defaultCountry: "RO", checkout: { cashOnDelivery: false }, ready: true }, detectedCountry: "RO", currency: "RON" }
const API = {
  "GET /api/store/settings": STORE,
  "PUT /api/store/settings": STORE,
  "GET /api/store/currency": CURRENCY,
  "GET /api/store/markets": MARKETS,
  "GET /api/store/translations": SUMMARY,
  "GET /api/store/translations/jobs": { ready: true, jobs: {} },
  "GET /api/store/translations/rules": RULES,
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => {
  if (!ok) bad++
  console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/*
  Opens a panel. `slow`: paths answered only after that many milliseconds (the
  rest at once). PUT to the rules answers with what was sent, as the server
  does. Every layout shift without a recent press is summed in window.__cls.
*/
async function open(panel, vp, { api = API, slow = {}, hash = "" } = {}) {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument(
    (p, a, s) => {
      window.__panel = p
      window.__api = a
      window.__cls = 0
      window.__shifts = []
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue
          window.__cls += e.value
          window.__shifts.push({ value: Number(e.value.toFixed(4)), at: Math.round(e.startTime), nodes: (e.sources || []).map((x) => (x.node && x.node.nodeType === 1 ? (x.node.querySelector?.("h2")?.textContent || x.node.getAttribute("data-languages-loading") !== null ? x.node.querySelector?.("h2")?.textContent || "loading" : x.node.tagName) : String(x.node && x.node.nodeName)) + (x.previousRect ? ` ${Math.round(x.previousRect.y)}>${Math.round(x.currentRect.y)} h${Math.round(x.previousRect.height)}>${Math.round(x.currentRect.height)}` : "")) })
        }
      }).observe({ type: "layout-shift", buffered: true })
      /*
        The harness answers /api/ itself with a fetch it sets later: kept in
        front of it, whatever it sets, so a slow answer and the rules' PUT
        are this probe's. Anything else goes to the browser's own fetch.
      */
      const native = window.fetch.bind(window)
      let harness = native
      const wrapped = async (input, init) => {
        const url = typeof input === "string" ? input : input.url
        const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]
        const method = (init?.method || "GET").toUpperCase()
        if (!path.startsWith("/api/")) return native(input, init)
        if (method === "PUT" && path === "/api/store/translations/rules") {
          const body = JSON.parse(String(init.body))
          ;(window.__sentRules ??= []).push(body.rules)
          await new Promise((r) => setTimeout(r, 60))
          return new Response(JSON.stringify({ rules: body.rules, rewriting: (body.rules.glossary || []).length > 1 ? 4 : 0 }), { status: 200, headers: { "Content-Type": "application/json" } })
        }
        if (method === "GET" && s[path]) await new Promise((r) => setTimeout(r, s[path]))
        return harness(input, init)
      }
      Object.defineProperty(window, "fetch", {
        configurable: true,
        get: () => wrapped,
        set: (f) => {
          harness = f
        },
      })
    },
    panel,
    api,
    slow,
  )
  /* A query of its own each time: a new document, never a jump to an anchor of the last one. */
  await page.goto(`file://${join(out, "index.html")}?p=${panel}-${Date.now()}${hash}`)
  await wait(450)
}
const rect = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top + scrollY, height: r.height, left: r.left, right: r.right, mid: r.top + scrollY + r.height / 2 }
  }, sel)
/* A field emptied and typed into the way a person does, so React sees every key. */
const fill = async (sel, text) => {
  await page.$eval(sel, (el) => el.select())
  await page.keyboard.press("Backspace")
  if (text) await page.type(sel, text)
}
const shot = async (name, vp) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}-${vp.width}.png`, fullPage: true })
}
const languagesCard = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Languages")
    return el ? Math.round(el.getBoundingClientRect().height) : null
  })

for (const [label, vp] of [
  ["a phone (390)", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ["a computer (1280)", { width: 1280, height: 900 }],
]) {
  console.log(`\nLanguages & Currency on ${label}`)
  /* The progress arrives late, as it does on a real store (it reads every text): nothing on the row of actions may move when it lands. */
  await open("markets", vp, { slow: { "/api/store/translations": 700 } })
  const early = await rect("[data-open-glossary]")
  await wait(900)
  const add = await rect("[data-add-language]")
  const glossary = await rect("[data-open-glossary]")
  const row = await rect("[data-language-actions]")
  const offset = glossary && add ? Math.abs(glossary.mid - add.mid) : null
  const topOffset = glossary && add ? Math.abs(glossary.top - add.top) : null
  const rowOffset = glossary && row ? Math.abs(glossary.mid - row.mid) : null
  say(offset !== null && offset <= 1 && topOffset <= 1 && rowOffset <= 1, `Glossary beside Add language: middle ${offset?.toFixed(2)}px, top ${topOffset?.toFixed(2)}px off Add language, ${rowOffset?.toFixed(2)}px off its row's middle`)
  say(glossary && add && glossary.height === add.height, `the same height: Glossary ${glossary?.height}px, Add language ${add?.height}px, the row ${row?.height}px`)
  say(glossary && glossary.left > add.right && glossary.left - add.right <= 9, `on one line, ${glossary ? Math.round(glossary.left - add.right) : "?"}px apart`)
  const moved = early && glossary ? Math.abs(early.top - glossary.top) + Math.abs(early.left - glossary.left) : null
  say(moved !== null && moved <= 0.5, `the Glossary button does not move when the languages' progress arrives (${moved?.toFixed(2)}px)`)
  const fits = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  say(fits <= 0, `nothing runs off the side (${fits}px over)`)
  const lines = await page.evaluate(() => [...document.querySelectorAll("[data-language] [data-language-progress]")].map((e) => e.textContent.trim()))
  say(lines.some((l) => /20 drafts/.test(l) && /3 need review/.test(l)), `the row says Draft and Needs review in the sheet's words: "${lines[1] ?? ""}"`)
  await shot("languages-actions", vp)

  /*
    The loading cards, then the cards they become, for a website in one
    language: the store currency answers at 300ms, the languages at 900ms.
    Settings shows this tab once both are in (settings-form-new TAB_DATA),
    so these are the slow case, past its wait.
  */
  await open("markets", vp, { api: { ...API, "GET /api/store/markets": loc([]) }, slow: { "/api/store/currency": 300, "/api/store/markets": 900 } })
  const currencyLoading = await page.evaluate(() => Math.round(document.querySelector("[data-markets-panel] > section")?.getBoundingClientRect().height ?? 0))
  const loadingH = await languagesCard()
  const loadingSeen = await page.evaluate(() => !!document.querySelector("[data-languages-loading]"))
  await wait(250)
  const currencyLoaded = await page.evaluate(() => Math.round(document.querySelector("[data-selling-in]")?.closest("section")?.getBoundingClientRect().height ?? 0))
  const clsCurrency = await page.evaluate(() => window.__cls)
  await wait(900)
  const loadedH = await languagesCard()
  const cls = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }))
  say(loadingSeen && loadingH !== null && Math.abs(loadingH - loadedH) <= 1, `the Languages loading card is as tall as the card it turns into (${loadingH}px, then ${loadedH}px)`)
  const own = cls.cls - clsCurrency
  say(own < 0.001, `layout shift when the languages arrive: ${own.toFixed(4)}`)
  say(currencyLoading > 0 && Math.abs(currencyLoaded - currencyLoading) <= 20, `the Store currency card while it loads: ${currencyLoading}px, then ${currencyLoaded}px (its line's length is only known once it loads); layout shift ${clsCurrency.toFixed(4)}${cls.shifts.length ? ` ${JSON.stringify(cls.shifts.map((x) => x.nodes[0])).slice(0, 160)}` : ""}`)

  console.log(`\nThe glossary on ${label}`)
  await open("markets", vp)
  await page.click("[data-open-glossary]")
  await wait(500)
  const listBefore = await rect("[data-glossary-terms]")
  const toggle = await page.evaluate(() => document.querySelector("#keep-product-names")?.getAttribute("aria-checked") ?? document.querySelector("#keep-product-names")?.getAttribute("data-state"))
  say(toggle === "true" || toggle === "checked", `Keep product names as written reads the saved choice (on): ${toggle}`)
  const clsBefore = await page.evaluate(() => window.__cls)
  await page.click("#keep-product-names")
  await wait(400)
  const listAfter = await rect("[data-glossary-terms]")
  const clsAfter = await page.evaluate(() => window.__cls)
  const listMoved = listBefore && listAfter ? Math.abs(listBefore.top - listAfter.top) + Math.abs(listBefore.height - listAfter.height) : null
  say(listMoved === 0, `switching it moves nothing below: the terms list moved ${listMoved}px, layout shift ${(clsAfter - clsBefore).toFixed(4)}`)
  let sent = await page.evaluate(() => window.__sentRules ?? [])
  say(sent.length === 1 && sent[0].keepProductNames === false && sent[0].glossary.length === 1 && sent[0].noTranslate.length === 1, `saved at once with the rest of the rules kept: ${JSON.stringify(sent[0] ?? null)}`)
  await shot("glossary", vp)

  /* Add term: a duplicate and a one letter word are refused in the form, nothing sent. */
  await page.click("[data-add-glossary-term]")
  await wait(150)
  const focused = await page.evaluate(() => document.activeElement?.id)
  say(focused === "glossary-term", `Add term opens the form in the list, its field focused (${focused})`)
  await page.type("#glossary-term", "storelib pro")
  await page.click("[data-save-glossary-term]")
  await wait(150)
  let problem = await page.evaluate(() => [...document.querySelectorAll("[data-glossary-problem]")].map((p) => `${p.getAttribute("data-glossary-problem")}: ${p.textContent}`))
  say(problem.length === 1 && /^duplicate/.test(problem[0]), `a term already there, in other letters, is refused: ${problem.join(" | ")}`)
  await fill("#glossary-term", "G")
  await page.click("[data-save-glossary-term]")
  await wait(150)
  problem = await page.evaluate(() => [...document.querySelectorAll("[data-glossary-problem]")].map((p) => p.getAttribute("data-glossary-problem")))
  say(problem.join() === "short", `one letter is refused: ${problem.join()}`)
  await page.type("#glossary-term", "ift card  ")
  await page.click('[data-glossary-mode] [role=radio]:nth-child(2)')
  await wait(100)
  await page.click("[data-save-glossary-term]")
  await wait(150)
  problem = await page.evaluate(() => [...document.querySelectorAll("[data-glossary-problem]")].map((p) => p.getAttribute("data-glossary-problem")))
  say(problem.join() === "noTranslation", `Translate as with no translation asks for one: ${problem.join()}`)
  const fields = await page.evaluate(() => [...document.querySelectorAll("[data-glossary-translations] input")].map((i) => i.id))
  say(fields.join() === "glossary-to-ro,glossary-to-fr", `a field for each language: ${fields.join()}`)
  await page.type("#glossary-to-fr", "Carte cadeau")
  const fit = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  say(fit <= 0, `the form fits (${fit}px over)`)
  await shot("glossary-form", vp)
  await page.click("[data-save-glossary-term]")
  await wait(400)
  sent = await page.evaluate(() => window.__sentRules ?? [])
  const added = sent[sent.length - 1]?.glossary ?? []
  say(sent.length === 2 && added.length === 2 && added[1].term === "Gift card" && added[1].to?.fr === "Carte cadeau" && !added[1].to?.ro && !added[1].keep, `added, trimmed, with only the language written: ${JSON.stringify(added[1] ?? null)}`)
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-glossary-term]")].map((li) => li.textContent.replace(/\s+/g, " ").trim()))
  const note = await page.evaluate(() => document.querySelector("[data-glossary-status]")?.textContent ?? "")
  say(rows.length === 2 && /French: Carte cadeau/.test(rows[1]), `the list says what each term does: ${rows.join(" | ")}`)
  say(/4 translations that use it are being updated/.test(note), `and what happens to what is already translated: "${note}"`)

  /* Edit, then remove and Undo. */
  await page.click('[data-edit-glossary-term="Gift card"]')
  await wait(150)
  const editing = await page.evaluate(() => ({ term: document.querySelector("#glossary-term")?.value, fr: document.querySelector("#glossary-to-fr")?.value, mode: document.querySelector("[data-glossary-mode]")?.getAttribute("data-glossary-mode") }))
  say(editing.term === "Gift card" && editing.fr === "Carte cadeau" && editing.mode === "translate", `Edit opens it as saved: ${JSON.stringify(editing)}`)
  await fill("#glossary-to-fr", "Chèque cadeau")
  await page.keyboard.press("Enter")
  await wait(400)
  sent = await page.evaluate(() => window.__sentRules ?? [])
  say(sent[sent.length - 1]?.glossary?.[1]?.to?.fr === "Chèque cadeau" && sent[sent.length - 1].glossary.length === 2, `Enter saves the change in place: ${JSON.stringify(sent[sent.length - 1]?.glossary?.[1] ?? null)}`)
  await page.click('[data-remove-glossary-term="Gift card"]')
  await wait(400)
  sent = await page.evaluate(() => window.__sentRules ?? [])
  const afterRemove = sent[sent.length - 1]?.glossary?.map((g) => g.term).join() ?? ""
  const undo = await page.evaluate(() => !!document.querySelector("[data-glossary-undo]"))
  say(afterRemove === "Storelib Pro" && undo, `Remove saves without it and offers Undo (${afterRemove})`)
  await page.click("[data-glossary-undo]")
  await wait(400)
  sent = await page.evaluate(() => window.__sentRules ?? [])
  say(sent[sent.length - 1]?.glossary?.map((g) => g.term).join() === "Storelib Pro,Gift card", `Undo puts it back where it was (${sent[sent.length - 1]?.glossary?.map((g) => g.term).join()})`)

  /* The empty list says what a term is, with an example. */
  await open("markets", vp, { api: { ...API, "GET /api/store/translations/rules": { ready: true, rules: { glossary: [], noTranslate: [], keepProductNames: true } } } })
  await page.click("[data-open-glossary]")
  await wait(500)
  const empty = await page.evaluate(() => document.querySelector("[data-glossary-empty]")?.textContent ?? "")
  say(/Storelib Pro/.test(empty), `with no terms, one line with an example: "${empty}"`)
  await shot("glossary-empty", vp)

  console.log(`\nThe Checkout tab on ${label}`)
  await open("checkout", vp, { hash: "#checkout-text" })
  await wait(300)
  const order = await page.evaluate(() => [...document.querySelectorAll("[data-checkout-settings] section h2")].map((h) => h.textContent.trim()))
  const text = order.indexOf("Checkout text")
  const abandoned = order.indexOf("Abandoned checkouts")
  say(text >= 0 && abandoned >= 0 && text < abandoned, `Checkout text above Abandoned checkouts: ${order.join(" > ")}`)
  const anchor = await page.evaluate(() => ({ text: !!document.getElementById("checkout-text"), abandoned: !!document.getElementById("abandoned-checkouts"), top: Math.round(document.getElementById("checkout-text")?.getBoundingClientRect().top ?? -1) }))
  say(anchor.text && anchor.abandoned && anchor.top >= 0 && anchor.top < 40, `#checkout-text and #abandoned-checkouts are there, and the first lands at the top (${anchor.top}px)`)
  await shot("checkout-order", vp)
}

await browser.close()
console.log(bad ? `\n${bad} failed` : "\nall ok")
process.exit(bad ? 1 : 0)
