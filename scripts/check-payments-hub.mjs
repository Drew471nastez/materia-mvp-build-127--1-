/**
 * ===========================================================================
 *  THE PAYMENTS HUB, MEASURED
 * ===========================================================================
 * components/app/settings/payments-hub.tsx for a creator on Storelib
 * Payments (Airwallex), in each state the server can answer, at a phone's
 * width and a computer's. /api/payments is answered by the page
 * (scripts/render-payments-hub.tsx), so this is the hub itself, not a server.
 *
 * For each state: the title is the one lib/payments/model gives it, the one
 * thing to press is there (and nothing else primary is), no raw provider
 * word reaches the screen, and nothing is wider than the phone. Pictures of
 * every state are written to .payments-probe/ for the eye.
 *
 *   node scripts/check-payments-hub.mjs
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

const stubs = mkdtempSync(join(tmpdir(), "storelib-payments-hub-"))
writeFileSync(join(stubs, "navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)`)

const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-payments-hub.tsx")],
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
const page = (state) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>window.__state=${JSON.stringify(state)}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const out = join(root, ".payments-probe")
mkdirSync(out, { recursive: true })

const STATES = [
  { state: "set_up", title: "Set up payments", press: "Set up payments" },
  { state: "verify", title: "Verify your details", press: "Continue" },
  { state: "review", title: "Payments under review", press: null },
  { state: "action", title: "Action required", press: "Resolve" },
  { state: "payout", title: "Add payout account", press: "Add payout account" },
  { state: "active", title: "Payments active", press: null },
  { state: "paused", title: "Payments paused", press: null },
  { state: "off", title: "Payments are not switched on yet", press: null },
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const width of [390, 1280]) {
    console.log(`\nAt ${width}px`)
    for (const s of STATES) {
      const p = await browser.newPage()
      const errors = []
      p.on("pageerror", (e) => errors.push(e.message))
      await p.setRequestInterception(true)
      p.on("request", (r) => {
        const u = r.url()
        if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
        if (u === "http://probe.test/app/settings") return r.respond({ status: 200, contentType: "text/html", body: page(s.state) })
        if (u.startsWith("data:")) return r.continue()
        if (u.startsWith("http://probe.test/flags/")) return r.respond({ status: 404, body: "" })
        r.abort()
      })
      await p.setViewport({ width, height: 900, deviceScaleFactor: 1, isMobile: width < 640, hasTouch: width < 640 })
      await p.goto("http://probe.test/app/settings")
      await p.waitForFunction(() => !!document.querySelector("[data-payments-hub], h3"), { timeout: 5000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 250))
      const got = await p.evaluate(() => {
        const hub = document.querySelector("[data-payments-hub]")
        const title = document.querySelector("#payments-status")?.textContent?.trim() ?? document.querySelector("h3")?.textContent?.trim() ?? null
        const primaries = [...document.querySelectorAll("button")].filter((b) => /bg-\[#8b5cf6\]/.test(b.className) && b.getBoundingClientRect().height > 0).map((b) => b.textContent?.trim())
        const text = document.body.innerText
        const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5).map((el) => el.tagName + "." + String(el.className).slice(0, 30)).slice(0, 3)
        return { stage: hub?.getAttribute("data-stage") ?? null, title, primaries, text, wide, scrollW: document.documentElement.scrollWidth }
      })
      expect(got.title === s.title, `${s.state}: says "${s.title}"`, got.title)
      expect(s.press ? got.primaries.length === 1 && got.primaries[0] === s.press : got.primaries.length === 0, `${s.state}: ${s.press ? `one thing to press, "${s.press}"` : "nothing to press"}`, got.primaries)
      /* Airwallex's own statuses are upper case; "Payments active" is Storelib's word and fine. */
      expect(!/\b(ACTION_REQUIRED|SUBMITTED|ACTIVE|SUSPENDED|DORMANT|CLOSED)\b/.test(got.text) && !/acct_|int_|kycStatus|beneficiary/i.test(got.text), `${s.state}: no provider word on screen`)
      expect(got.scrollW <= width && got.wide.length === 0, `${s.state}: nothing wider than the screen`, got.wide)
      expect(errors.length === 0, `${s.state}: nothing threw`, errors.slice(0, 1))
      if (s.state === "active") {
        expect(/\$1,284\.50/.test(got.text) && /\$42\.00 on the way/.test(got.text), "active: the balance as Airwallex reported it, available and on the way", got.text.match(/\$[\d,.]+/g))
        expect(/Chase •••• 4821/.test(got.text) && !/\d{5,}/.test(got.text.replace(/\$[\d,.]+/g, "")), "active: the payout account by its last four only")
        expect(/Checkout is on\./.test(got.text), "active: checkout says it is on")
      }
      if (s.state === "set_up") {
        expect(/An individual/.test(got.text) && /A business/.test(got.text) && /Airwallex terms/.test(got.text), "set up: who is selling, where, and the terms")
        expect(/Checkout is off until setup is finished\./.test(got.text), "set up: checkout says it is off")
      }
      if (s.state === "action") expect(/document has expired/.test(got.text) && /selfie/.test(got.text), "action: exactly what is needed")
      await p.screenshot({ path: join(out, `${s.state}-${width}.png`), fullPage: true })
      await p.close()
    }
  }
} finally {
  await browser.close()
}

console.log(`\n  pictures in .payments-probe/`)
if (broken) {
  console.error(`\n${broken} check(s) failed.\n`)
  process.exit(1)
}
console.log("\nEvery state says where it is and the one thing to do.\n")
