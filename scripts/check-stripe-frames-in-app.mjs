/**
 * ===========================================================================
 *  STRIPE'S FRAMES CANNOT TAKE THE APP OUT OF STORELIB (round 18)
 * ===========================================================================
 * lib/payments/stripe-frames-in-app.ts, in headless Chromium, with stand in
 * Stripe pages (connect-js.stripe.com answered by the probe, nothing on the
 * network). A frame is given its address the three ways a script can (the
 * src property, setAttribute, markup), and each stand in tries what took the
 * app to Safari: window.open, a link with target _blank, and moving the page
 * it is in. Checked:
 *
 *   SEALED     every Stripe frame carries the sandbox before it loads
 *   RUNS       its script runs, with its own origin and storage
 *   NO WINDOW  window.open comes back empty and no second page is made
 *   STAYS      the page hosting it is still Storelib's
 *   OTHERS     a frame from anywhere else is left as it is
 *
 * With the app's own Stripe guard installed first, as in the app
 * (WITH_NAV_GUARD=0 to leave it out).
 *
 *   node scripts/check-stripe-frames-in-app.mjs
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const out = mkdtempSync(join(tmpdir(), "stripe-frames-"))
try {
  const { build } = await import("esbuild")
  await build({ stdin: { contents: (process.env.WITH_NAV_GUARD === "0" ? "" : 'import "./lib/stripe-nav-guard"; ') + 'import { keepStripeFramesInApp } from "./lib/payments/stripe-frames-in-app"; window.__keep = keepStripeFramesInApp', resolveDir: root, loader: "ts" }, bundle: true, format: "iife", outfile: join(out, "keep.js"), logLevel: "error" })
  const keep = readFileSync(join(out, "keep.js"), "utf8")

  /* A stand in for Stripe's frame: tries every way out, then tells the page what happened. */
  const STRIPE = `<!doctype html><script>
    let storage = false; try { localStorage.setItem("k", "1"); storage = localStorage.getItem("k") === "1" } catch (e) {}
    let opened = null; try { opened = window.open("https://connect.stripe.com/popup", "_blank") !== null } catch (e) { opened = false }
    const a = document.createElement("a"); a.href = "https://stripe.com/legal"; a.target = "_blank"; document.documentElement.appendChild(a); a.click()
    parent.postMessage({ from: location.search.slice(1), ran: true, origin: location.origin, storage, opened }, "*")
    setTimeout(() => { try { top.location.href = "https://connect.stripe.com/away" } catch (e) {} }, 50)
  </script>`
  const PAGE = `<!doctype html><html><body><script>${keep}</script><script>
    window.__msgs = []; addEventListener("message", (e) => window.__msgs.push(e.data))
    window.__keep()
    const a = document.createElement("iframe"); a.id = "prop"; document.body.appendChild(a); a.src = "https://connect-js.stripe.com/frame?prop"
    const b = document.createElement("iframe"); b.id = "attr"; b.setAttribute("src", "https://connect-js.stripe.com/frame?attr"); document.body.appendChild(b)
    document.body.insertAdjacentHTML("beforeend", '<iframe id="markup" src="https://connect-js.stripe.com/frame?markup"></iframe>')
    const c = document.createElement("iframe"); c.id = "other"; c.src = "https://www.youtube-nocookie.com/embed/x"; document.body.appendChild(c)
  </script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const p = await browser.newPage()
  /* As the app's web view says it is, so the app's own Stripe guard (lib/stripe-nav-guard.ts) is installed first, as it is there. */
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor")
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  const asked = []
  p.on("request", (r) => {
    const url = r.url()
    asked.push(url)
    if (url.startsWith("https://storelib.com/")) return void r.respond({ status: 200, contentType: "text/html", body: PAGE })
    if (url.startsWith("https://connect-js.stripe.com/frame")) return void r.respond({ status: 200, contentType: "text/html", body: STRIPE })
    return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><p>elsewhere</p>" })
  })
  const before = (await browser.pages()).length
  await p.goto("https://storelib.com/app/payouts", { waitUntil: "load" })
  await sleep(1500)

  const sandboxes = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("iframe")].map((f) => [f.id, f.getAttribute("sandbox")])))
  expect(["prop", "attr", "markup"].every((id) => sandboxes[id] && !/allow-popups|allow-top-navigation/.test(sandboxes[id])), "SEALED: each Stripe frame carries the sandbox, with no popups and no moving the page", sandboxes)
  expect(sandboxes.other === null, "OTHERS: a frame from anywhere else is left as it is", sandboxes.other)
  const msgs = await p.evaluate(() => window.__msgs)
  const by = Object.fromEntries(msgs.map((m) => [m.from, m]))
  expect(["prop", "attr", "markup"].every((k) => by[k]?.ran && by[k]?.origin === "https://connect-js.stripe.com" && by[k]?.storage), "RUNS: the script runs, on Stripe's own origin, with its storage", by)
  expect(["prop", "attr", "markup"].every((k) => by[k]?.opened === false), "NO WINDOW: window.open comes back empty", Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.opened])))
  const after = (await browser.pages()).length
  expect(after === before, "and no second page was made (window.open, or a link with target _blank)", { before, after, away: asked.filter((u) => /connect\.stripe\.com|stripe\.com\/legal/.test(u)) })
  expect(p.url() === "https://storelib.com/app/payouts", "STAYS: the page hosting it is still Storelib's", p.url())
  expect(errors.length === 0, "no page errors", errors)
  await browser.close()
} finally {
  rmSync(out, { recursive: true, force: true })
}
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
