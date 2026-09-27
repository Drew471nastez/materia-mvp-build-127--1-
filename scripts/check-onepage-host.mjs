/**
 * ===========================================================================
 *  storelib.me END TO END, AGAINST A RUNNING SERVER
 * ===========================================================================
 * tests/onepage-host.test.ts pins the routing decision as a pure function.
 * This asks a real `next start` the same questions with real Host headers,
 * so what is measured is what the proxy, the rewrites and the routes do
 * together: the status, the Location, whether a Set-Cookie ever appears on
 * storelib.me, and the 404 page's own markup and headers. Then it draws the
 * 404 at a phone and a laptop width and saves both pictures to look at.
 *
 *   pnpm exec next build --webpack && pnpm exec next start -p 3123
 *   BASE=http://127.0.0.1:3123 node scripts/check-onepage-host.mjs
 *
 * With placeholder Supabase keys no OnePage exists, so storelib.me/{name}
 * answers the not found page; the redirects, the refusals and the absence of
 * cookies are what this checks. Screenshots land in $OUT (default: a temp
 * directory, printed at the end).
 */
import http from "node:http"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const BASE = new URL(process.env.BASE ?? "http://127.0.0.1:3123")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), "onepage-host-"))

let passed = 0
let failed = 0
function check(label, ok, detail) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}

/** One request with this Host header, redirects NOT followed. */
function ask(host, path, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: BASE.hostname, port: BASE.port, path, method, headers: { host, "user-agent": "Mozilla/5.0 probe", ...headers } },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (c) => (body += c))
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }))
      },
    )
    req.on("error", reject)
    if (method === "POST") req.write("{}")
    req.end()
  })
}

const noCookie = (r) => !r.headers["set-cookie"]

console.log("\nstorelib.me")
{
  const r = await ask("storelib.me", "/")
  check("/ goes to storelib.com, 307", r.status === 307 && r.headers.location === "https://storelib.com/", `${r.status} ${r.headers.location}`)
}
{
  const r = await ask("storelib.me", "/LucaDragoste?utm_source=ig")
  check("/LucaDragoste is 308 to /lucadragoste with its query", r.status === 308 && r.headers.location === "https://storelib.me/lucadragoste?utm_source=ig", `${r.status} ${r.headers.location}`)
}
{
  const r = await ask("storelib.me", "/nobody-here-at-all")
  check("an unknown name is a 404", r.status === 404, String(r.status))
  check("with the small not found page", /data-onepage-missing/.test(r.body) && /This page is not here/.test(r.body))
  check("never indexed", /<meta name="robots" content="noindex/.test(r.body) || /noindex/.test(String(r.headers["x-robots-tag"] ?? "")))
  check("no platform header or footer drawn on the server", !/id="platform-header-root"/.test(r.body))
  check("no cookie", noCookie(r), String(r.headers["set-cookie"]))
}
{
  const r = await ask("storelib.me", "/a%20b")
  check("a name that cannot be one is a 404, marked noindex", r.status === 404 && /noindex/.test(String(r.headers["x-robots-tag"])), `${r.status} ${r.headers["x-robots-tag"]}`)
}
for (const p of ["/app", "/admin", "/login", "/checkout?productId=1", "/dashboard"]) {
  const r = await ask("storelib.me", p)
  check(`${p} is 308 to storelib.com${p}`, r.status === 308 && r.headers.location === `https://storelib.com${p}` && noCookie(r), `${r.status} ${r.headers.location}`)
}
for (const [method, p] of [["GET", "/api/onepage"], ["GET", "/api/auth/user"], ["GET", "/api/admin/users"], ["GET", "/api/onepage/address?name=x"], ["POST", "/api/stripe/webhook"]]) {
  const r = await ask("storelib.me", p, { method })
  check(`${method} ${p} is a 404 JSON on storelib.me`, r.status === 404 && /application\/json/.test(String(r.headers["content-type"])) && noCookie(r), `${r.status} ${r.headers["content-type"]}`)
}
{
  const r = await ask("storelib.me", "/api/onepage/track", { method: "POST", headers: { "content-type": "application/json" } })
  check("POST /api/onepage/track reaches its route (400 for an empty body)", r.status === 400, `${r.status} ${r.body.slice(0, 80)}`)
}
{
  const r = await ask("storelib.me", "/robots.txt")
  check("robots.txt is the host's own", r.status === 200 && /Sitemap: https:\/\/storelib\.me\/sitemap\.xml/.test(r.body), r.body)
}
{
  const r = await ask("storelib.me", "/sitemap.xml")
  check("sitemap.xml reaches the OnePage index (503 without a database)", r.status === 503 || (r.status === 200 && /storelib\.me\/sitemap\/onepages-0\.xml/.test(r.body)), `${r.status}`)
}
{
  const r = await ask("www.storelib.me", "/mara?x=1")
  check("www.storelib.me is 308 to storelib.me", r.status === 308 && r.headers.location === "https://storelib.me/mara?x=1", `${r.status} ${r.headers.location}`)
}

console.log("\nstorelib.com's old addresses")
for (const [host, p, to] of [
  ["storelib.com", "/mara/links?utm_source=instagram&ref=bio", "https://storelib.me/mara?utm_source=instagram&ref=bio"],
  ["storelib.com", "/Mara/links", "https://storelib.me/mara"],
  ["storelib.com", "/mara.links", "https://storelib.me/mara"],
  ["storelib.com", "/l/mara?utm_campaign=x", "https://storelib.me/mara?utm_campaign=x"],
  ["mara.storelib.com", "/links", "https://storelib.me/mara"],
]) {
  const r = await ask(host, p)
  check(`${host}${p} is 308 to ${to}`, r.status === 308 && r.headers.location === to, `${r.status} ${r.headers.location}`)
}
{
  const r = await ask("storelib.com", "/mara/links", { headers: { "user-agent": "Mozilla/5.0 Capacitor StorelibApp" } })
  check("the native app is served in place, not sent to another origin", r.status !== 308 || !String(r.headers.location).includes("storelib.me"), `${r.status} ${r.headers.location}`)
}

console.log("\nEverything else as it was")
{
  const r = await ask("storelib.com", "/pricing")
  check("storelib.com/pricing still answers on storelib.com", r.status === 200, String(r.status))
}
{
  const r = await ask("maralind.com", "/")
  check("a connected apex still goes to its www (the custom domain rule)", r.status === 301 || r.status === 302, `${r.status} ${r.headers.location}`)
}

/* ── The 404, drawn ─────────────────────────────────────────────────── */
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--font-render-hinting=none", `--host-resolver-rules=MAP storelib.me ${BASE.hostname}`],
})
try {
  for (const [label, width, height] of [["phone", 390, 844], ["laptop", 1280, 800]]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 2 })
    const res = await page.goto(`http://storelib.me:${BASE.port}/nobody-here-at-all`, { waitUntil: "networkidle0" })
    const box = await page.$eval("[data-onepage-missing]", (el) => {
      const r = el.getBoundingClientRect()
      const h1 = el.querySelector("h1").getBoundingClientRect()
      return { w: r.width, h: r.height, h1Top: h1.top, bg: getComputedStyle(el).backgroundColor, overflow: document.documentElement.scrollWidth - window.innerWidth }
    })
    check(`${label}: 404 status in a browser`, res?.status() === 404, String(res?.status()))
    check(`${label}: fills the screen, no sideways scroll`, box.w === width && box.h >= height - 1 && box.overflow <= 0, JSON.stringify(box))
    check(`${label}: the page background is #f8f9fa`, box.bg === "rgb(248, 249, 250)", box.bg)
    const header = await page.$("#platform-header-root")
    check(`${label}: no platform header after hydration`, header === null)
    const file = join(OUT, `onepage-missing-${label}.png`)
    await page.screenshot({ path: file })
    console.log(`        picture: ${file}`)
    await page.close()
  }
} finally {
  await browser.close()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
