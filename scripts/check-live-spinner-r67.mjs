/**
 * ===========================================================================
 *  A LIVE PAGE WHOSE TAB NEVER STOPS LOADING (round 67)
 * ===========================================================================
 * The owner: after publishing a change, changing the theme or publishing a
 * new website, the live website loads forever in its tab (the spinner never
 * stops, the favicon never shows).
 *
 * Opens the page in headless Chromium, the way a person opening it from the
 * editor would (a new tab, no cache), and says, per visit:
 *
 *   - every document navigation of the top frame (a reload or a refresh
 *     loop shows as several), with its status and Server-Timing;
 *   - when DOMContentLoaded and load fired, or that load never did;
 *   - every request still open when load fired or when the wait ran out,
 *     with its type, its frame and how long it has been open;
 *   - the slowest requests that did finish;
 *   - the icon the page names (none at all is said too).
 *
 *   URL=https://name.storelib.com/ node scripts/check-live-spinner-r67.mjs
 *   URL=... VISITS=3 GAP_MS=20000 node scripts/check-live-spinner-r67.mjs   (run right after a Publish)
 *
 * WAIT_MS (default 45000) is how long a visit may take before it is called
 * stuck. Read only: nothing is posted and nobody is signed in.
 */
import puppeteer from "puppeteer-core"

const URL_ = process.env.URL || "https://liam-bailey.storelib.com/"
const WAIT_MS = Number(process.env.WAIT_MS || 45000)
const VISITS = Number(process.env.VISITS || 1)
const GAP_MS = Number(process.env.GAP_MS || 0)
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", `--proxy-server=${process.env.HTTPS_PROXY ?? ""}`, "--ignore-certificate-errors"].filter((a) => !a.endsWith("=")),
})

let stuckVisits = 0
for (let v = 1; v <= VISITS; v++) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setCacheEnabled(false)
  const t0 = Date.now()
  const docs = []
  const open = new Map()
  const done = []
  let dcl = null
  let load = null
  page.on("domcontentloaded", () => (dcl = Date.now() - t0))
  page.on("load", () => (load = Date.now() - t0))
  page.on("request", (r) => open.set(r, { url: r.url().slice(0, 150), type: r.resourceType(), at: Date.now() - t0, frame: r.frame() === page.mainFrame() ? "top" : "sub" }))
  page.on("response", (res) => {
    if (res.request().resourceType() === "document" && res.frame() === page.mainFrame()) docs.push({ at: Date.now() - t0, status: res.status(), url: res.url().slice(0, 150), timing: res.headers()["server-timing"] ?? "", held: res.headers()["x-storelib-held"] ?? "" })
  })
  const close = (r, how) => {
    const o = open.get(r)
    if (!o) return
    open.delete(r)
    done.push({ ...o, how, ms: Date.now() - t0 - o.at })
  }
  page.on("requestfinished", (r) => close(r, "ok"))
  page.on("requestfailed", (r) => close(r, `failed ${r.failure()?.errorText ?? ""}`))
  page.goto(URL_, { waitUntil: "domcontentloaded", timeout: WAIT_MS }).catch((e) => console.log(`  goto: ${e.message.split("\n")[0]}`))
  const until = Date.now() + WAIT_MS
  while (Date.now() < until && load === null) await sleep(200)
  const atEnd = Date.now() - t0
  const icon = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"]')].map((l) => l.getAttribute("href")?.slice(0, 80) ?? "")).catch(() => [])
  const stuck = load === null
  if (stuck) stuckVisits++
  console.log(`\nVisit ${v}: ${URL_}`)
  console.log(`  documents: ${docs.length}${docs.length > 1 ? " (a reload or a refresh loop)" : ""}`)
  for (const d of docs) console.log(`    ${d.at} ms  ${d.status}  ${d.url}  held=${d.held || "-"}  ${d.timing}`)
  console.log(`  DOMContentLoaded ${dcl ?? "never"} ms, load ${load ?? `NEVER within ${WAIT_MS} ms`}`)
  console.log(`  icon: ${icon.length ? icon.join(", ") : "none named"}`)
  console.log(`  still open ${stuck ? `after ${atEnd} ms` : "when load fired"}: ${open.size}`)
  for (const o of open.values()) console.log(`    ${o.type} (${o.frame}) open since ${o.at} ms: ${o.url}`)
  const slow = done.filter((d) => d.ms > 1500).sort((a, b) => b.ms - a.ms).slice(0, 10)
  console.log(`  finished in over 1.5 s: ${slow.length}`)
  for (const d of slow) console.log(`    ${d.type} ${d.ms} ms ${d.how}: ${d.url}`)
  await ctx.close()
  if (v < VISITS && GAP_MS) await sleep(GAP_MS)
}
await browser.close()
console.log(`\n${stuckVisits} of ${VISITS} visit(s) never fired load within ${WAIT_MS} ms`)
process.exit(0)
