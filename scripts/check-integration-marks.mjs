/**
 * EVERY INTEGRATION HAS ITS MARK, MEASURED.
 *
 *   node scripts/check-integration-marks.mjs        (MARKS_SHOT=/some/file.png for a picture)
 *
 * The real Settings > Integrations directory with physical commerce on, and
 * the provider cards an integration's page draws, in Chromium, with
 * public/integrations served. Every card's mark must be a logo that loaded
 * (naturalWidth > 0) or Storelib's own drawing; never an initial. And a logo
 * at an address that does not answer (an /admin typo) must fall back to the
 * initial tile, never a broken image.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, extname } from "node:path"
const root = process.cwd()
const req = createRequire(join(root, "package.json"))
const puppeteer = req("puppeteer-core")
const { appCss } = await import(join(root, "scripts/probe-css.mjs"))
const dir = mkdtempSync(join(tmpdir(), "storelib-integration-marks-"))
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-integration-marks.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"', `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"], { stdio: ["ignore", "ignore", "inherit"], cwd: root })
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${await appCss(root)}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/probe.js"></script></body></html>`
const types = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" }
const server = createServer((r, res) => {
  if (r.url === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(readFileSync(join(dir, "probe.js"))) }
  if (r.url.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(r.url.includes("physical/integrations") ? '{"integrations":[]}' : r.url.includes("catalog") ? '{"overrides":[]}' : '{"tracking":{},"ready":true}') }
  const f = join(root, "public", r.url.split("?")[0])
  if (r.url.startsWith("/integrations/") || r.url.startsWith("/brand")) { if (existsSync(f)) { res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }); return res.end(readFileSync(f)) } res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })
const page = await browser.newPage(); await page.setViewport({ width: 1200, height: 900 })
const errs = []; page.on("pageerror", (e) => errs.push(String(e)))
await page.goto(`http://127.0.0.1:${server.address().port}/app/settings?tab=integrations`)
await new Promise((r) => setTimeout(r, 1500))
/* The directory opens on Essentials (round I4): every card is under All. */
await page.click('[data-integration-pill="all"]')
await new Promise((r) => setTimeout(r, 500))
/* Bring every lazy image in. */
await page.evaluate(async () => { for (const i of document.querySelectorAll("img")) i.loading = "eager"; await new Promise((r) => setTimeout(r, 800)) })
const out = await page.evaluate(() => {
  const marks = [...document.querySelectorAll("[data-integration-mark]")]
  return marks.map((m) => {
    const card = m.closest("li, a, button, [data-broken], div")
    const name = (card?.textContent || "").trim().slice(0, 40)
    return { kind: m.getAttribute("data-integration-mark"), ok: m.tagName !== "IMG" || (m.complete && m.naturalWidth > 0), src: m.getAttribute("src"), name, broken: !!m.closest("[data-broken]") }
  })
})
const shots = process.env.MARKS_SHOT; if (shots) await page.screenshot({ path: shots, fullPage: true })
const report = { total: out.length, kinds: out.reduce((a, o) => ((a[o.kind] = (a[o.kind] || 0) + 1), a), {}), notLoaded: out.filter((o) => !o.ok), initials: out.filter((o) => o.kind === "initial" && !o.broken).map((o) => o.name), errs }
console.log(JSON.stringify(report, null, 1))
await browser.close(); server.close()
const bad = report.notLoaded.length + report.initials.length + errs.length + (out.some((o) => o.broken && o.kind === "initial") ? 0 : 1)
console.log(bad ? "\nFAIL: a mark is missing, broken, or a broken logo has no fallback\n" : "\nall good: every card has its logo or Storelib's drawing, and a broken logo falls back to its initial\n")
process.exit(bad ? 1 : 0)
