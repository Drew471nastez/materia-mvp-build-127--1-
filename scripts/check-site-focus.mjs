/**
 * ===========================================================================
 *  CLICKING A FIELD ON A WEBSITE DOES NOT MOVE THE PAGE
 * ===========================================================================
 * KeyboardGuard (components/platform/keyboard-guard.tsx) is mounted for every
 * route, and half a second after any focus it centred the field with a
 * smooth scroll, desktop included. On a published website that was the page
 * jumping somewhere odd whenever a visitor clicked into a form.
 *
 * Mounted here as the root layout mounts it, on a tall page scrolled part
 * way, with a field in plain view near the top. Clicked, then watched for a
 * second:
 *   • on a website (SiteDocument marks <html>), the page stays where it was;
 *   • on a page that is neither a website nor /app, a field already in view
 *     is not moved either;
 * on a desktop and on a phone.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-focus-"))
const stubs = join(root, ".focus-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { KeyboardGuard } from "${join(root, "components/platform/keyboard-guard.tsx")}"
import { SiteDocument } from "${join(root, "components/website-builder/site-document.tsx")}"
const site = new URLSearchParams(location.search).get("site") === "1"
createRoot(document.getElementById("app")).render(<>{site ? <SiteDocument /> : null}<KeyboardGuard /></>)
`)
execFileSync("npx", [
  "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:@=${root}`, "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:16px sans-serif} .tall{height:3000px;position:relative} #field{position:absolute;top:760px;left:20px;width:240px;height:40px;font-size:16px}</style></head>
<body><div id="app"></div><div class="tall"><input id="field" placeholder="Email"></div><script src="/probe.js"></script></body></html>`

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, r))
const origin = `http://127.0.0.1:${server.address().port}`

let failed = 0
const expect = (ok, name, detail = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail !== "" ? `   (${detail})` : ""}`); if (!ok) failed++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
for (const [name, vp] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  console.log(`\n${name}`)
  for (const [label, q] of [["a website", "?site=1"], ["a page outside /app", ""]]) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.goto(`${origin}/${q}`, { waitUntil: "load" })
    await sleep(150)
    /* Scrolled so the field sits in plain view, 160px from the top. */
    await p.evaluate(() => window.scrollTo(0, 600))
    await sleep(100)
    const before = await p.evaluate(() => window.scrollY)
    if (vp.hasTouch) await p.tap("#field")
    else await p.click("#field")
    await sleep(1100)
    const after = await p.evaluate(() => ({ y: window.scrollY, focused: document.activeElement?.id, site: document.documentElement.classList.contains("storelib-site") }))
    expect(after.focused === "field" && after.y === before, `on ${label}, clicking a field in view leaves the page where it was`, `${before} → ${after.y}${label === "a website" ? `, marked ${after.site}` : ""}`)
    await p.close()
  }
}
await browser.close()
server.close()
console.log(failed ? `\n${failed} check(s) failed.` : "\nA field clicked stays where it is.")
process.exit(failed ? 1 : 0)
