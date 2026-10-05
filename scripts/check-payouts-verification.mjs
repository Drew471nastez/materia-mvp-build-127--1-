/**
 * ===========================================================================
 *  SET UP PAYOUTS, ALL THREE STEPS, ON A PHONE AND ON A COMPUTER
 * ===========================================================================
 * Round 14. The owner's screenshot of step two read "Stripe would not start
 * the check: Your account is not set up to use Identity. Please have an
 * account admin visit to get started." This drives the real panel with
 * /api/payments answered the way the server answers it now, and looks at:
 *
 *   1  Personal info   the first step, country and name
 *   2  Verify ID       the button, and what pressing it does: Stripe's own
 *                      hosted verification for this connected account, which
 *                      the page goes to and which comes back to Payouts
 *   2b Verify ID       when the check will not open at all: one calm
 *                      Storelib sentence, no Stripe word, code or id
 *   2c Verify ID       an account Stripe has already cleared: the step is
 *                      walked past rather than shown
 *   3  Bank account    the last step
 *
 * Pictures go to .payouts-verification-probe/.
 *
 *   node scripts/check-payouts-verification.mjs
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

const stubs = mkdtempSync(join(tmpdir(), "storelib-verify-"))
writeFileSync(
  join(stubs, "navigation.js"),
  `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => "/app/payouts"
export const useSearchParams = () => new URLSearchParams(location.search)`,
)

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
const page = (body) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body>${body}</body></html>`
const html = page(`<div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script>`)
/* What Stripe's own hosted verification looks like from here: another origin, which this probe serves. */
const stripePage = page('<main style="padding:48px;font:16px Inter"><h1>Stripe</h1><p>Verify your identity</p></main>')

const baseNeeds = {
  fields: [],
  tos: false,
  bank: false,
  name: false,
  other: [],
  checking: false,
  registeredAddress: false,
  problems: [],
  either: [],
  offered: [],
  given: [],
  handover: [],
}
const form = (needs) => ({
  needs: { ...baseNeeds, ...needs },
  country: "RO",
  agreementUrl: "https://stripe.com/legal/connect-account",
  dueBy: null,
  active: false,
  idNumber: { label: "CNP (personal numeric code)", hint: "The 13 digit number on your Romanian ID card." },
  idSides: { front: false, back: false },
  bank: { kind: "iban", currency: "RON", holderName: "Andrei Balan", last4: null, currencies: ["RON", "EUR", "USD"] },
})

const STRIPE_HOSTED = "http://probe.test/stripe-hosted-verification"

/**
 * One page with the server stubbed. `identity` is what POST /api/payments/identity
 * answers; `needs` is what the details form still asks for.
 */
async function open(browser, { width, identity, needs, search = "" }) {
  const p = await browser.newPage()
  const errors = []
  const calls = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
    if (u.startsWith(STRIPE_HOSTED)) return r.respond({ status: 200, contentType: "text/html", body: stripePage })
    if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("http://probe.test/api/payments/")) {
      const action = u.slice("http://probe.test/api/payments/".length)
      calls.push(action)
      if (action === "details-form") return json(form(needs))
      if (action === "identity") return json(identity)
      if (action === "identity-status") return json({ status: "none", problem: null, form: form(needs) })
      if (action === "begin") return json({})
      return json({})
    }
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    r.abort()
  })
  await p.setViewport({ width, height: width < 640 ? 844 : 900, deviceScaleFactor: 1, isMobile: width < 640, hasTouch: width < 640 })
  await p.bringToFront()
  await p.goto(`http://probe.test/app/payouts${search}`)
  return { p, errors, calls }
}

/* Anything that should never be in front of a creator. */
const WIRE = /acct_|accs_|accl_|invalid_request|resource_missing|account_not_set_up|not_enabled|link_failed|undefined|account admin|Identity\b|would not start/

const out = join(root, ".payouts-verification-probe")
mkdirSync(out, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--unsafely-treat-insecure-origin-as-secure=http://probe.test"] })
try {
  for (const width of [390, 1440]) {
    const where = width < 640 ? "a phone" : "a computer"
    console.log(`\nStep 1, Personal info, on ${where} (${width}px)`)
    {
      const { p, errors } = await open(browser, { width, identity: {}, needs: {}, search: "?fresh=1" })
      await p.waitForSelector('[autocomplete="given-name"]', { timeout: 8000 })
      await new Promise((r) => setTimeout(r, 350))
      const seen = await p.evaluate(() => {
        const panel = document.querySelector("[data-payments-setup-panel]") ?? document.body
        return {
          steps: [...panel.querySelectorAll("*")].some((n) => n.textContent === "Personal info"),
          head: panel.textContent?.includes("Where are you based?"),
          text: panel.textContent ?? "",
          wide: document.documentElement.scrollWidth <= window.innerWidth,
        }
      })
      expect(seen.head, "it asks for the country and the name")
      expect(seen.steps, "the steps are named above it, with this one first")
      expect(!WIRE.test(seen.text), "nothing from Stripe's wire on the screen")
      expect(seen.wide, "nothing overflows sideways")
      expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
      await p.screenshot({ path: join(out, `personal-${width}.png`) })
      await p.close()
    }

    console.log(`\nStep 2, Verify ID, on ${where} (${width}px)`)
    {
      const { p, errors, calls } = await open(browser, {
        width,
        identity: { ok: true, way: "connect", url: STRIPE_HOSTED, clientSecret: null, publishableKey: "" },
        needs: { fields: ["document"] },
      })
      await p.waitForSelector("[data-identity-open]", { timeout: 8000 })
      await new Promise((r) => setTimeout(r, 350))
      const seen = await p.evaluate(() => {
        const panel = document.querySelector("[data-payments-setup-panel]") ?? document.body
        const button = document.querySelector("[data-identity-open]")
        const box = button?.getBoundingClientRect()
        return {
          title: panel.textContent?.includes("Verify your ID"),
          steps: [...panel.querySelectorAll("*")].some((n) => n.textContent === "Verify ID") && [...panel.querySelectorAll("*")].some((n) => n.textContent === "Bank account"),
          promise: panel.textContent?.includes("Storelib never sees or keeps the document"),
          says: panel.textContent?.includes("brings you straight back here"),
          tall: Math.round(box?.height ?? 0),
          problem: !!document.querySelector("[data-identity-problem]"),
          text: panel.textContent ?? "",
          wide: document.documentElement.scrollWidth <= window.innerWidth,
        }
      })
      expect(seen.title && seen.promise, "it says what Stripe does with the document, and what Storelib never sees")
      expect(seen.says, "and what pressing the button does")
      expect(seen.steps, "Verify ID is step two of three, with the bank still ahead")
      expect(!seen.problem, "no warning on a step nobody has pressed yet")
      expect(seen.tall >= 44, "the button is a comfortable target", seen.tall)
      expect(!WIRE.test(seen.text), "nothing from Stripe's wire on the screen")
      expect(seen.wide, "nothing overflows sideways")
      await p.screenshot({ path: join(out, `verify-${width}.png`) })

      /* Pressing it goes to Stripe's own hosted verification for this account. */
      await p.click("[data-identity-open]")
      await p.waitForFunction(() => location.pathname === "/stripe-hosted-verification", { timeout: 8000 }).catch(() => {})
      const went = await p.evaluate(() => location.href)
      expect(calls.includes("identity"), "the press asks our server which check this account gets")
      expect(went.startsWith(STRIPE_HOSTED), "and the page goes to Stripe's own verification", went)
      expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
      await p.close()
    }

    console.log(`\nStep 2 when the check will not open, on ${where} (${width}px)`)
    {
      const { p, errors } = await open(browser, { width, identity: { ok: false, reason: "link_failed" }, needs: { fields: ["document"] } })
      await p.waitForSelector("[data-identity-open]", { timeout: 8000 })
      await p.click("[data-identity-open]")
      await p.waitForSelector("[data-identity-problem]", { timeout: 8000 })
      await new Promise((r) => setTimeout(r, 250))
      const said = await p.evaluate(() => {
        const panel = document.querySelector("[data-payments-setup-panel]") ?? document.body
        return { why: document.querySelector("[data-identity-problem]")?.textContent ?? "", text: panel.textContent ?? "", here: location.pathname }
      })
      expect(said.why === "We could not open the ID check just now. Try again in a moment.", "one calm Storelib sentence with what to do next", said.why)
      expect(!WIRE.test(said.text), "with no Stripe word, code or id anywhere on the screen", said.why)
      expect(said.here === "/app/payouts", "and the page stays where it was")
      expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
      await p.screenshot({ path: join(out, `verify-refused-${width}.png`) })
      await p.close()
    }

    console.log(`\nAn account Stripe has cleared, and step 3, on ${where} (${width}px)`)
    {
      const { p, errors, calls } = await open(browser, { width, identity: {}, needs: { fields: ["document"], given: ["document"], bank: true } })
      await p.waitForSelector("[data-bank-step]", { timeout: 8000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 400))
      const seen = await p.evaluate(() => {
        const panel = document.querySelector("[data-payments-setup-panel]") ?? document.body
        return {
          bank: !!document.querySelector("[data-bank-step]"),
          stillAsking: !!document.querySelector("[data-identity-open]"),
          text: panel.textContent ?? "",
          wide: document.documentElement.scrollWidth <= window.innerWidth,
        }
      })
      expect(!seen.stillAsking, "the ID step is not shown to somebody Stripe has already cleared")
      expect(seen.bank, "it lands on the bank step instead", seen.text.slice(0, 120))
      expect(!calls.includes("identity"), "and nothing is asked of Stripe's ID check at all", calls)
      expect(!WIRE.test(seen.text), "nothing from Stripe's wire on the screen")
      expect(seen.wide, "nothing overflows sideways")
      expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
      await p.screenshot({ path: join(out, `bank-${width}.png`) })
      await p.close()
    }
  }
} finally {
  await browser.close()
}
console.log(broken === 0 ? "\nAll good.\n" : `\n${broken} problem(s).\n`)
process.exit(broken === 0 ? 0 : 1)
