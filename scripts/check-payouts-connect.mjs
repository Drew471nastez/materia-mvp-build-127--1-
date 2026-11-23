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
 *   romania   an account opened before the country step (in Romania, with
 *             nothing sent on it) asks the country first, never starts the
 *             field on Romania, and says a change starts setup again
 *   speed     the time from the press to Stripe's first frame, with Stripe
 *             stubbed at fixed delays (start 450ms, a form session 300ms,
 *             connect.js 350ms): the way it now loads, and the old line of
 *             waits (session, then script, then frame) for comparison
 *
 * Stripe's connect.js is a stub served for connect-js.stripe.com: it draws
 * one frame once the form's session arrives and reports its loader start,
 * the way Stripe's does. Nothing reaches Stripe.
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
/*
 * BEFORE, FOR THE TIMING ONLY. The three files that decide how the form
 * loads, as they are at HEAD (git show, read only), swapped in for a second
 * bundle: the old line of waits, measured on the same stub at the same delays.
 */
const SWAPPED = ["components/app/settings/storelib-payments-settings", "components/app/settings/payments-setup-flow", "components/app/settings/stripe-connect-embedded"]
const { execFileSync } = await import("node:child_process")
const beforeDir = join(stubs, "before")
mkdirSync(beforeDir, { recursive: true })
let haveBefore = true
for (const f of SWAPPED) {
  try {
    writeFileSync(join(beforeDir, `${f.split("/").pop()}.tsx`), execFileSync("git", ["show", `${process.env.PAYOUTS_BEFORE_REF || "HEAD"}:${f}.tsx`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }))
  } catch {
    haveBefore = false
  }
}
async function bundle(out, before) {
  const swap = {
    name: "before",
    setup(b) {
      b.onResolve({ filter: /^@\/components\/app\/settings\/(storelib-payments-settings|payments-setup-flow|stripe-connect-embedded)$/ }, (a) => ({ path: join(beforeDir, `${a.path.split("/").pop()}.tsx`) }))
    },
  }
  await build({
    entryPoints: [join(root, "scripts/render-payouts-connect.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", react: compiled("react"), "react-dom": compiled("react-dom"), "next/navigation": join(stubs, "navigation.js") },
    banner: { js: "var process={env:{NODE_ENV:'production'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, out),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: before ? [swap] : [],
  })
  return readFileSync(join(stubs, out), "utf8")
}
const css = await appCss(root)
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const page = (js) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const html = page(await bundle("app.js", false))
const htmlBefore = haveBefore ? page(await bundle("app-before.js", true)) : null

const status = {
  NOT_STARTED: { status: "NOT_STARTED", title: "Set up payouts", line: "Get paid directly to your bank account.", actionLabel: "Set up payouts", action: "setup", deadline: null, upcoming: false, canCharge: false },
  INCOMPLETE: { status: "INCOMPLETE", title: "Finish setting up payments", line: "Pick up where you left off.", actionLabel: "Continue setup", action: "onboarding", deadline: null, upcoming: false, canCharge: false },
  VERIFYING: { status: "VERIFYING", title: "Verification in progress", line: "We're checking your information. No action is needed right now.", actionLabel: null, action: null, deadline: null, upcoming: false, canCharge: false },
  RESTRICTED: { status: "RESTRICTED", title: "More information needed", line: "More information is needed to activate payments.", actionLabel: "Continue", action: "onboarding", deadline: null, upcoming: false, canCharge: false },
}
const beatOf = { NOT_STARTED: "personal", INCOMPLETE: "verification", VERIFYING: "review", RESTRICTED: "verification" }
/* Stripe at fixed delays, so the two ways of loading are compared on the same clock. */
const DELAY = { start: 450, component: 300, connectJs: 350 }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/*
 * connect.js, stubbed: StripeConnect.init and the account onboarding element.
 * The element draws its frame when the client secret arrives (connect-js asks
 * for it as soon as it is initialised), then reports its loader start.
 */
const CONNECT_STUB = `(() => {
  const make = (tag) => class extends HTMLElement {
    setConnector(c) {
      c.secret.then((secret) => {
        const f = document.createElement("iframe")
        f.setAttribute("data-stub-stripe", secret)
        f.style.height = "420px"
        f.style.border = "0"
        this.appendChild(f)
        setTimeout(() => this._loader && this._loader({ elementTagName: tag }), 0)
      }, (e) => setTimeout(() => this._error && this._error({ error: { type: "account_session_create_error", message: String(e) } }), 0))
    }
    setCollectionOptionsInternalOnly() {}
    setOnExitInternalOnly() {}
    setOnStepChangeInternalOnly() {}
    setOnLoaderStartInternalOnly(fn) { this._loader = fn }
    setOnLoadErrorInternalOnly(fn) { this._error = fn }
  }
  for (const n of ["account-onboarding", "account-management", "payouts"]) customElements.define("stripe-connect-" + n, make("stripe-connect-" + n))
  window.StripeConnect = window.StripeConnect || {}
  window.StripeConnect.init = (params) => {
    const secret = (params.metaOptions && params.metaOptions.eagerClientSecretPromise) || params.fetchClientSecret()
    secret.catch(() => {})
    return { connect: { secret }, update() {}, logout: async () => {} }
  }
})()`

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

/*
 * `component`: "refuse" answers the form's session with a refusal in words,
 * "ok" with a session. `old` serves the page built from HEAD's three setup
 * files (the timing's "before"). `setupCountry` is the account already there.
 */
async function open(browser, { width, s = "NOT_STARTED", country = "DE", start = "ok", component = "refuse", old = false, setupCountry = null, language = null }) {
  const p = await browser.newPage()
  const errors = []
  const calls = []
  p.on("pageerror", (e) => errors.push(e.message))
  if (language) await p.evaluateOnNewDocument((l) => Object.defineProperty(navigator, "language", { get: () => l }), language)
  /* When Stripe's first frame lands, on the page's own clock. */
  await p.evaluateOnNewDocument(() => {
    new MutationObserver(() => {
      if (window.__frameAt == null && document.querySelector("iframe[data-stub-stripe]")) window.__frameAt = performance.now()
      if (window.__skeletonSeen == null && document.querySelector("[data-stripe-skeleton]")) window.__skeletonSeen = true
    }).observe(document, { childList: true, subtree: true })
  })
  await p.setRequestInterception(true)
  const view = (st, c) => {
    const o = overview(st, c)
    if (setupCountry) o.setupCountry = setupCountry
    return o
  }
  p.on("request", async (r) => {
    const u = r.url()
    const json = (body, status = 200) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) })
    if (u === "https://connect-js.stripe.com/v1.0/connect.js") {
      calls.push({ action: "connect.js", body: null })
      await wait(DELAY.connectJs)
      return r.respond({ status: 200, contentType: "application/javascript", body: CONNECT_STUB })
    }
    if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
    if (u.startsWith("http://probe.test/app/payouts")) return r.respond({ status: 200, contentType: "text/html", body: old ? htmlBefore : html })
    if (u.startsWith("http://probe.test/api/payments/")) {
      const action = u.slice("http://probe.test/api/payments/".length)
      const body = r.postData() ? JSON.parse(r.postData()) : null
      calls.push({ action, body })
      if (action === "overview" || action === "refresh") return json(view(s, country))
      if (action === "start") {
        await wait(DELAY.start)
        const answer = START[start]
        const out = answer.body()
        if (answer.status === 200 && body?.session === true && component === "ok") out.session = { purpose: "stripe_onboarding", clientSecret: "accs_from_start", publishableKey: "pk_test_x", stripeSignIn: false, expiresAt: Math.floor(Date.now() / 1000) + 1800 }
        return json(out, answer.status)
      }
      if (action === "component") {
        await wait(DELAY.component)
        if (component === "ok") return json({ clientSecret: "accs_from_component", publishableKey: "pk_test_x", stripeSignIn: false, expiresAt: Math.floor(Date.now() / 1000) + 1800 })
        /* The form's session refused, which the form shows in words. */
        return json({ error: "The payments form can't open right now because of a setting on our side. Nothing was changed. Write to support@storelib.com and we will tell you as soon as it works.", code: "platform_setup" }, 502)
      }
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

    console.log(`\nAn account opened in Romania before the country step, on ${where}`)
    {
      const { p, calls, errors } = await open(browser, { width, s: "INCOMPLETE", country: null, language: "de-DE", component: "ok", setupCountry: { country: "RO", changeable: true, chosen: false } })
      await p.waitForSelector("[data-payments-hub]", { timeout: 8000 })
      await press(p, "Continue setup")
      await p.waitForSelector("[data-setup-country]", { timeout: 8000 })
      await settle()
      const field = await p.evaluate(() => document.querySelector("#payout-country")?.textContent ?? "")
      const m = await measure(p)
      expect(!calls.some((c) => c.action === "component"), "Stripe's form is not asked for before the country", calls.map((c) => c.action))
      expect(/Germany/.test(field) && !/Romania/.test(field), "the field starts on the browser's country, not on Romania", field)
      expect(/Your setup was started for Romania\. Continuing with Germany starts it again there\./.test(m.text), "it says the change starts setup again, before Continue")
      expect(m.fits && errors.length === 0, "fits the width, nothing threw", { fits: m.fits, errors })
      await p.screenshot({ path: join(out, `country-romania-${width}.png`) })
      await press(p, "Continue")
      await p.waitForSelector("iframe[data-stub-stripe]", { timeout: 8000 })
      const start = calls.find((c) => c.action === "start")
      expect(start?.body?.country === "DE" && start?.body?.session === true, "Continue opens the account in Germany, with the form's session in the same request", start?.body)
      expect(!calls.some((c) => c.action === "component"), "  and Stripe's frame needs no request of its own after it")
      await p.close()
    }
    {
      const { p, calls } = await open(browser, { width, s: "INCOMPLETE", country: "DE", component: "ok", setupCountry: { country: "DE", changeable: true, chosen: true } })
      await p.waitForSelector("[data-payments-hub]", { timeout: 8000 })
      await press(p, "Continue setup")
      await p.waitForSelector("[data-setup-country]", { timeout: 8000 })
      const field = await p.evaluate(() => document.querySelector("#payout-country")?.textContent ?? "")
      expect(/Germany/.test(field), "an account the seller chose the country of starts on that country", field)
      await settle(500)
      expect(calls.some((c) => c.action === "component"), "  and its form's session is made while the question is on screen")
      await press(p, "Continue")
      await p.waitForSelector("iframe[data-stub-stripe]", { timeout: 8000 })
      expect(!calls.some((c) => c.action === "start"), "  Continue on the same country opens the form without a new account")
      await p.close()
    }

    console.log(`\nTime to Stripe's first frame, on ${where} (start ${DELAY.start}ms, session ${DELAY.component}ms, connect.js ${DELAY.connectJs}ms)`)
    const firstFrame = async ({ old, resume }) => {
      const { p, calls, errors } = await open(browser, { width, s: resume ? "INCOMPLETE" : "NOT_STARTED", country: "DE", component: "ok", old })
      await p.waitForSelector("[data-payments-hub]", { timeout: 8000 })
      const label = resume ? "Continue setup" : "Set up payouts"
      const button = async (t) => (await p.evaluateHandle((x) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === x && b.getBoundingClientRect().width > 0), t)).asElement()
      /* On a computer the pointer rests on the button a moment before the press, as a person's does. A phone has no hover: the press is the first sign. */
      if (width >= 640) {
        await (await button(label))?.hover()
        await settle(250)
      }
      if (!resume) {
        await (await button(label))?.click()
        await p.waitForSelector("[data-setup-country]", { timeout: 8000 })
        /* Reading the question takes a moment too. */
        await settle(400)
      }
      const target = await button(resume ? label : "Continue")
      const t0 = await p.evaluate(() => performance.now())
      /* A real press (pointer down, then up), so whatever listens for intent hears it. */
      await target.click()
      await p.waitForSelector("iframe[data-stub-stripe]", { timeout: 10000 })
      await settle(50)
      const r = await p.evaluate((t) => ({ ms: Math.round(window.__frameAt - t), skeleton: !!window.__skeletonSeen }), t0)
      const scripts = calls.filter((c) => c.action === "connect.js").length
      await p.close()
      return { ...r, scripts, errors }
    }
    for (const resume of [false, true]) {
      const what = resume ? "resume (Continue setup)" : "new seller (Continue on the country)"
      const now = await firstFrame({ old: false, resume })
      const before = htmlBefore ? await firstFrame({ old: true, resume }) : null
      console.log(`  ${what}: ${before ? `before ${before.ms}ms, ` : ""}now ${now.ms}ms`)
      /*
       * The floor nothing on the page can beat: a new seller waits for start
       * (the account is made there, and the session with it). A resume on a
       * computer has had the hover to get going, so nothing; on a phone the
       * press is the first sign, so the slower of the session and the script,
       * which now run side by side instead of one after the other.
       */
      const floor = resume ? (width < 640 ? Math.max(DELAY.component, DELAY.connectJs) : 0) : DELAY.start
      if (before) expect(now.ms < before.ms * 0.75, `${what}: Stripe's first frame comes well before the old way's`, { before: before.ms, now: now.ms })
      expect(now.ms - floor < 200, `${what}: within 200ms of the floor (${floor}ms)`, { now: now.ms, floor })
      expect(now.skeleton || now.ms < 250, `${what}: the gray outline of the form shows while it loads`)
      expect(now.errors.length === 0, `${what}: nothing threw`, now.errors)
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
