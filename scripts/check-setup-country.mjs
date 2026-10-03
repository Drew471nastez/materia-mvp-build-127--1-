/**
 * ===========================================================================
 *  THE COUNTRY FIELD IN SET UP PAYMENTS, ON A PHONE
 * ===========================================================================
 * The reported fault: on a phone, in the app and in a mobile browser, tapping
 * "Select country" did nothing. The list is the shared bottom sheet, which
 * draws at z-index 200; the setup panel is a full screen white subpage above
 * it, so the list opened BEHIND the panel and nothing appeared to happen.
 *
 * This opens the real panel, taps the real field, and checks that what comes
 * up is on top, can be searched, and that picking a country puts it in the
 * field. Pictures go to .setup-country-probe/ for the eye.
 *
 *   node scripts/check-setup-country.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = mkdtempSync(join(tmpdir(), "storelib-setup-country-"))
writeFileSync(join(stubs, "navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => "/app/payouts"
export const useSearchParams = () => new URLSearchParams(location.search)`)

const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-setup-country.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", react: compiled("react"), "react-dom": compiled("react-dom"), "next/navigation": join(stubs, "navigation.js") },
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const css = await appCss(root)
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const out = join(root, ".setup-country-probe")
mkdirSync(out, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const width of [390, 1280]) {
    const phone = width < 640
    console.log(`\nAt ${width}px`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u === "http://probe.test/app/payouts") return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/flags/")) return r.respond({ status: 404, body: "" })
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
    await p.goto("http://probe.test/app/payouts")
    await p.waitForSelector("[data-choice-field=country]", { timeout: 5000 })
    await p.screenshot({ path: join(out, `closed-${width}.png`) })

    await p.click("[data-choice-field=country]")
    await new Promise((r) => setTimeout(r, 600))

    const open = await p.evaluate(() => {
      const panel = document.querySelector("[data-payments-setup-panel]")
      const list = document.querySelector("[data-sheet-root]") ?? document.querySelector("[data-choice-popover=country]")
      if (!panel || !list) return { list: !!list }
      const z = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const v = getComputedStyle(n).zIndex
          if (v !== "auto") return Number(v)
        }
        return 0
      }
      const box = list.getBoundingClientRect()
      /* What the finger would actually land on, in the middle of the list. */
      const hit = document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + Math.min(box.height - 10, 120)))
      return {
        list: true,
        sheet: list.hasAttribute("data-sheet-root"),
        listZ: z(list),
        panelZ: z(panel),
        onTop: !!hit && list.contains(hit),
        rows: document.querySelectorAll("[data-choice]").length,
        visible: box.width > 0 && box.height > 0 && box.top < window.innerHeight,
      }
    })
    expect(open.list === true, "the list comes up when the field is tapped")
    expect(open.visible === true, "and it is on the screen", open)
    expect(open.listZ > open.panelZ, "above the setup panel, not behind it", { list: open.listZ, panel: open.panelZ })
    expect(open.onTop === true, "a tap in the middle of it lands on the list", open.onTop)
    expect(open.rows > 100, "every country is in it", open.rows)
    if (phone) expect(open.sheet === true, "on a phone it is the shared bottom sheet")
    await p.screenshot({ path: join(out, `open-${width}.png`) })

    await p.type("[data-choice-search]", "Romania")
    await new Promise((r) => setTimeout(r, 300))
    const found = await p.evaluate(() => [...document.querySelectorAll("[data-choice]")].map((b) => b.textContent?.trim()).slice(0, 4))
    expect(found.length >= 1 && /Romania/.test(found[0] ?? ""), "the search finds a country", found)
    await p.screenshot({ path: join(out, `search-${width}.png`) })

    await p.evaluate(() => document.querySelector("[data-choice]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    await new Promise((r) => setTimeout(r, 600))
    const picked = await p.evaluate(() => ({
      field: document.querySelector("[data-choice-field=country]")?.textContent?.trim() ?? null,
      stillOpen: !!document.querySelector("[data-sheet-root][data-app-sheet=open]") || !!document.querySelector("[data-choice-popover=country]"),
    }))
    expect(/Romania/.test(picked.field ?? ""), "picking one puts it in the field", picked.field)
    expect(picked.stillOpen === false, "and closes the list", picked.stillOpen)
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.screenshot({ path: join(out, `picked-${width}.png`) })
    await p.close()
  }
} finally {
  await browser.close()
}

console.log(`\n  pictures in .setup-country-probe/`)
if (broken) {
  console.error(`\n${broken} wrong.`)
  process.exit(1)
}
console.log("\n  all good.")
