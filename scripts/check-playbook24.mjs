/**
 * ===========================================================================
 *  THE PHYSICAL PRODUCTS PLAYBOOK, MEASURED IN CHROMIUM (ROUND 24, P24)
 * ===========================================================================
 * The real Help Center pages (scripts/render-help.tsx: the page functions
 * called as the server calls them, then mounted) for the physical products
 * topic and /help/physical-products/playbook, with physical commerce on, the
 * real stylesheet and the screenshots served from public/. At 1440x900 and at
 * 390x844 (touch, CPU slowed 4x unless CPU_SLOWDOWN says otherwise):
 *
 *   the topic page    Start here is the playbook, Zero to 100 first in the list
 *   the article       nothing wider than the window; seven parts in the
 *                     contents; every smaller heading drawn; every screenshot
 *                     loaded, and the phone picture on a phone; a label beside
 *                     its words at a desk and above them on a phone; tables
 *                     stacked on a phone; text 16px or more
 *
 *   node scripts/check-playbook24.mjs       (SHOTS=/dir for screenshots)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || null
const SLOW = Number(process.env.CPU_SLOWDOWN || 4)
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".playbook24-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "next-navigation.js"), `const r = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => r
export const usePathname = () => "/help"
export const useSearchParams = () => new URLSearchParams()
export function notFound() { throw new Error("notFound") }
export function permanentRedirect() {}
export function redirect() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)
/* Physical commerce on, as /admin has it when the guide is shown. */
writeFileSync(join(dir, "physical.js"), `export const PHYSICAL_COMMERCE_KEY = "physical_commerce_enabled"
export const PHYSICAL_COMMERCE_CACHE_TAG = "physical-commerce-enabled"
export async function isPhysicalCommerceEnabled() { return true }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-help.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`, `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:@/lib/platform/physical-commerce=${join(dir, "physical.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty"],
    { cwd: root, stdio: "inherit" })
} catch { rmSync(dir, { recursive: true, force: true }); console.error("the probe did not bundle"); process.exit(1) }
const faces = interFaces(root)
const mediaDir = faces.match(/url\(file:\/\/([^)]*\/static\/media)\//)?.[1] ?? null
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces.replace(/url\(file:\/\/[^)]*\/static\/media\//g, "url(/media/")}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head>
<body><div id="app"></div><script src="/probe.js"></script></body></html>`
const bundle = readFileSync(join(dir, "probe.js"))
rmSync(dir, { recursive: true, force: true })

const server = createServer((req, res) => {
  const p = req.url.split("?")[0]
  if (p === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (p.startsWith("/media/") && mediaDir && /^[\w.-]+$/.test(p.slice(7))) { try { res.writeHead(200, { "content-type": "font/woff2" }); return res.end(readFileSync(join(mediaDir, p.slice(7)))) } catch { res.writeHead(404); return res.end() } }
  if (/^\/help\/physical\/[\w-]+\.webp$/.test(p) && existsSync(join(root, "public", p))) { res.writeHead(200, { "content-type": "image/webp" }); return res.end(readFileSync(join(root, "public", p))) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}/`

let broken = 0
const check = (label, ok, detail) => { if (!ok) broken++; console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`) }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
try {
  for (const [width, height, phone] of [[1440, 900, false], [390, 844, true]]) {
    console.log(`\n${width}x${height}${phone ? ` touch, CPU slowed ${SLOW}x` : ""}`)
    for (const which of ["category/physical-products", "article/physical-products/playbook"]) {
      const page = await browser.newPage()
      await page.setViewport({ width, height, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 3 : 1 })
      if (phone) { const cdp = await page.target().createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOW }) }
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
      const t0 = Date.now()
      await page.goto(`${base}#${which}`, { waitUntil: "domcontentloaded" })
      await page.waitForFunction(() => window.__ready === true && document.querySelector("h1"), { timeout: 30000 })
      const drawn = Date.now() - t0
      await page.evaluate(() => document.fonts.ready)
      const name = which.split("/").pop()
      if (which.startsWith("category")) {
        const m = await page.evaluate(() => {
          const start = document.querySelector("[data-help-start]")
          const firstRow = document.querySelector("[data-help-section] li a")
          return { overflow: document.documentElement.scrollWidth - innerWidth, start: start?.getAttribute("href"), label: start?.querySelector("span span")?.textContent, first: firstRow?.getAttribute("href") }
        })
        check(`topic page: Start here opens the playbook (drawn in ${drawn}ms)`, m.start === "/help/physical-products/playbook" && m.label === "Start here", m)
        check("  Zero to 100 is still the first article in the list", m.first === "/help/physical-products/zero-to-100", m.first)
        check("  nothing wider than the window", m.overflow <= 0, m.overflow)
      } else {
        /* Every picture loaded: scroll it all through so the lazy ones load, then read them. */
        await page.evaluate(async () => { for (const img of document.querySelectorAll("[data-help-image] img")) { img.loading = "eager" } })
        await page.waitForFunction(() => [...document.querySelectorAll("[data-help-image] img")].every((i) => i.complete), { timeout: 60000 }).catch(() => {})
        const m = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll("[data-help-image] img")]
          const facts = document.querySelector("[data-help-facts] > div")
          const dt = facts?.querySelector("dt")?.getBoundingClientRect()
          const dd = facts?.querySelector("dd")?.getBoundingClientRect()
          const p = document.querySelector("[data-help-body] p")
          const table = document.querySelector("[data-help-table] table")
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            h1: document.querySelector("h1")?.textContent,
            toc: [...document.querySelectorAll("[data-help-body] h2")].map((h) => h.textContent),
            subs: document.querySelectorAll("[data-help-body] h3").length,
            facts: document.querySelectorAll("[data-help-facts]").length,
            images: imgs.length,
            unloaded: imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")),
            phonePictures: imgs.filter((i) => /-phone\.webp$/.test(i.currentSrc)).length,
            withPhone: document.querySelectorAll("[data-help-image] source").length,
            widest: Math.max(...imgs.map((i) => i.getBoundingClientRect().right)),
            labelBeside: dt && dd ? Math.round(dd.left - dt.left) > 40 && Math.abs(dd.top - dt.top) < 4 : null,
            text: p ? getComputedStyle(p).fontSize : null,
            tableDisplay: table ? getComputedStyle(table).display : null,
            height: document.documentElement.scrollHeight,
          }
        })
        check(`article: "${m.h1}" (drawn in ${drawn}ms)`, /playbook/.test(m.h1 ?? ""))
        check("  nothing wider than the window, pictures included", m.overflow <= 0 && m.widest <= width + 0.5, { overflow: m.overflow, widest: Math.round(m.widest) })
        check("  the seven parts, then where to go next", m.toc.length === 8 && m.toc[0] === "The big picture" && m.toc[6] === "How to check it all works", m.toc)
        check("  every smaller heading and labelled list drawn", m.subs >= 40 && m.facts >= 30, { subs: m.subs, facts: m.facts })
        check("  every screenshot loaded", m.images >= 25 && m.unloaded.length === 0, { images: m.images, unloaded: m.unloaded })
        check(phone ? "  on a phone, the phone pictures are the ones shown" : "  at a desk, the desktop pictures", phone ? m.phonePictures === m.withPhone && m.withPhone >= 8 : m.phonePictures === 0, { phonePictures: m.phonePictures, withPhone: m.withPhone })
        check(phone ? "  a label sits above its words" : "  a label sits beside its words", phone ? m.labelBeside === false : m.labelBeside === true)
        check("  text at 16px or more", parseFloat(m.text) >= 16, m.text)
        check(phone ? "  the connections table stacks" : "  the connections table is a table", phone ? m.tableDisplay === "block" : m.tableDisplay === "table", m.tableDisplay)
        check("  no page errors", errors.length === 0, errors)
      }
      if (SHOTS) {
        await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true })
        /* The first screen, and the part where things go wrong, at the size a person sees them. */
        if (which.startsWith("article")) {
          await page.screenshot({ path: join(SHOTS, `${name}-${width}-top.png`) })
          for (const id of ["choose-how-you-fulfil", "what-happens-when-someone-orders", "connections-at-a-glance"]) {
            await page.evaluate((id) => document.getElementById(id)?.scrollIntoView(), id)
            await new Promise((r) => setTimeout(r, 300))
            await page.screenshot({ path: join(SHOTS, `${name}-${width}-${id}.png`) })
          }
        }
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
