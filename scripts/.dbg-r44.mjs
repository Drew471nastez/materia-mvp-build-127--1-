import { createServer } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-add-section-perf")
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RATES = (process.env.RATES ?? "4,6").split(",").map(Number)
const SIZES = (process.env.SIZES ?? "1280,390").split(",").map(Number)
const KINDS = (process.env.KINDS ?? "lean,warm").split(",")

const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>window.PROBE_SHORT = false</script>
<script src="/editor-probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(req.url.startsWith("/editor") ? page : "<!doctype html><title>blank</title>")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"], protocolTimeout: 600_000 })
const p = await browser.newPage()
await p.setViewport({ width: 1280, height: 800 })
await p.goto(`${origin}/editor`, { waitUntil: "load" })
await p.waitForFunction(() => { const c = [...document.querySelectorAll("[data-library-card]")]; return c.length >= 30 && c.every((x) => x.querySelector("[data-keep-transform]") || x.querySelector("[data-preview-fallback]")) }, { timeout: 60_000, polling: 250 }).catch(() => {})
await sleep(1000)
await p.evaluate(() => { const s = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]; (s[1] ?? s[0]).click() })
await sleep(2500)
console.log(await p.evaluate(() => {
  const s = document.querySelector("[data-library-scroll]")
  const deep = s.querySelector("[data-keep-transform] p, [data-keep-transform] span")
  const t = []
  for (let i = 0; i < 20; i++) { const t0 = performance.now(); s.toggleAttribute("data-scrolling"); getComputedStyle(deep).pointerEvents; document.body.offsetHeight; t.push(performance.now() - t0) }
  t.sort((a, b) => a - b)
  return "toggle median ms at 1x: " + t[10].toFixed(2) + " max " + t[19].toFixed(2)
}))
await browser.close(); server.close()
