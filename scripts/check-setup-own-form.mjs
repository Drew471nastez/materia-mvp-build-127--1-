/**
 * ===========================================================================
 *  STORELIB'S OWN PAYOUT FORM, DRIVEN AT A PHONE'S WIDTH AND A COMPUTER'S
 * ===========================================================================
 * Opens the real setup panel on its details step, with /api/payments answered
 * the way the server answers (a Romanian account: date of birth, address,
 * CNP and the agreement now; the bank next), fills it in, sends it, adds an
 * IBAN and lands on the finish. Checks there is no sideways scroll, nothing
 * from Stripe is framed in, the buttons sit at the foot of a phone screen,
 * a bad IBAN is caught on the page, and nothing throws. Pictures go to
 * .setup-own-form-probe/.
 *
 *   node scripts/check-setup-own-form.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = mkdtempSync(join(tmpdir(), "storelib-own-form-"))
writeFileSync(join(stubs, "navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => "/app/payouts"
export const useSearchParams = () => new URLSearchParams(location.search)`)

const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-setup-own-form.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", react: compiled("react"), "react-dom": compiled("react-dom"), "next/navigation": join(stubs, "navigation.js") },
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const css = await appCss(root)
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const needsNow = { fields: ["dob", "address", "idNumber"], tos: true, bank: true, name: false, other: [], checking: false, registeredAddress: false, problems: [] }
const form = (needs) => ({
  needs,
  country: "RO",
  agreementUrl: "https://stripe.com/legal/connect-account",
  dueBy: null,
  active: false,
  idNumber: { label: "CNP (personal numeric code)", hint: "The 13 digit number on your Romanian ID card." },
  bank: { kind: "iban", currency: "RON", holderName: "Andrei Balan", last4: null },
})
const doneOverview = { provider: "stripe", beat: "done", paymentsStatus: { status: "ACTIVE", title: "Payments active", line: "", action: null }, payoutDestination: { last4: "0000" }, balances: [], payouts: [], requirements: [], can: {}, unavailable: [] }

const out = join(root, ".setup-own-form-probe")
mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  {
    /* Later, the Gumroad way: payments are on and Stripe asks for one more thing. */
    console.log("\nLater, when Stripe asks for an ID photo (390px)")
    const later = true
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u === "http://probe.test/api/payments/details-form" && later) return json({ ...form({ ...needsNow, fields: ["document"], tos: false, bank: false, problems: ["Stripe could not read your ID. Upload a sharper photo, all four corners in, no glare."] }), active: true, dueBy: "2026-10-20T00:00:00.000Z" })
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts?later=1")
    await p.waitForSelector("[data-upload-tile]", { timeout: 6000 })
    await new Promise((r) => setTimeout(r, 400))
    const view = await p.evaluate(() => ({
      title: document.body.textContent?.includes("Stripe needs a little more"),
      reason: !!document.querySelector("[data-setup-problems]"),
      tiles: document.querySelectorAll("[data-upload-tile]").length,
      onlyThat: !document.querySelector('[autocomplete="bday-day"]'),
      input: document.querySelector('[data-upload-tile] input[type="file"]')?.getAttribute("accept") ?? "",
    }))
    expect(view.title, "it says Stripe needs a little more, not setup from the start")
    expect(view.reason, "with Stripe's reason in plain words")
    expect(view.tiles === 2 && view.onlyThat, "and asks only for the photo, front and back", view)
    expect(/image/.test(view.input), "the photo opens the phone's camera or library", view.input)
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.screenshot({ path: join(out, "later-390.png") })
    await p.close()
  }
  for (const width of [390, 1280]) {
    const later = false
    const phone = width < 640
    console.log(`\nAt ${width}px`)
    const p = await browser.newPage()
    const errors = []
    const sent = {}
    const framed = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/api/payments/")) {
        const action = u.slice("http://probe.test/api/payments/".length)
        sent[action] = r.postData() ?? ""
        const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
        if (action === "details-form" && later) return json({ ...form({ ...needsNow, fields: ["document"], tos: false, bank: false, problems: ["Stripe could not read your ID. Upload a sharper photo, all four corners in, no glare."] }), active: true, dueBy: "2026-10-20T00:00:00.000Z" })
        if (action === "details-form") return json(form(needsNow))
        if (action === "details") return json({ form: form({ ...needsNow, fields: [], tos: false }), overview: { ...doneOverview, beat: "bank", paymentsStatus: { status: "BANK_REQUIRED", action: "bank" }, payoutDestination: null } })
        if (action === "bank") return json({ form: form({ ...needsNow, fields: [], tos: false, bank: false }), overview: doneOverview })
        if (action === "refresh") return json(doneOverview)
        return json({})
      }
      if (/stripe\.com/.test(u)) framed.push(u)
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
    await p.goto("http://probe.test/app/payouts")
    await p.waitForSelector('input[autocomplete="bday-day"]', { timeout: 6000 })
    await new Promise((r) => setTimeout(r, 400))
    await p.screenshot({ path: join(out, `details-${width}.png`) })

    const shape = await p.evaluate(() => {
      const panel = document.querySelector("[data-payments-setup-panel]")
      const foot = document.querySelector("[data-setup-footer]")?.getBoundingClientRect()
      return {
        sideways: document.documentElement.scrollWidth > window.innerWidth || (panel ? panel.scrollWidth > panel.clientWidth : false),
        footBottom: foot ? Math.round(window.innerHeight - foot.bottom) : null,
        iframes: document.querySelectorAll("iframe").length,
        fields: ["bday-day", "bday-month", "bday-year", "address-line1", "address-level2", "postal-code"].every((a) => !!document.querySelector(`[autocomplete="${a}"]`)),
        idLabel: document.body.textContent?.includes("CNP (personal numeric code)"),
        agreement: !!document.querySelector('a[href="https://stripe.com/legal/connect-account"]'),
        noPhoto: !document.querySelector("[data-upload-tile]"),
        smallText: [...document.querySelectorAll("[data-payments-setup-panel] input, [data-payments-setup-panel] select")].filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length,
      }
    })
    expect(!shape.sideways, "no sideways scroll", shape.sideways)
    expect(shape.iframes === 0, "nothing from Stripe is framed in", shape.iframes)
    expect(shape.fields, "date of birth and address are asked")
    expect(shape.idLabel, "the ID number is named as Romania does: CNP")
    expect(shape.agreement, "Stripe's agreement is linked to be accepted")
    expect(shape.noPhoto, "like Gumroad, no ID photo is asked before Stripe wants one")
    if (phone) {
      expect(shape.footBottom !== null && shape.footBottom <= 2, "Continue sits at the foot of the phone screen", shape.footBottom)
      expect(shape.smallText === 0, "every field is 16px on a phone, so iOS does not zoom in", shape.smallText)
    }

    /* Continue with nothing filled: the page says what is wrong and sends nothing. */
    await p.click('button[type="submit"]')
    await new Promise((r) => setTimeout(r, 200))
    expect(!("details" in sent), "an empty form is not sent")
    expect(await p.evaluate(() => /Check the fields marked in red/.test(document.body.textContent ?? "")), "and says what to fix")

    await p.type('[autocomplete="bday-day"]', "14")
    await p.select('select[aria-label="Month"]', "3")
    await p.type('[autocomplete="bday-year"]', "1994")
    await p.type('[autocomplete="address-line1"]', "Strada Lipscani 12")
    await p.type('[autocomplete="address-level2"]', "Bucharest")
    await p.type('[autocomplete="postal-code"]', "030031")
    await p.evaluate(() => {
      const label = [...document.querySelectorAll("label")].find((l) => l.textContent?.includes("CNP"))
      const id = label?.getAttribute("for")
      ;(id ? document.getElementById(id) : null)?.focus()
    })
    await p.keyboard.type("1940314123456")
    await p.evaluate(() => [...document.querySelectorAll('input[type="checkbox"]')].forEach((c) => c.click()))
    await p.screenshot({ path: join(out, `details-filled-${width}.png`) })
    await p.click('button[type="submit"]')
    await p.waitForFunction(() => document.body.textContent?.includes("IBAN"), { timeout: 5000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
    const body = sent.details ? JSON.parse(sent.details) : null
    expect(!!body && body.dob?.year === 1994 && body.dob?.month === 3 && body.address?.city === "Bucharest" && body.idNumber === "1940314123456" && body.acceptTos === true, "the details go to the server as entered", body && { dob: body.dob, city: body.address?.city, tos: body.acceptTos })
    expect(await p.evaluate(() => document.body.textContent?.includes("IBAN")), "then the bank step, with an IBAN for Romania")
    await p.screenshot({ path: join(out, `bank-${width}.png`) })

    await p.type('[placeholder^="RO00"]', "RO49AAAA1B31007593840001")
    await p.click('button[type="submit"]')
    await new Promise((r) => setTimeout(r, 200))
    expect(!("bank" in sent), "an IBAN with a wrong digit is caught on the page")
    await p.evaluate(() => {
      const el = document.querySelector('[placeholder^="RO00"]')
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
      set.call(el, "")
      el.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await p.type('[placeholder^="RO00"]', "RO49AAAA1B31007593840000")
    const shown = await p.$eval('[placeholder^="RO00"]', (el) => el.value)
    expect(shown === "RO49 AAAA 1B31 0075 9384 0000", "the IBAN is grouped in fours as it is typed", shown)
    await p.click('button[type="submit"]')
    await p.waitForFunction(() => document.body.textContent?.includes("Payments active"), { timeout: 5000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 400))
    expect(sent.bank && JSON.parse(sent.bank).iban === "RO49 AAAA 1B31 0075 9384 0000", "the valid IBAN is sent")
    expect(await p.evaluate(() => document.body.textContent?.includes("Payments active")), "and setup ends on Payments active")
    await p.screenshot({ path: join(out, `finished-${width}.png`) })
    expect(framed.length === 0, "no request went to Stripe from the page", framed.slice(0, 2))
    expect(errors.length === 0, "nothing threw", errors.slice(0, 2))
    await p.close()
  }
} finally {
  await browser.close()
}
console.log(`\n  pictures in .setup-own-form-probe/`)
if (broken) {
  console.error(`\n${broken} wrong.`)
  process.exit(1)
}
console.log("\n  all good.")
