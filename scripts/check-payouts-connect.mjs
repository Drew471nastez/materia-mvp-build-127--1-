/**
 * ===========================================================================
 *  PAYOUTS SETUP, MEASURED ON A PHONE (390) AND A COMPUTER (1440)
 * ===========================================================================
 * Nov 23 2026, a seller: "it just keeps saying try again". This draws the
 * real Payouts card and setup panel with /api/payments answered the way the
 * server answers now (tests/stripe-connect-onboarding holds the server), and
 * checks what a seller sees:
 *
 *   status    each state reads as a word and one next action, no overflow
 *   country   asked first, prefilled, and a country Stripe cannot pay out to
 *             is said before Continue (no account opened, no request sent)
 *   refusals  a refusal only Storelib can fix offers support, not Try again;
 *             Stripe not answering offers Try again
 *   resume    an account already started opens Stripe's form directly,
 *             never the country again
 *
 * Pictures go to .payouts-connect-probe/.
 *
 *   node scripts/check-payouts-connect.mjs
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

const stubs = mkdtempSync(join(tmpdir(), "storelib-connect-"))
writeFileSync(
  join(stubs, "navigation.js"),
  `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => "/app/payouts"
export const useSearchParams = () => new URLSearchParams(location.search)`,
)
const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-payouts-connect.tsx")],
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

const status = {
  NOT_STARTED: { status: "NOT_STARTED", title: "Set up payouts", line: "Get paid directly to your bank account.", actionLabel: "Set up payouts", action: "setup", deadline: null, upcoming: false, canCharge: false },
  INCOMPLETE: { status: "INCOMPLETE", title: "Finish setting up payments", line: "Pick up where you left off.", actionLabel: "Continue setup", action: "onboarding", deadline: null, upcoming: false, canCharge: false },
  VERIFYING: { status: "VERIFYING", title: "Verification in progress", line: "We're checking your information. No action is needed right now.", actionLabel: null, action: null, deadline: null, upcoming: false, canCharge: false },
  RESTRICTED: { status: "RESTRICTED", title: "More information needed", line: "More information is needed to activate payments.", actionLabel: "Continue", action: "onboarding", deadline: null, upcoming: false, canCharge: false },
}
const beatOf = { NOT_STARTED: "personal", INCOMPLETE: "verification", VERIFYING: "review", RESTRICTED: "verification" }
const overview = (s, country) => ({
  provider: "stripe",
  environment: "sandbox",
  configured: true,
  tableMissing: false,
  stage: "set_up",
  copy: { title: "Storelib Payments", line: "", action: "Set up payments" },
  kind: "individual",
  requirements: [],
  checkoutOpen: false,
  balances: [],
  balancesAt: null,
  payoutDestination: null,
  payouts: [],
  can: { embeddedOnboarding: true, hostedOnboarding: false, embeddedPayoutForm: true, requestPayout: false },
  unavailable: [],
  stripe: { publishableKey: "pk_test_x" },
  badge: "off",
  uxState: "setup",
  beat: beatOf[s],
  paymentsStatus: status[s],
  statusLabel: s,
  prefill: { firstName: "Ada", lastName: "Lovelace", country },
  payoutHint: null,
  platformCountry: "RO",
})

const START = {
  ok: { status: 200, body: () => overview("INCOMPLETE", "DE") },
  platform_setup: { status: 503, body: () => ({ error: "Payouts to your country are not open on Storelib yet. Stripe has to approve this on our side, so there is nothing you need to change, and nothing was saved. Write to support@storelib.com and we will tell you when it opens.", code: "platform_setup" }) },
  retry: { status: 503, body: () => ({ error: "Stripe did not answer just now. Nothing was saved. Try again in a minute.", code: "retry" }) },
}

async function open(browser, { width, s = "NOT_STARTED", country = "DE", start = "ok" }) {
  const p = await browser.newPage()
  const errors = []
  const calls = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    const json = (body, status = 200) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) })
    if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
    if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("http://probe.test/api/payments/")) {
      const action = u.slice("http://probe.test/api/payments/".length)
      const body = r.postData() ? JSON.parse(r.postData()) : null
      calls.push({ action, body })
      if (action === "overview" || action === "refresh") return json(overview(s, country))
      if (action === "start") return json(START[start].body(), START[start].status)
      /* Stripe's frame is not loaded here: the form's session is answered as a refusal, which the form shows in words. */
      if (action === "component") return json({ error: "The payments form can't open right now because of a setting on our side. Nothing was changed. Write to support@storelib.com and we will tell you as soon as it works.", code: "platform_setup" }, 502)
      return json({})
    }
    if (u.startsWith("http://probe.test/api/client-errors")) return r.respond({ status: 204, body: "" })
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    r.abort()
  })
  await p.setViewport({ width, height: width < 640 ? 844 : 900, deviceScaleFactor: 1, isMobile: width < 640, hasTouch: width < 640 })
  await p.goto("http://probe.test/app/payouts")
  return { p, errors, calls }
}

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms))
const press = async (p, text) => {
  const done = await p.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a")].find((b) => b.textContent?.trim() === t && b.getBoundingClientRect().width > 0)
    if (!el) return false
    el.click()
    return true
  }, text)
  if (!done) throw new Error(`no button "${text}"`)
}
const measure = (p) =>
  p.evaluate(() => {
    const text = document.body.innerText
    const fits = document.documentElement.scrollWidth <= window.innerWidth
    const buttons = [...document.querySelectorAll("button, a")].filter((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().bottom > 0)
    const small = buttons.filter((b) => b.getBoundingClientRect().height < 40 && /Continue|Set up payouts|Try again|Email support|Continue setup/.test(b.textContent ?? "")).map((b) => `${b.textContent?.trim()} ${Math.round(b.getBoundingClientRect().height)}`)
    return { text, fits, small }
  })

const out = join(root, ".payouts-connect-probe")
mkdirSync(out, { recursive: true })
const WIRE = /acct_|accs_|invalid_request|resource_missing|capability|undefined|null\b/
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--unsafely-treat-insecure-origin-as-secure=http://probe.test"] })
try {
  for (const width of [390, 1440]) {
    const where = width < 640 ? "a phone" : "a computer"

    console.log(`\nThe status card, on ${where} (${width}px)`)
    for (const [s, word, action] of [["NOT_STARTED", "Setup required", "Set up payouts"], ["INCOMPLETE", "Setup incomplete", "Continue setup"], ["VERIFYING", "Under review", null], ["RESTRICTED", "Needs attention", "Continue"]]) {
      const { p, errors } = await open(browser, { width, s })
      await p.waitForSelector("[data-payments-hub]", { timeout: 8000 })
      await settle(300)
      const m = await measure(p)
      expect(m.text.includes(word), `${s}: the card says "${word}"`)
      expect(action ? m.text.includes(action) : !/Set up payouts|Continue setup/.test(m.text), `${s}: ${action ? `one next action, "${action}"` : "nothing to press while Stripe checks"}`)
      expect(m.fits && m.small.length === 0 && errors.length === 0, `${s}: fits the width, big enough to press, nothing threw`, { fits: m.fits, small: m.small, errors })
      await p.screenshot({ path: join(out, `card-${s.toLowerCase()}-${width}.png`) })
      await p.close()
    }

    console.log(`\nThe country comes first, on ${where}`)
    {
      const { p, errors, calls } = await open(browser, { width, country: "BR" })
      await p.waitForSelector("[data-payments-hub]", { timeout: 8000 })
      await press(p, "Set up payouts")
      await p.waitForSelector("[data-setup-country]", { timeout: 8000 })
      await settle()
      const m = await measure(p)
      const disabled = await p.evaluate(() => [...document.querySelectorAll("[data-setup-country] button[type=submit]")].every((b) => b.disabled))
      expect(m.text.includes("Where is your bank account?") && m.text.includes("Brazil"), "it asks where the bank account is, prefilled from the profile")
      expect(/can't send payouts from Storelib to a bank in Brazil/.test(m.text) && /choose that country/.test(m.text), "Brazil is said to be closed, with what to do, before Continue")
      expect(disabled && !calls.some((c) => c.action === "start"), "Continue is off and nothing was sent")
      expect(!/try again/i.test(m.text), "no Try again on a choice")
      expect(m.fits && errors.length === 0, "fits the width, nothing threw", { fits: m.fits, errors })
      await p.screenshot({ path: join(out, `country-closed-${width}.png`) })
      await p.close()
    }
    {
      const { p, calls } = await open(browser, { width, country: "DE", start: "ok" })
      await p.waitForSelector("[data-payments-hub]", { timeout: 8000 })
      await press(p, "Set up payouts")
      await p.waitForSelector("[data-setup-country]", { timeout: 8000 })
      await settle()
      const m = await measure(p)
      expect(m.small.length === 0, "Continue is a comfortable target", m.small)
      await p.screenshot({ path: join(out, `country-open-${width}.png`) })
      await press(p, "Continue")
      await p.waitForFunction(() => document.querySelector("[data-embedded-failed]"), { timeout: 8000 })
      const start = calls.find((c) => c.action === "start")
      expect(start?.body?.country === "DE", "Continue opens the account in the country chosen", start?.body)
      expect(calls.some((c) => c.action === "component"), "then Stripe's form is asked for")
      const shown = await p.evaluate(() => document.querySelector("[data-embedded-failed]")?.textContent ?? "")
      expect(/setting on our side/.test(shown) && !WIRE.test(shown), "a form that will not open says why in the server's words", shown)
      await p.close()
    }

    console.log(`\nA refusal says what to do, on ${where}`)
    for (const [start, wantRetry] of [["platform_setup", false], ["retry", true]]) {
      const { p, errors } = await open(browser, { width, country: "DE", start })
      await p.waitForSelector("[data-payments-hub]", { timeout: 8000 })
      await press(p, "Set up payouts")
      await p.waitForSelector("[data-setup-country]", { timeout: 8000 })
      await press(p, "Continue")
      await p.waitForSelector("[data-setup-problem]", { timeout: 8000 })
      await settle()
      const m = await measure(p)
      const retry = m.text.includes("Try again")
      const support = m.text.includes("Email support")
      expect(wantRetry ? retry && !support : support && !retry, `${start}: ${wantRetry ? "Try again, because trying again can work" : "Email support, never Try again"}`)
      expect(!WIRE.test(m.text) && m.fits && errors.length === 0, `${start}: no Stripe wire, fits, nothing threw`)
      await p.screenshot({ path: join(out, `problem-${start}-${width}.png`) })
      await p.close()
    }

    console.log(`\nResume, on ${where}`)
    {
      const { p, calls } = await open(browser, { width, s: "INCOMPLETE", country: "DE" })
      await p.waitForSelector("[data-payments-hub]", { timeout: 8000 })
      await press(p, "Continue setup")
      await p.waitForFunction(() => document.querySelector("[data-embedded-failed]") || document.querySelector("[data-setup-country]"), { timeout: 8000 })
      const country = await p.evaluate(() => !!document.querySelector("[data-setup-country]"))
      expect(!country && calls.some((c) => c.action === "component") && !calls.some((c) => c.action === "start"), "an account already started opens Stripe's form where it was left, without the country or a new account")
      await p.close()
    }
  }
} finally {
  await browser.close()
}
console.log(broken === 0 ? "\nAll measured." : `\n${broken} check(s) failed.`)
process.exit(broken === 0 ? 0 : 1)
