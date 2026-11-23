/**
 * ===========================================================================
 *  WHAT /app SENDS FOR CREATOR ACTIVITY, COUNTED IN CHROMIUM (round 59)
 * ===========================================================================
 * The real beacon (components/app/activity-beacon.tsx, through
 * scripts/render-activity-beacon-r59.tsx) on a local server that stands in
 * for /api/activity and keeps every body it gets. The page's clock runs
 * sixty times fast, so one real second is one minute of the beacon's time.
 *
 * The script types into a field, presses a plain button, a named one and one
 * that calls noteActivity, follows an editor link, changes route with ids and
 * an email in the path, waits on screen, hides the tab, waits hidden, comes
 * back, and closes the page. Then it asserts:
 *
 *   requests while visible     one a minute
 *   requests while hidden      none (one beacon as it hides)
 *   bytes per request          small
 *   what is in them            the pages with ids as :id and the named actions;
 *                              never what was typed, an id or an email
 *
 *   node scripts/check-activity-beacon-r59.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const out = mkdtempSync(join(tmpdir(), "storelib-beacon-"))
execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-activity-beacon-r59.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`, '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`,
    `--alias:next/navigation=${join(root, "scripts/render-activity-beacon-r59-navigation.ts")}`,
  ],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
)
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/probe.js"></script></body></html>`)

const got = []
const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/activity") {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      got.push({ at: Date.now(), body, type: req.headers["content-type"] || "", phase: phase })
      res.writeHead(204).end()
    })
    return
  }
  if (req.url === "/probe.js") return res.writeHead(200, { "Content-Type": "text/javascript" }).end(readFileSync(join(out, "probe.js")))
  res.writeHead(200, { "Content-Type": "text/html" }).end(readFileSync(join(out, "index.html")))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const port = server.address().port
let phase = "load"

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${port}/app`, { waitUntil: "load" })
await wait(300)

phase = "visible"
const TYPED = "honey recipe for ana@gmail.com 4242424242424242"
await page.type("#title", TYPED)
await page.type("#note", "a private message")
await page.click("#plain")
await page.click("#publish")
await page.click("#stripe")
await page.click("#editor")
await page.evaluate(() => window.__go("/app/products/3f2a9c1e-1b2c-4d5e-8f90-123456789abc"))
await page.evaluate(() => window.__go("/app/contacts/ana%40gmail.com"))
await page.evaluate(() => window.__go("/app/orders"))
await wait(3_400) // three minutes and a bit on screen
const visibleCount = got.filter((g) => g.phase === "visible").length

phase = "hidden"
await page.evaluate(() => window.__go("/app/settings/payments"))
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
  document.dispatchEvent(new Event("visibilitychange"))
})
await wait(5_200) // five minutes hidden
const hiddenCount = got.filter((g) => g.phase === "hidden").length

phase = "back"
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
  document.dispatchEvent(new Event("visibilitychange"))
})
await wait(300)
phase = "close"
await page.evaluate(() => window.__go("/app/analytics"))
await page.close({ runBeforeUnload: true })
await wait(500)
await browser.close()
server.close()

const bodies = got.map((g) => g.body)
const all = bodies.join("\n")
const sizes = bodies.map((b) => Buffer.byteLength(b))
const events = got.flatMap((g) => JSON.parse(g.body).e)
const problems = []
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== undefined ? `  (${detail})` : ""}`)
  if (!ok) problems.push(label)
}
console.log(`\n${got.length} requests:`)
for (const g of got) console.log(`  [${g.phase}] ${Buffer.byteLength(g.body)} B  ${g.body}`)
console.log("")
check("three minutes on screen: three requests, one a minute", visibleCount === 3, visibleCount)
check("five minutes hidden: one request, the beacon as it hid", hiddenCount === 1, hiddenCount)
check("back after five minutes: one request at once", got.filter((g) => g.phase === "back").length === 1)
check("closing the page sends what was waiting", got.filter((g) => g.phase === "close").length === 1)
check(`every request is small (largest ${Math.max(...sizes)} B, average ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} B)`, Math.max(...sizes) < 600)
check("nothing typed is in any request", !all.includes("honey") && !all.includes("4242") && !all.includes("private message"))
check("no id and no email in any path", !/[0-9a-f]{8}-[0-9a-f]{4}/.test(all) && !/@|%40/.test(all))
const names = events.map((e) => e[2])
check("the pages, with ids as :id", ["/app", "/app/products/:id", "/app/contacts/:id", "/app/orders", "/app/settings/payments", "/app/analytics"].every((p) => names.includes(p)), names.join(" "))
check("the named actions, and no plain click", names.includes("site.publish") && names.includes("stripe.start") && names.includes("editor.open") && events.filter((e) => e[1] === "a").length === 3)
writeFileSync(join(process.env.OUT_DIR || out, "beacon-requests-r59.json"), JSON.stringify({ requests: got.map((g) => ({ phase: g.phase, bytes: Buffer.byteLength(g.body), body: g.body })) }, null, 2))
if (problems.length) process.exit(1)
