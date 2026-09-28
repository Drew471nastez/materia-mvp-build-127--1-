/**
 * ===========================================================================
 *  EVERY PUBLIC BUYER PAGE AT SIX WIDTHS, READ THE SAME WAY
 * ===========================================================================
 * Loads the public buyer pages of a running Storelib (the live site by
 * default: read only, nothing is bought or changed) at 360, 390, 430, 768,
 * 1024 and 1280, and reads each with scripts/sweep-measure.mjs: sideways
 * overflow, phone controls under 36px, clipped text, controls under a fixed
 * bottom bar, em dashes and banned words, and console errors. Products are
 * found from Explore's own links, one of each kind when there is one.
 *
 * It prints a table and writes a screenshot per page and width. Signed in
 * pages are measured by their own probes (check-buyer-library,
 * check-account-hub, check-course-player, check-memberships, check-receipt,
 * check-header-states, check-buyer-tab-bar), which render the real screens.
 *
 *   BASE=https://storelib.com SHOTS=/some/dir node scripts/check-buyer-sweep.mjs
 *   ONLY=/explore node scripts/check-buyer-sweep.mjs     one page
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { ANSWER_COOKIES, COVERED, MEASURE } from "./sweep-measure.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = (process.env.BASE ?? "https://storelib.com").replace(/\/$/, "")
const SHOTS = process.env.SHOTS || join(mkdtempSync(join(tmpdir(), "storelib-sweep-")), "shots")
mkdirSync(SHOTS, { recursive: true })
const WIDTHS = (process.env.WIDTHS ?? "360,390,430,768,1024,1280").split(",").map(Number)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function proxyFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy || !/^https:/.test(BASE)) return flags
  flags.push(`--proxy-server=${proxy}`)
  const spki = []
  for (const ca of ["/root/.ccr/agent-proxy-ca.crt", "/root/.ccr/ca-bundle.crt"]) {
    if (!existsSync(ca)) continue
    try {
      const pem = execFileSync("openssl", ["x509", "-in", ca, "-pubkey", "-noout"], { encoding: "buffer" })
      spki.push(createHash("sha256").update(execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: pem })).digest("base64"))
    } catch { /* next */ }
  }
  if (process.env.SPKI) spki.push(...process.env.SPKI.split(","))
  if (spki.length) flags.push(`--ignore-certificate-errors-spki-list=${spki.join(",")}`)
  return flags
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", ...proxyFlags()] })
const vpFor = (w) => (w < 768 ? { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: w, height: w >= 1024 ? 900 : 1024, deviceScaleFactor: 1 })

/* Explore's own product links, and what each one is. */
async function findProducts() {
  const p = await browser.newPage()
  await p.setViewport(vpFor(1280))
  await p.goto(`${BASE}/explore`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {})
  await sleep(1500)
  const links = await p.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\/[a-z0-9_-]+\/[a-z0-9-]+(\?|$)/i.test(h) && !/^\/(explore|library|account|app|login|signup|sell|wishlist|blog|help)\//.test(h)))].slice(0, 40))
  const found = {}
  for (const href of links) {
    if (found.digital && found.course && found.membership) break
    await p.goto(`${BASE}${href.split("?")[0]}`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {})
    await sleep(1200)
    const text = await p.evaluate(() => document.body.innerText).catch(() => "")
    const kind = /\/(month|year)\b|\bJoin\b/.test(text) ? "membership" : /\blessons?\b/i.test(text) ? "course" : "digital"
    if (!found[kind]) found[kind] = href.split("?")[0]
  }
  await p.close()
  return found
}

const products = process.env.ONLY ? {} : await findProducts()
console.log("products found:", products)
const PAGES = [
  ["/explore", "explore"],
  ["/explore/design", "category"],
  ["/explore?q=guide", "search results"],
  ...Object.entries(products).map(([k, href]) => [href, `product (${k})`]),
  ["/login", "login"],
  ["/signup", "signup"],
  ["/wishlist", "guest wishlist"],
].filter(([path]) => !process.env.ONLY || path === process.env.ONLY)

const rows = []
for (const [path, name] of PAGES) {
  for (const w of WIDTHS) {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`.slice(0, 160)))
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)) })
    await page.setViewport(vpFor(w))
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => errors.push(`load: ${e.message}`))
    await sleep(1200)
    if (await page.evaluate(ANSWER_COOKIES).catch(() => false)) await sleep(500)
    const m = await page.evaluate(MEASURE).catch((e) => ({ error: e.message }))
    await page.screenshot({ path: join(SHOTS, `${name.replace(/\W+/g, "-")}-${w}.png`) }).catch(() => {})
    const covered = await page.evaluate(COVERED).catch(() => [])
    rows.push({ page: name, path, w, ...m, covered, errors: [...new Set(errors)].filter((e) => !/Failed to load resource|favicon|ERR_BLOCKED|gtag|analytics/i.test(e)).slice(0, 4) })
    await page.close()
  }
}
await browser.close()

let findings = 0
for (const r of rows) {
  const issues = []
  if (r.error) issues.push(`measure failed: ${r.error}`)
  if (r.overflow > 0) issues.push(`overflow ${r.overflow}px: ${r.sticking.join("; ")}`)
  if (r.small?.length) issues.push(`small controls: ${r.small.join("; ")}`)
  if (r.clipped?.length) issues.push(`clipped: ${r.clipped.join("; ")}`)
  if (r.covered?.length) issues.push(`under a bottom bar: ${r.covered.join("; ")}`)
  if (r.banned?.length) issues.push(`banned words: ${r.banned.join(", ")}`)
  if (r.dashes?.length) issues.push(`em dashes: ${r.dashes.join(" | ")}`)
  if (r.errors?.length) issues.push(`console: ${r.errors.join(" | ")}`)
  if (issues.length) {
    findings++
    console.log(`\n${r.page} @${r.w} (${r.path})\n  - ${issues.join("\n  - ")}`)
  }
}
console.log(`\n${rows.length} page and width pairs, ${findings} with something to look at. Shots: ${SHOTS}`)
