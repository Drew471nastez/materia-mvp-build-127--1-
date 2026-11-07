/**
 * ===========================================================================
 *  A TREND CHART WITH NOTHING TO DRAW, MEASURED (round AL)
 * ===========================================================================
 * The owner: "when there are no analytics ... don't show that there are lines
 * and grids, and there's the gray curve ... It should be like how it was
 * before with the purple line flat."
 *
 * Mounts the home page's chart and the Analytics chart (the real components,
 * scripts/render-chart-feel.tsx ?empty=1) with every point at zero, at a
 * desktop and a phone width, and reads for each:
 *
 *   line     the stroke of the line and the spread of its y values (flat is
 *            under half a pixel)
 *   grid     how many grid lines recharts drew
 *   curve    whether a grey ghost shape is drawn
 *   axis     axis numbers that can be seen
 *
 *   node scripts/check-chart-empty-al.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".chart-empty-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}\nexport function isNativeApp() { return false }\nexport async function triggerHaptic() {}\nexport function openExternal() {}\nexport function nativePlatform() { return "web" }\nexport function shareNative() { return Promise.resolve(false) }\n`)

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let server
let browser
try {
  const css = await appCss(root, null)
  const bundle = join(dir, "probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-chart-feel.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;background:#fafafa}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  for (const [w, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    for (const chart of ["home", "analytics"]) {
      for (const empty of [true, false]) {
        const p = await browser.newPage()
        await p.setViewport(vp)
        const errors = []
        p.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)))
        await p.goto(`${origin}/?chart=${chart}${empty ? "&empty=1" : ""}`, { waitUntil: "load" })
        await p.waitForSelector("#card path[data-trend-line]", { timeout: 15000 }).catch(() => {})
        /* The line grows out of the floor over the morph; recharts loads lazily on the home chart. */
        await sleep(1800)
        const got = await p.evaluate(() => {
          const card = document.getElementById("card")
          const line = card.querySelector("path[data-trend-line]")
          const d = line?.getAttribute("d") ?? ""
          const ys = [...d.matchAll(/[ML,C]\s*-?[\d.]+,(-?[\d.]+)/g)].map((m) => Number(m[1]))
          const visible = (n) => {
            for (let el = n; el && el !== card; el = el.parentElement) if (Number(getComputedStyle(el).opacity) < 0.01) return false
            return true
          }
          const axis = [...card.querySelectorAll("*")].filter((n) => n.children.length === 0 && /^[$€]?\d[\d.,]*[kKM%]?$/.test(n.textContent.trim()) && !n.closest(".recharts-xAxis") && visible(n)).map((n) => n.textContent.trim())
          return {
            stroke: line ? getComputedStyle(line).stroke : null,
            spread: ys.length ? Math.round((Math.max(...ys) - Math.min(...ys)) * 10) / 10 : null,
            points: ys.length,
            grid: card.querySelectorAll(".recharts-cartesian-grid line, .recharts-cartesian-grid-horizontal line").length,
            curve: !!card.querySelector("[data-ghost-chart]"),
            axis,
          }
        })
        console.log(`${w} ${chart} ${empty ? "empty " : "filled"}: line ${got.stroke}, y spread ${got.spread}px over ${got.points} points, grid lines ${got.grid}, grey curve ${got.curve}, axis numbers ${JSON.stringify(got.axis)}`)
        if (empty) {
          expect(got.stroke === "rgb(139, 92, 246)", `${w} ${chart}: the line is purple`, got.stroke)
          expect(got.points > 1 && got.spread !== null && got.spread < 0.5, `${w} ${chart}: and flat`, got.spread)
          expect(got.grid === 0 && !got.curve, `${w} ${chart}: no grid and no grey curve`, { grid: got.grid, curve: got.curve })
          expect(got.axis.length === 0, `${w} ${chart}: no axis numbers`, got.axis)
        } else {
          expect(got.grid > 0 && got.spread > 5, `${w} ${chart}: a filled chart keeps its grid and its shape`, { grid: got.grid, spread: got.spread })
        }
        expect(errors.length === 0, `${w} ${chart}: no page errors`, errors)
        await p.close()
      }
    }
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
