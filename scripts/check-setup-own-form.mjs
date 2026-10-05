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

/* What own-form-rules hands the page. `handover` is always empty now: Storelib's own form draws everything. */
const needsNow = { fields: ["dob", "address"], tos: true, bank: true, name: false, other: [], checking: false, registeredAddress: false, problems: [], either: [], offered: [], given: [], handover: [] }
const form = (needs) => ({
  needs,
  country: "RO",
  agreementUrl: "https://stripe.com/legal/connect-account",
  dueBy: null,
  active: false,
  idNumber: { label: "CNP (personal numeric code)", hint: "The 13 digit number on your Romanian ID card." },
  bank: { kind: "iban", currency: "RON", holderName: "Andrei Balan", last4: null, currencies: ["RON", "EUR", "USD"] },
})
/* Fill the details page and press Continue, which is now how the ID step is reached. */
async function pastDetails(p) {
  await p.waitForSelector('[autocomplete="bday-day"]', { timeout: 8000 })
  await p.type('[autocomplete="bday-day"]', "14")
  await p.select('select[aria-label="Month"]', "3")
  await p.type('[autocomplete="bday-year"]', "1994")
  await p.type('[autocomplete="address-line1"]', "Strada Lipscani 12")
  await p.type('[autocomplete="address-level2"]', "Bucharest")
  await p.type('[autocomplete="postal-code"]', "030031")
  const iban = await p.$('[placeholder^="RO00"]')
  if (iban) await iban.type("RO49AAAA1B31007593840000")
  await p.evaluate(() => [...document.querySelectorAll('input[type="checkbox"]')].forEach((c) => c.click()))
  await p.evaluate(() => document.querySelector('button[type="submit"]')?.click())
}

const doneOverview = { provider: "stripe", beat: "done", paymentsStatus: { status: "ACTIVE", title: "Payments active", line: "", action: null }, payoutDestination: { last4: "0000" }, balances: [], payouts: [], requirements: [], can: {}, unavailable: [] }

/* A second bundle: setup at step one, where the Country field lives. */
await build({
  entryPoints: [join(root, "scripts/render-setup-country.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", react: compiled("react"), "react-dom": compiled("react-dom"), "next/navigation": join(stubs, "navigation.js") },
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "country.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
writeFileSync(
  join(stubs, "country.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${readFileSync(join(stubs, "country.js"), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
)

const out = join(root, ".setup-own-form-probe")
mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--unsafely-treat-insecure-origin-as-secure=http://probe.test"] })
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
      if (u === "http://probe.test/api/payments/identity") return json({ ok: false, reason: "not_enabled" })
      if (u === "http://probe.test/api/payments/details-form" && later) return json({ ...form({ ...needsNow, fields: ["document"], tos: false, bank: false, problems: ["Stripe could not read your ID. Upload a sharper photo, all four corners in, no glare."] }), active: true, dueBy: "2026-10-20T00:00:00.000Z" })
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts?later=1")
    await p.waitForSelector("[data-id-photo]", { timeout: 6000 })
    await new Promise((r) => setTimeout(r, 400))
    const view = await p.evaluate(() => ({
      title: document.body.textContent?.includes("Stripe needs a little more"),
      reason: !!document.querySelector("[data-setup-problems]"),
      camera: !!document.querySelector("[data-identity-open]") || !!document.querySelector("[data-id-camera-open]"),
      onlyThat: !document.querySelector('[autocomplete="bday-day"]'),
      input: document.body.innerHTML.includes("image/jpeg") ? "image/jpeg" : "",
    }))
    expect(view.title, "it says Stripe needs a little more, not setup from the start")
    expect(view.reason, "with Stripe's reason in plain words")
    expect(view.camera && view.onlyThat, "and asks only for the photo, with the live camera", view)
    expect(/image/.test(view.input), "a photo from the library is the other way", view.input)
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.screenshot({ path: join(out, "later-390.png") })
    await p.close()
  }
  {
    /* Verify with nothing left to ask sends itself on; Back from the bank must not be sent forward again. */
    console.log("\nOnly the bank left to give (390px)")
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    const nothing = { fields: [], tos: false, bank: true, name: false, other: [], checking: false, registeredAddress: false, problems: [], either: [], offered: [], given: [] }
    p.on("request", (r) => {
      const u = r.url()
      const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/api/payments/")) {
        const action = u.slice("http://probe.test/api/payments/".length)
        if (action === "details-form") return json(form(nothing))
        return json({})
      }
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.bringToFront()
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts")
    /* Stripe wants only the bank: personal info and the ID hand straight on, and the bank step asks. */
    await p.waitForSelector("[data-bank-step]", { timeout: 8000 }).catch(() => {})
    const arrived = await p.evaluate(() => {
      const t = document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""
      return {
        bank: !!document.querySelector("[data-bank-step]"),
        change: /Change bank account/.test(t),
        steps: [...document.querySelectorAll('[aria-label="Setup steps"] li:not([aria-hidden])')].map((li) => li.textContent?.trim()),
        currencies: [...document.querySelectorAll("[data-payout-currency]")].map((b) => b.getAttribute("data-payout-currency")),
      }
    })
    expect(arrived.bank, "the bank is its own step, the last one", arrived)
    expect(!arrived.change, "and a first bank is never worded as a change", arrived)
    expect(arrived.steps.length === 2 && /Personal info/.test(arrived.steps[0] ?? "") && /Bank account/.test(arrived.steps[1] ?? ""), "no ID asked, so the steps are Personal info, Bank account", arrived.steps)
    expect(JSON.stringify(arrived.currencies) === JSON.stringify(["RON", "EUR", "USD"]), "the payout currency is picked first: local, euro or US dollar", arrived.currencies)
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Back")?.click())
    await new Promise((r) => setTimeout(r, 900))
    const back = await p.evaluate(() => {
      const t = document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""
      return { onAccount: !!document.querySelector('[autocomplete="given-name"]'), bouncedBack: !!document.querySelector("[data-details-bank]") }
    })
    expect(back.onAccount && !back.bouncedBack, "Back goes to Account, never bounced forward again", back)
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.screenshot({ path: join(out, "back-past-verify-390.png") })
    await p.close()
  }
  {
    /* The Account step: where, and how they sell. Individual is already picked and nothing about a company shows. */
    console.log("\nThe Account step (390px)")
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/api/payments/")) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.bringToFront()
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts?fresh=1")
    await p.waitForSelector('[autocomplete="given-name"]', { timeout: 8000 }).catch(() => {})
    const start = await p.evaluate(() => {
      const t = document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""
      return {
        where: /Where are you based\?/.test(t),
        name: !!document.querySelector('[autocomplete="given-name"]') && !!document.querySelector('[autocomplete="family-name"]'),
        noHow: !/How are you selling\?/.test(t) && !document.querySelector("[data-account-kind]"),
        noBusiness: !/Business|Legal business name/.test(t),
        noSupport: !/support@storelib\.com/.test(t),
        steps: [...document.querySelectorAll('[aria-label="Setup steps"] li:not([aria-hidden])')].map((li) => li.textContent?.trim()),
      }
    })
    /* Like Gumroad and Skool: who you are, nothing about a company, and no question that cannot be answered. */
    expect(start.where && start.name, "personal info: where they are based and their name", start)
    expect(start.noHow && start.noBusiness, "no 'How are you selling', no Business option", start)
    expect(start.noSupport, "and no 'contact support' anywhere", start)
    expect(/Personal info/.test(start.steps[0] ?? ""), "the stepper starts at Personal info", start.steps)
    await p.screenshot({ path: join(out, "account-step-390.png") })
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.close()
  }
  {
    /*
      Stripe takes the ID photo for the CNP (its alternative). What the server
      sends then: the document, and never the number. No CNP anywhere, no
      "type it instead" link: the owner wants the ID and nothing else.
    */
    console.log("\nThe ID stands in for the CNP (390px)")
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    const either = { ...needsNow, fields: ["dob", "address", "document"], either: [{ original: ["idNumber"], alternative: ["document"] }], offered: ["document"], given: [], handover: [] }
    const sentHere = {}
    p.on("request", (r) => {
      const u = r.url()
      const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/api/payments/")) {
        const action = u.slice("http://probe.test/api/payments/".length)
        if (action === "details") sentHere.details = r.postData()
        if (action === "identity") return json({ ok: false, reason: "not_enabled" })
        if (action === "details-form") return json(form(either))
        if (action === "details") return json({ form: form({ ...needsNow, fields: [], tos: false }), overview: { ...doneOverview, beat: "bank", paymentsStatus: { status: "BANK_REQUIRED", action: "bank" }, payoutDestination: null } })
        if (action === "bank") return json({ form: form({ ...needsNow, fields: [], tos: false, bank: false }), overview: doneOverview })
        return json({})
      }
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.bringToFront()
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts")
    /* The details come first, and never ask for the CNP: the ID step ahead settles it. */
    await p.waitForSelector('[autocomplete="bday-day"]', { timeout: 8000 })
    const onDetails = await p.evaluate(() => ({
      cnp: [...document.querySelectorAll("label")].some((l) => l.textContent?.includes("CNP")),
      noId: !document.querySelector("[data-id-photo]"),
      steps: [...document.querySelectorAll('[aria-label="Setup steps"] li:not([aria-hidden])')].map((li) => li.textContent?.trim()),
    }))
    expect(!onDetails.cnp, "the details page does not ask for the CNP where the ID stands in for it", onDetails)
    expect(onDetails.noId, "and does not draw the ID check either", onDetails)
    await pastDetails(p)

    await p.waitForSelector("[data-id-photo]", { timeout: 8000 }).catch(() => {})
    const idStep = await p.evaluate(() => ({
      photo: !!document.querySelector("[data-id-photo]"),
      link: !!document.querySelector("[data-id-number-instead]"),
      cnp: [...document.querySelectorAll("label")].some((l) => l.textContent?.includes("CNP")) || /CNP/.test(document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""),
      steps: [...document.querySelectorAll('[aria-label="Setup steps"] li:not([aria-hidden])')].map((li) => li.textContent?.trim()),
    }))
    expect(idStep.photo, "the ID step asks for the ID itself", idStep)
    expect(!idStep.link && !idStep.cnp, "and never offers or mentions the CNP", idStep)
    expect(idStep.steps.length === 3 && /Verify ID/.test(idStep.steps[1] ?? ""), "the steps are Personal info, Verify ID, Bank account", idStep.steps)
    await p.screenshot({ path: join(out, "id-for-cnp-390.png") })
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.close()
  }
  {
    /*
      Stripe asks for one of the rarer things (the last four of an SSN, a
      proof of address). Storelib draws it too. There is no second form and
      no handover: Stripe's own embedded form never loaded in the phone app,
      it hung and then took the creator out to js.stripe.com in a browser.
    */
    console.log("\nStripe asks for one of the rarer details (390px)")
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    const handed = { ...needsNow, fields: ["dob", "address", "ssnLast4"] }
    p.on("request", (r) => {
      const u = r.url()
      const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/api/payments/")) {
        const action = u.slice("http://probe.test/api/payments/".length)
        if (action === "details-form") return json(form(handed))
        return json({})
      }
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.bringToFront()
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts")
    await new Promise((r) => setTimeout(r, 1200))
    const drawn = await p.evaluate(() => {
      const t = document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""
      return {
        ownFields: !!document.querySelector('[autocomplete="bday-day"]'),
        ssnField: /Last 4 digits/.test(t),
        proofField: /Add your document/.test(t),
        noStripeForm: !/A few more details/.test(t),
        noStripeFrame: !document.querySelector("iframe"),
        stillInStorelib: !!document.querySelector("[data-payments-setup-panel]"),
      }
    })
    expect(drawn.ssnField, "Storelib's own form draws it, beside the rest", drawn)
    expect(!drawn.proofField, "and never a proof of address, a bill or a statement", drawn)
    expect(drawn.ownFields, "and the ordinary fields are still on the same step", drawn)
    expect(drawn.noStripeForm && drawn.noStripeFrame, "nothing is handed to a Stripe form, and no Stripe frame is loaded", drawn)
    expect(drawn.stillInStorelib, "still inside the Storelib page, with no browser sent anywhere", drawn)
    await p.screenshot({ path: join(out, "rarer-details-390.png") })
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.close()
  }
  {
    /*
      IN THE PHONE APP, THE ID CHECK STAYS IN THE APP. Nothing is opened:
      no browser sheet, no Stripe page, not even a session asked for. The
      camera that is already in the app does it.
    */
    console.log("\nThe ID check in the phone app (390px)")
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.evaluateOnNewDocument(() => {
      Object.defineProperty(window, "Capacitor", { value: { isNativePlatform: () => true, Plugins: {} }, configurable: true })
    })
    await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 StorelibApp Capacitor")
    await p.setRequestInterception(true)
    const asked = []
    const opened = []
    const idNeeds = { ...needsNow, fields: ["document"], tos: false, bank: false }
    p.on("request", (r) => {
      const u = r.url()
      const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/api/payments/")) {
        const action = u.slice("http://probe.test/api/payments/".length)
        asked.push(action)
        if (action === "details-form") return json({ ...form(idNeeds), active: true })
        if (action === "identity") return json({ ok: true, clientSecret: "vs_secret", url: "https://verify.stripe.com/start/abc", publishableKey: "pk_test_1" })
        return json({})
      }
      if (/stripe\.com/.test(u)) opened.push(u)
      if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
      r.abort()
    })
    p.on("popup", (t) => opened.push(`popup:${t.url()}`))
    await p.bringToFront()
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts")
    await p.waitForSelector("[data-id-photo]", { timeout: 8000 })
    /*
      The owner, October 2026: our own upload to Stripe hung on "Stripe is
      saving it" and timed out, over and over, so Stripe's own check does the
      ID now, in the app too. In the app it opens in the sheet over the app
      (Capacitor's browser, which this probe has no bridge for), so what is
      pinned here is that the app asks Stripe for the session and that
      nothing takes the page itself to Stripe.
    */
    const press = await p.evaluate(() => {
      const el = document.querySelector("[data-identity-open]")
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      return !!el
    })
    await new Promise((r) => setTimeout(r, 1500))
    const after = await p.evaluate(() => {
      const t = document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""
      return { panel: !!document.querySelector("[data-payments-setup-panel]"), here: location.host, waiting: /Waiting for Stripe/.test(t), other: !!document.querySelector("[data-id-use-camera]") }
    })
    expect(press, "Verify with Stripe is the way in, in the app too")
    expect(asked.includes("identity"), "the app asks the server for Stripe's own check", asked)
    expect(after.panel && after.here === "probe.test", "and the setup page itself never leaves for Stripe", after)
    expect(after.waiting, "the step waits for Stripe, and says so", after)
    expect(!after.other, "  and Storelib's camera is not offered at all: Stripe's check is the only way", after)
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.screenshot({ path: join(out, "native-id-390.png") })
    await p.close()
  }
  {
    /*
      "Checking your ID" waits with the creator instead of sending them away
      with a number of days: it asks again, and becomes Payments active by
      itself the moment Stripe is satisfied.
    */
    console.log("\nThe checking screen resolves itself (390px)")
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    let refreshes = 0
    const nothingLeft = { ...needsNow, fields: [], tos: false, bank: false }
    p.on("request", (r) => {
      const u = r.url()
      const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/api/payments/")) {
        const action = u.slice("http://probe.test/api/payments/".length)
        if (action === "details-form") return json(form(nothingLeft))
        if (action === "refresh") {
          refreshes += 1
          /* Stripe is still looking the first time, and satisfied by the next. */
          return json(
            refreshes < 2
              ? { ...doneOverview, beat: "review", paymentsStatus: { status: "VERIFYING", title: "", line: "", action: null } }
              : doneOverview,
          )
        }
        return json({})
      }
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.bringToFront()
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts?checking=1")
    /* No ID went in on this run (Stripe already had everything): it is the details being checked, never "your ID". */
    await p.waitForFunction(() => /Checking your/.test(document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""), { timeout: 8000 })
    const waiting = await p.evaluate(() => document.querySelector("[data-payments-setup-panel]")?.textContent ?? "")
    expect(/Checking your details/.test(waiting) && !/Checking your ID/.test(waiting), "it never says 'Checking your ID' when no ID was taken", waiting.slice(0, 80))
    expect(!/business days|two days/i.test(waiting), "it never promises days", waiting.slice(0, 160))
    await p.screenshot({ path: join(out, "checking-390.png") })
    await p.waitForFunction(() => /Payments active/.test(document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""), { timeout: 15000 }).catch(() => {})
    expect(
      await p.evaluate(() => /Payments active/.test(document.querySelector("[data-payments-setup-panel]")?.textContent ?? "")),
      "and becomes Payments active by itself once Stripe is satisfied",
    )
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.close()
  }
  {
    /* The country sheet, opened from inside the setup panel: it must rise once and stop. */
    console.log("\nThe country sheet rises smoothly (390px)")
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: readFileSync(join(stubs, "country.html"), "utf8") })
      if (u.startsWith("http://probe.test/flags/")) return r.respond({ status: 404, body: "" })
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.bringToFront()
    /* Headless says it prefers less motion, and every animation here honours that: ask for the real one. */
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await p.goto("http://probe.test/app/payouts")
    await p.waitForSelector("[data-choice-field=country]", { timeout: 6000 })
    await new Promise((r) => setTimeout(r, 300))
    const track = await p.evaluate(async () => {
      const field = document.querySelector("[data-choice-field=country]")
      field.click()
      const tops = []
      await new Promise((done) => {
        let frames = 0
        const step = () => {
          const panel = document.querySelector("[data-sheet-panel]") ?? document.querySelector("[data-sheet-root] [role=dialog]")
          if (panel) tops.push(Math.round(panel.getBoundingClientRect().top))
          if (++frames > 70) return done(null)
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
      return tops
    })
    const seen = track.filter((t) => Number.isFinite(t))
    const rest = seen.length ? seen[seen.length - 1] : null
    /* Rising means the top goes DOWN to its rest; an overshoot dips below rest and comes back up. */
    const below = seen.filter((t) => t < rest - 2).length
    const settled = seen.slice(-8).every((t) => Math.abs(t - rest) <= 1)
    expect(seen.length > 5, "the sheet was caught while it opened", seen.length)
    expect(below === 0, "it never rises past where it lands, then drops back", { overshootFrames: below, rest, highest: Math.min(...seen) })
    expect(settled, "and it is still at the end", seen.slice(-8))
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.screenshot({ path: join(out, "country-sheet-390.png") })
    await p.close()
  }
  {
    /* Stripe's own live check: the way in, and what happens when Stripe has none. */
    console.log("\nStripe's live ID check (390px)")
    for (const enabled of [true, false]) {
      const p = await browser.newPage()
      const errors = []
      const calls = []
      p.on("pageerror", (e) => errors.push(e.message))
      await p.setRequestInterception(true)
      const needs = { ...needsNow, fields: ["document"], tos: false, bank: false }
      let status = "requires_input"
      p.on("request", (r) => {
        const u = r.url()
        const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
        if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
        if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
        if (u.startsWith("http://probe.test/api/payments/")) {
          const action = u.slice("http://probe.test/api/payments/".length)
          calls.push(action)
          if (action === "details-form") return json({ ...form(needs), active: true })
          if (action === "identity") return json(enabled ? { ok: true, way: "identity", clientSecret: null, url: "http://probe.test/stripe-identity", publishableKey: "pk_test_x" } : { ok: false, reason: "link_failed" })
          if (action === "identity-status") {
            const was = status
            status = "verified"
            return json({ status: was === "requires_input" ? "processing" : "verified", problem: null, form: { ...form({ ...needs, fields: [] }), active: true } })
          }
          return json({})
        }
        if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
        r.abort()
      })
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
      await p.bringToFront()
      await p.goto("http://probe.test/app/payouts?later=1")
      await p.waitForSelector("[data-id-photo]", { timeout: 6000 })
      await new Promise((r) => setTimeout(r, 300))
      const shown = await p.evaluate(() => ({
        stripeFirst: document.querySelector("[data-id-photo]")?.getAttribute("data-id-photo") === "stripe",
        says: document.body.textContent?.includes("brings you straight back here"),
        other: document.body.textContent?.includes("Use your camera instead"),
      }))
      if (enabled) {
        expect(shown.stripeFirst && shown.says, "Stripe's live check is the way in, and says what it does", shown)
        expect(!shown.other, "and Storelib's camera is nowhere on the step", shown)
        await p.screenshot({ path: join(out, "identity-390.png") })
        /* Opening it on the web asks the server, then watches for Stripe's answer. */
        await p.evaluate(() => { window.open = () => null })
        await p.click("[data-identity-open]")
        await new Promise((r) => setTimeout(r, 400))
        /* Back from Stripe: the page regains focus, which is what asks Stripe how it went. */
        await p.evaluate(() => window.dispatchEvent(new Event("focus")))
        await p.waitForFunction(() => /Stripe is checking it|Verified by Stripe/.test(document.querySelector("[data-id-photo]")?.textContent ?? ""), { timeout: 6000 }).catch(() => {})
        const after = await p.evaluate(() => ({ done: !!document.querySelector('[data-identity="done"]'), text: document.querySelector('[data-identity="done"]')?.textContent ?? "" }))
        expect(calls.includes("identity"), "the press asks the server for a session, not the browser for a key")
        expect(after.done && /Stripe/.test(after.text), "and when Stripe answers, the ID step is satisfied", after)
        await p.screenshot({ path: join(out, "identity-done-390.png") })
      } else {
        expect(shown.stripeFirst, "it offers Stripe's check before knowing whether there is one")
        await p.click("[data-identity-open]")
        await new Promise((r) => setTimeout(r, 700))
        /*
          The owner, October 2026: "I used verify with Stripe instead, it
          opened the same camera model". It used to fall through to our
          camera without a word, which looked exactly like that. And when
          Stripe refused, Stripe's own sentence was printed here. Neither
          now: nothing of ours opens, and the line is Storelib's.
        */
        const fell = await p.evaluate(() => ({
          camera: !!document.querySelector("[data-id-camera]"),
          why: document.querySelector("[data-identity-problem]")?.textContent ?? "",
          noCode: !/link_failed|not_enabled|undefined|Identity|account admin|went wrong/i.test(document.querySelector("[data-payments-setup-panel]")?.textContent ?? ""),
        }))
        expect(!fell.camera, "when the check will not open, nothing of ours opens", fell)
        expect(/Try again in a moment/.test(fell.why) && fell.noCode, "  one calm sentence, with no Stripe code or Stripe words in it", fell)
      }
      expect(errors.length === 0, `nothing threw (${enabled ? "Stripe on" : "Stripe off"})`, errors.slice(0, 2))
      await p.close()
    }
  }
  for (const width of [390, 1280]) {
    const later = false
    const phone = width < 640
    console.log(`\nAt ${width}px`)
    const p = await browser.newPage()
    const errors = []
    const sent = {}
    const framed = []
    let detailsIn = false
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
        /* As Stripe would: once the details are in, only the bank is left. */
        if (action === "details-form") return json(form(detailsIn ? { ...needsNow, fields: [], tos: false } : needsNow))
        if (action === "details") {
          detailsIn = true
          return json({ form: form({ ...needsNow, fields: [], tos: false }), overview: { ...doneOverview, beat: "bank", paymentsStatus: { status: "BANK_REQUIRED", action: "bank" }, payoutDestination: null } })
        }
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
        noNumberAsked: !document.body.textContent?.includes("CNP (personal numeric code)"),
        agreement: !!document.querySelector('a[href="https://stripe.com/legal/connect-account"]'),
        noPhoto: !document.querySelector("[data-upload-tile]"),
        smallText: [...document.querySelectorAll("[data-payments-setup-panel] input, [data-payments-setup-panel] select")].filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length,
      }
    })
    expect(!shape.sideways, "no sideways scroll", shape.sideways)
    expect(shape.iframes === 0, "nothing from Stripe is framed in", shape.iframes)
    expect(shape.fields, "date of birth and address are asked")
    expect(shape.noNumberAsked, "no national ID number is asked for: the live check is the verification")
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
    await p.evaluate(() => [...document.querySelectorAll('input[type="checkbox"]')].forEach((c) => c.click()))
    expect(await p.evaluate(() => !document.querySelector('[placeholder^="RO00"]')), "personal info is only personal info: no bank on it")
    await p.click('button[type="submit"]')
    /* Like Skool: personal info, then (no ID asked here) the bank, its own last step. */
    await p.waitForSelector("[data-bank-step]", { timeout: 6000 }).catch(() => {})
    const bankStep = await p.evaluate(() => ({
      here: !!document.querySelector("[data-bank-step]") && !!document.body.textContent?.includes("IBAN"),
      steps: [...document.querySelectorAll('[aria-label="Setup steps"] li:not([aria-hidden])')].map((li) => li.textContent?.trim()),
      currencies: [...document.querySelectorAll("[data-payout-currency]")].map((b) => b.getAttribute("data-payout-currency")),
      local: document.querySelector('[data-payout-currency="RON"]')?.getAttribute("aria-checked"),
    }))
    expect(bankStep.here, "the bank, with an IBAN for Romania, is the next step", bankStep)
    expect(/Bank account/.test(bankStep.steps.at(-1) ?? ""), "  and the stepper says Bank account", bankStep.steps)
    expect(JSON.stringify(bankStep.currencies) === JSON.stringify(["RON", "EUR", "USD"]) && bankStep.local === "true", "  payout currency first: local picked, euro and US dollar there", bankStep)
    await p.click('[data-payout-currency="EUR"]')
    await p.type('[placeholder^="RO00"]', "RO49AAAA1B31007593840001")
    await p.screenshot({ path: join(out, `details-filled-${width}.png`) })
    await p.click('button[type="submit"]')
    await new Promise((r) => setTimeout(r, 200))
    expect(!("bank" in sent), "an IBAN with a wrong digit is caught on the page, before anything is sent")
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
    const body = sent.details ? JSON.parse(sent.details) : null
    expect(
      !!body && body.dob?.year === 1994 && body.dob?.month === 3 && body.address?.city === "Bucharest" && body.acceptTos === true && body.idNumber === undefined,
      "the details went as entered, and no national ID number with them",
      body && { dob: body.dob, city: body.address?.city, tos: body.acceptTos, idNumber: body.idNumber ?? null },
    )
    expect(sent.bank && JSON.parse(sent.bank).iban === "RO49 AAAA 1B31 0075 9384 0000", "the valid IBAN is sent")
    expect(sent.bank && JSON.parse(sent.bank).currency === "EUR", "  in the currency picked", sent.bank && JSON.parse(sent.bank).currency)
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
