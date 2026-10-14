/**
 * ===========================================================================
 *  CASH ON DELIVERY, SEEN WHERE A BUYER SEES IT
 * ===========================================================================
 * The real checkouts and order page (scripts/render-store23.tsx, the -cod
 * cases) in Chromium, on a phone (390x844, touch, the CPU slowed four times)
 * and a laptop (1440x900), with the shop's Cash on delivery switch on:
 *
 *   - Card and Cash on delivery side by side, the card first and chosen;
 *   - choosing cash puts the card fields away, says what to pay and when,
 *     and turns Pay into Place order; nothing is sent while the form is
 *     missing what the shop asks for;
 *   - the cart checkout offers the same, and says nothing is charged now;
 *   - the order page says how much cash to have ready;
 *   - nothing scrolls sideways, nothing logs an error.
 *
 * CSS from a production build (.next/static/chunks, or STORELIB_CSS_DIR).
 *   node scripts/check-cod-checkout.mjs        SHOTS_DIR=... to keep the pictures
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = process.env.STORELIB_CSS_DIR || join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first, or set STORELIB_CSS_DIR.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-cod-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".cod-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/checkout"
export const useRouter = () => ({ push(u) { window.__pushed = u }, prefetch() {}, replace(u) { window.__replaced = u }, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-store23.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
try {
  execFileSync(
    join(root, "node_modules/.bin/esbuild"),
    [
      join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:next/image=${join(stubs, "image.jsx")}`, `--alias:@=${root}`,
      "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit" },
  )
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))
const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
/* SERVE_ONLY=1: build and serve the cases, to open them by hand. */
if (process.env.SERVE_ONLY) {
  console.log(`serving ${origin}/?case=site`)
  await new Promise(() => {})
}

/* ONLY=receipt,order to look at some of them. */
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null
const want = (which) => !only || only.has(which)
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok || got === undefined ? "" : `   (${typeof got === "string" ? got.slice(0, 300) : JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, timeout: 180000, protocolTimeout: 300000, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage"] })

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const LAPTOP = { width: 1440, height: 900 }
async function open(viewport, which) {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  if (viewport.isMobile) {
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await p.goto(`${origin}/?case=${which}`, { waitUntil: "load", timeout: 180000 })
  try {
    await p.waitForSelector(`[data-case="${which}"]`, { timeout: 180000 })
  } catch (e) {
    console.log(`  FAIL  ${which} did not draw`, JSON.stringify(await p.evaluate(() => window.__errors || [])).slice(0, 800))
    throw e
  }
  await sleep(viewport.isMobile ? 1200 : 600)
  return p
}
const text = (p) => p.evaluate(() => document.body.innerText)
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const shot = async (p, name) => p.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
const errors = (p) => p.evaluate(() => (window.__errors || []).filter((e) => !/Stripe|stripe|Failed to load resource|placeholder\.supabase/.test(e)))

const sizes = [["phone 390, touch, 4x slower CPU", PHONE], ["laptop 1440", LAPTOP]].filter(([, vp]) => !process.env.SIZES || process.env.SIZES.split(",").includes(String(vp.width)))
for (const [label, vp] of sizes) {
  const tag = vp.isMobile ? "390" : "1440"
  console.log(`\n${label}`)

  if (want("site-cod")) {
    const p = await open(vp, "site-cod")
    const choice = await p.evaluate(() => {
      const g = document.querySelector('[data-pay-choice]')
      const radios = g ? [...g.querySelectorAll('[role="radio"]')].map((r) => ({ text: r.textContent.trim(), on: r.getAttribute("aria-checked") === "true", h: Math.round(r.getBoundingClientRect().height) })) : []
      return { radios, button: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => /^Pay |^Place order|^Processing/.test(t)) || null }
    })
    expect(choice.radios.map((r) => r.text).join("|") === "Card|Cash on delivery", "website: Card and Cash on delivery side by side", choice.radios)
    expect(choice.radios[0]?.on === true && choice.radios[1]?.on === false, "  the card first, and chosen", choice.radios)
    expect(choice.radios.every((r) => r.h >= 44), "  each at least 44px tall to press", choice.radios.map((r) => r.h))
    const cutSite = await p.evaluate(() => [...document.querySelectorAll('[data-pay-choice] [role="radio"] span:last-child')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))
    expect(cutSite.length === 0, "  every name whole, never cut off", cutSite)
    expect(/^Pay /.test(choice.button || ""), "  the button pays by card", choice.button)
    await shot(p, `site-cod-card-${tag}`)
    await p.click("[data-pay-cash]")
    await sleep(400)
    const cash = await p.evaluate(() => {
      const note = document.querySelector("[data-cash-note]")
      const card = document.querySelector("[data-pay-choice]")?.parentElement?.querySelector(".hidden")
      return {
        on: document.querySelector("[data-pay-cash]")?.getAttribute("aria-checked") === "true",
        note: note ? note.textContent.trim() : null,
        cardHidden: !!card && getComputedStyle(card).display === "none",
        button: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => /^Pay |^Place order|^Processing/.test(t)) || null,
      }
    })
    expect(cash.on, "website: Cash on delivery chosen")
    expect(/^Pay .+ in cash when it's delivered\.$/.test(cash.note || ""), "  says what to pay and when", cash.note)
    expect(cash.cardHidden, "  the card fields step aside")
    expect(cash.button === "Place order", "  the button places the order", cash.button)
    expect(!(await p.$("[data-pay-failed]")), "  a card form that did not load is not shown as a problem while paying in cash")
    await shot(p, `site-cod-cash-${tag}`)
    const before = await p.evaluate(() => (window.__calls || []).filter((c) => c.body && c.body.action === "cod").length)
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Place order")?.click())
    await sleep(600)
    const sent = await p.evaluate(() => (window.__calls || []).filter((c) => c.body && c.body.action === "cod").length)
    const missing = await p.evaluate(() => [...document.querySelectorAll('[role="alert"], [aria-invalid="true"]')].map((e) => e.textContent.trim() || e.getAttribute("id") || e.tagName).slice(0, 4))
    await shot(p, `site-cod-missing-${tag}`)
    expect(sent === before && missing.length > 0, "  with the form not filled in, nothing is sent and the page says what is missing", { sent, before, missing })
    await p.click('[data-pay-choice] [role="radio"]')
    await sleep(300)
    const back = await p.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => /^Pay |^Place order/.test(t)))
    expect(/^Pay /.test(back || ""), "  back to the card, Pay again", back)
    expect((await sideways(p)) === 0, "  nothing scrolls sideways", await sideways(p))
    expect((await errors(p)).length === 0, "  no errors", await errors(p))
    await p.close()
  }

  if (want("site-fr")) {
    const p = await open(vp, "site-fr")
    const fr = await p.evaluate(() => ({
      lang: document.documentElement.lang,
      body: document.body.innerText,
      radios: [...document.querySelectorAll('[data-pay-choice] [role="radio"]')].map((r) => r.textContent.trim()),
      button: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => /^Payer |^Passer la commande/.test(t)) || null,
      links: [...document.querySelectorAll("#checkout-terms a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
      germany: [...document.querySelectorAll("#checkout-country option")].some((o) => o.textContent.trim() === "Allemagne"),
    }))
    expect(fr.lang === "fr", "in French: the page says it is French", fr.lang)
    expect(["Coordonnées", "Moyen de paiement", "Mode de livraison", "Sous-total", "Total à payer"].every((w) => fr.body.includes(w)), "  its headings and totals in French", fr.body.slice(0, 300))
    expect(fr.radios.join("|") === "Carte|Paiement à la livraison", "  how to pay, in French", fr.radios)
    expect(/^Payer /.test(fr.button || ""), "  the button says Payer with the amount", fr.button)
    expect(JSON.stringify(fr.links) === JSON.stringify([["Conditions générales", "/terms"], ["Politique de remboursement", "/refund-policy"]]), "  the agreement's two links, in French, each to its page", fr.links)
    expect(fr.germany, "  the countries named in French")
    expect(fr.body.includes("Saisissez") === false && /Email|E-mail/i.test(fr.body), "  a sentence nobody translated reads in English, never a key")
    const cutFr = await p.evaluate(() => [...document.querySelectorAll('[data-pay-choice] [role="radio"] span:last-child')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))
    expect(cutFr.length === 0, "  longer French names whole, never cut off", cutFr)
    await shot(p, `site-fr-${tag}`)
    expect((await sideways(p)) === 0, "  nothing scrolls sideways", await sideways(p))
    expect((await errors(p)).length === 0, "  no errors", await errors(p))
    await p.close()
  }

  if (want("site")) {
    const p = await open(vp, "site")
    expect(!(await p.$("[data-pay-choice]")), "website, cash off: no choice, the card form as before")
    await p.close()
  }

  if (want("physical-cod")) {
    const p = await open(vp, "physical-cod")
    const radios = await p.evaluate(() => [...document.querySelectorAll('[data-pay-choice] [role="radio"]')].map((r) => r.textContent.trim()))
    expect(radios.join("|") === "Card|Cash on delivery", "cart checkout: Card and Cash on delivery", radios)
    const cut = await p.evaluate(() => [...document.querySelectorAll('[data-pay-choice] [role="radio"] span:last-child')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > e.closest("button").getBoundingClientRect().right).map((e) => e.textContent))
    expect(cut.length === 0, "  every name whole, never cut off", cut)
    const heading = await p.evaluate(() => [...document.querySelectorAll("h2")].some((h) => h.textContent.trim() === "Payment"))
    expect(heading, "  under its own Payment heading, as Delivery and Shipping method are")
    await p.click("[data-pay-cash]")
    await sleep(400)
    const said = await text(p)
    const button = await p.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => /Place order|Continue to payment|Placing order/.test(t)))
    expect(/Pay .+ in cash when it's delivered\./.test(said), "  says what to pay and when")
    expect(button === "Place order", "  the button places the order", button)
    expect(/Nothing is charged now\. The shop collects the cash\./.test(said), "  and says nothing is charged now")
    await shot(p, `physical-cod-${tag}`)
    expect((await sideways(p)) === 0, "  nothing scrolls sideways", await sideways(p))
    expect((await errors(p)).length === 0, "  no errors", await errors(p))
    await p.close()
  }

  if (want("order-cod")) {
    const p = await open(vp, "order-cod")
    const said = await text(p)
    expect(/Pay .+ in cash when it's delivered\./.test(said), "order page: how much cash to have ready")
    await shot(p, `order-cod-${tag}`)
    expect((await sideways(p)) === 0, "  nothing scrolls sideways", await sideways(p))
    await p.close()
  }

  if (want("order-fr")) {
    const p = await open(vp, "order-fr")
    const said = await text(p)
    const lang = await p.evaluate(() => document.documentElement.lang)
    expect(lang === "fr", "order page in French: the page says it is French", lang)
    expect(["Commande #", "Votre commande est confirmée", "Confirmée", "En préparation", "Expédiée", "Livrée", "Articles", "Qté 2", "Adresse de livraison"].every((w) => said.includes(w)), "  its heading, steps and items in French", said.slice(0, 400))
    expect(said.includes("Standard, en général 3 à 5 jours ouvrés après l'expédition."), "  the delivery estimate said again in French from its numbers", said.match(/Standard[^\n]*/)?.[0])
    expect(/52,60\s?RON/.test(said), "  the amounts written the French way", said.match(/[\d,.]+\s?RON|RON\s?[\d,.]+/)?.[0])
    expect(/11 oct\.? 2026/.test(said), "  the date written the French way", said.match(/\d+ \S+ 2026/)?.[0])
    expect(said.includes("Besoin d'aide pour cette commande ?") && said.includes("Contacter la boutique"), "  the help panel in French too")
    expect(said.includes("Visit the store") && !/checkout:|\{\w+\}/.test(said), "  a sentence nobody translated reads in English, never a key or a placeholder")
    await shot(p, `order-fr-${tag}`)
    expect((await sideways(p)) === 0, "  nothing scrolls sideways", await sideways(p))
    expect((await errors(p)).length === 0, "  no errors", await errors(p))
    await p.close()
  }

  if (want("receipt-fr")) {
    const p = await open(vp, "receipt-fr")
    const said = await text(p)
    expect(["Merci, Maria", "Commande 1042", "Vendu par Bread Studio SRL (sous le nom Bread Studio)", "Télécharger la facture (PDF)"].every((w) => said.includes(w)), "receipt in French: its heading, number, seller and invoice", said.slice(0, 400))
    expect(said.includes("Paid with Visa ending 4242") && !/checkout:|\{\w+\}/.test(said), "  a sentence nobody translated reads in English, never a key or a placeholder")
    expect(/octobre 2026/.test(said), "  the date in French", said.match(/\d+ \S+ 2026/)?.[0])
    await shot(p, `receipt-fr-${tag}`)
    expect((await sideways(p)) === 0, "  nothing scrolls sideways", await sideways(p))
    expect((await errors(p)).length === 0, "  no errors", await errors(p))
    await p.close()
  }
}

await browser.close()
server.close()
console.log(`\n${broken === 0 ? "every check passed" : `${broken} failed`}   (pictures: ${shots})`)
process.exit(broken ? 1 : 0)
