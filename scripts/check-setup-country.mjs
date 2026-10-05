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
import { createServer } from "node:http"
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
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const out = process.env.SHOTS || join(root, ".setup-country-probe")
mkdirSync(out, { recursive: true })

/* The flags, served the way the site serves them (next.config.mjs: a week in the cache), each request counted. */
let flagLoads = []
const flagServer = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname)
  const file = join(root, "public", path)
  if (path === "/app/payouts") { res.writeHead(200, { "content-type": "text/html" }); res.end(html); return }
  if (!path.startsWith("/flags/") || !existsSync(file)) { res.writeHead(404); res.end(); return }
  const body = readFileSync(file)
  flagLoads.push({ path, bytes: body.length, at: Date.now() })
  res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=604800", "access-control-allow-origin": "*" })
  res.end(body)
})
await new Promise((r) => flagServer.listen(0, "127.0.0.1", r))
const flagBase = `http://127.0.0.1:${flagServer.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const width of [390, 1280]) {
    const phone = width < 640
    console.log(`\nAt ${width}px`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    /* Every flag file asked for, and its bytes (round 12: "country flags load fast"). */
    flagLoads = []
    await p.setRequestInterception(true)
    /* Interception turns the cache off; the sprite is meant to be fetched once and then read from it. */
    await p.setCacheEnabled(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      /* Flags go to a real server (flagServer, below), so the browser's own cache decides what is asked for twice. */
      if (u.startsWith(flagBase)) return r.continue()
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width, height: 844, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone })
    /* An iPhone: the clock's 47px at the top, the home bar's 34 at the bottom. */
    if (phone) await (await p.createCDPSession()).send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } }).catch(() => {})
    await p.goto(`${flagBase}/app/payouts`)
    await p.waitForSelector("[data-choice-field=country]", { timeout: 5000 })
    await p.screenshot({ path: join(out, `closed-${width}.png`) })

    /* The field has been on screen a moment, as a person reads the page before tapping it. */
    await new Promise((r) => setTimeout(r, 1200))
    const beforeOpen = flagLoads.length
    const openedAt = Date.now()
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

    /*
      THE FLAGS (round 12, ask 35). Every row on screen has its flag drawn
      within a frame or two of the list opening, from one file asked for
      before the tap; scrolling to the end asks for nothing more; and a flag
      arriving moves no name.
    */
    const flags = await p.evaluate(async () => {
      const rows = () => [...document.querySelectorAll("[data-choice]")]
      const box = () => (document.querySelector("[data-sheet-scroll]") || document.querySelector("[data-choice-scroll]") || document.body).getBoundingClientRect()
      const seen = (r) => { const b = r.getBoundingClientRect(), s = box(); return b.height > 0 && b.bottom > s.top + 4 && b.top < s.bottom - 4 }
      const onScreen = rows().filter(seen)
      const drawn = onScreen.filter((r) => r.querySelector("[data-flag] svg use, [data-flag] img"))
      const nameX = onScreen.map((r) => Math.round((r.querySelector("span:not([data-flag]):not([aria-hidden])") || r).getBoundingClientRect().left))
      const scroller = document.querySelector("[data-sheet-scroll]") || document.querySelector("[data-choice-scroll]")
      if (scroller) { scroller.scrollTop = scroller.scrollHeight; await new Promise((r) => setTimeout(r, 500)) }
      const after = rows().filter(seen)
      const drawnAfter = after.filter((r) => r.querySelector("[data-flag] svg use, [data-flag] img"))
      if (scroller) { scroller.scrollTop = 0; await new Promise((r) => setTimeout(r, 300)) }
      const nameXAgain = rows().filter(seen).map((r) => Math.round((r.querySelector("span:not([data-flag]):not([aria-hidden])") || r).getBoundingClientRect().left))
      return { onScreen: onScreen.length, drawn: drawn.length, atEnd: after.length, drawnAtEnd: drawnAfter.length, nameX: [...new Set(nameX)], nameXAgain: [...new Set(nameXAgain)] }
    })
    const loads = { beforeTap: beforeOpen, afterOpenAndScroll: flagLoads.length, requests: flagLoads.map((f) => f.path.replace(/^\/flags\//, "")).slice(0, 6), bytes: flagLoads.reduce((n, f) => n + f.bytes, 0) }
    console.log(`  flags: ${JSON.stringify({ ...flags, loads, msFromTap: openedAt })}`)
    expect(flags.drawn === flags.onScreen, "every row on screen has its flag as the list opens", { drawn: flags.drawn, rows: flags.onScreen })
    expect(flags.drawnAtEnd === flags.atEnd, "and so does every row at the end of the list", { drawn: flags.drawnAtEnd, rows: flags.atEnd })
    expect(flagLoads.length <= 1, "every flag comes from one file", loads)
    expect(flagLoads.every((f) => f.at < openedAt), "asked for before the list was opened", loads)
    expect(flags.nameX.length === 1 && flags.nameXAgain.length === 1 && flags.nameX[0] === flags.nameXAgain[0], "and no name moves as the flags come in", { nameX: flags.nameX, again: flags.nameXAgain })

    if (phone) {
      /*
        THE SHEET'S HEIGHT, AND THE KEYBOARD (round 12, ask 35): "a little
        less tall; focusing Search countries never pushes the sheet up under
        the iOS clock (keep it in place, the list area shrinks)". The
        keyboard is simulated the way components/viewport-vars publishes a
        real one: --kb-inset is what it hides at the bottom, --vv-h what is
        left above it. A 336px keyboard is an iPhone 15's with its bar.
      */
      const read = () => p.evaluate(() => {
        const panel = document.querySelector("[data-sheet-panel]").getBoundingClientRect()
        const list = document.querySelector("[data-sheet-scroll]").getBoundingClientRect()
        const search = document.querySelector("[data-choice-search]").getBoundingClientRect()
        const safeTop = (() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px)"; document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return h })()
        return { top: Math.round(panel.top), height: Math.round(panel.height), list: Math.round(list.height), listBottom: Math.round(list.bottom), searchBottom: Math.round(search.bottom), safeTop }
      })
      const rest = await read()
      expect(rest.height <= 580 && rest.height >= 560, "the sheet is a little less tall: 580px on an 844px iPhone, from 640", rest)
      const keyboard = async (kb) => {
        await p.evaluate((kb) => {
          document.documentElement.style.setProperty("--kb-inset", `${kb}px`)
          document.documentElement.style.setProperty("--vv-h", `${innerHeight - kb}px`)
          let k = document.getElementById("__kb")
          if (!k) { k = document.createElement("div"); k.id = "__kb"; document.body.appendChild(k) }
          k.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${kb}px;background:#d1d5db;z-index:99999;display:${kb ? "flex" : "none"};align-items:center;justify-content:center;font:13px system-ui;color:#4b5563`
          k.textContent = "keyboard"
        }, kb)
        await new Promise((r) => setTimeout(r, 450))
        return read()
      }
      await p.focus("[data-choice-search]")
      const kb = await keyboard(336)
      await p.screenshot({ path: join(out, `keyboard-${width}.png`) })
      console.log(`  keyboard: ${JSON.stringify({ rest, kb })}`)
      expect(kb.top === rest.top, "focusing the search leaves the sheet's top where it was", { rest: rest.top, keyboard: kb.top })
      expect(kb.list < rest.list, "the list under the search is what gets shorter", { rest: rest.list, keyboard: kb.list })
      expect(kb.searchBottom <= 844 - 336 && kb.listBottom <= 844 - 336 + 1, "the search and the list are above the keyboard", kb)
      const big = await keyboard(520)
      await p.screenshot({ path: join(out, `keyboard-tall-${width}.png`) })
      expect(big.top >= big.safeTop + 12, "a keyboard taller than the sheet's room lifts it, never under the clock", { top: big.top, safeTop: big.safeTop })
      expect(big.searchBottom <= 844 - 520, "and the search is still above the keys", big)
      await keyboard(0)
    }

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
  flagServer.close()
}

console.log(`\n  pictures in .setup-country-probe/`)
if (broken) {
  console.error(`\n${broken} wrong.`)
  process.exit(1)
}
console.log("\n  all good.")
