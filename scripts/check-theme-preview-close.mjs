/**
 * ===========================================================================
 *  A TEMPLATE'S PREVIEW, CLOSED WITH X, MEASURED (round 30)
 * ===========================================================================
 * The owner: "clicking a template opens its preview; pressing X must close
 * only the preview and return the visitor exactly where they were (same
 * page, same scroll), not close everything". X used to go back over the
 * preview's history entry and the marketplace's in one traversal, so the
 * creator was dropped on the Website page with the marketplace gone.
 *
 * The real Website page (WebsiteBuilderClient, scripts/render-theme-popup-
 * probe.tsx) in Chromium, at 1440 x 900 with a mouse and at 390 x 844 on a
 * touch screen:
 *
 *   • the marketplace open and scrolled deep into its list, a card's cover
 *     opens the preview; X closes the preview and nothing else: the
 *     marketplace is still open, its list on the same scroll and the same
 *     card where it was, the address ?themes=1 and the focus on that cover
 *   • the page under it never moved
 *   • a second preview and X again: still the same place (no entry left
 *     behind that a later Back would land on)
 *   • Back from there closes the marketplace and lands on the Website page
 *   • a cover on the page itself: X lands on the page at its scroll
 *
 *   node scripts/check-theme-preview-close.mjs     SHOTS=dir saves pictures
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-preview-close-"))
const SHOTS = process.env.SHOTS || ""
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const css = (await appCss(root, join(root, "app/globals.css"))) + "\n" + interFaces(root)
/* The stubs live in the temporary folder, not the repository. */
const stubs = join(out, "stubs")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) {
  return React.createElement("a", { href: String(href), ...rest }, children)
}
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => window.location.pathname
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })
export const useSearchParams = () => new URLSearchParams(window.location.search)
`)
writeFileSync(join(stubs, "toast.js"), `export const useToast = () => ({ toast() {} })
`)
writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}
export const NavigationLoadingBar = () => null
`)
const aliases = [
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`,
  `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`,
  `--alias:@=${root}`,
]
const tall = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="3000" viewBox="0 0 1280 3000"><rect width="1280" height="3000" fill="#e9e3d9"/><rect width="1280" height="600" fill="#1f2937"/></svg>`

let browser
try {
  const liveJs = join(out, "live.js")
  try {
    execFileSync(
      join(root, "node_modules/.bin/esbuild"),
      [join(root, "scripts/render-theme-popup-probe.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${liveJs}`,
        '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
        '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", ...aliases],
      /* The stubs are outside the repository: react is found through NODE_PATH. */
      { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
    )
  } catch {
    fail("The probe did not bundle. The error above is esbuild's.")
  }
  const js = readFileSync(liveJs)
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}body{background:#f8f9fa;font-family:Inter,system-ui,sans-serif}#root{height:100dvh}</style>`
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    if (url.pathname === "/cover.svg" || url.pathname === "/_next/image") {
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" })
      return res.end(tall)
    }
    if (url.pathname.startsWith("/themes/") && /^[\w/.-]+$/.test(url.pathname) && existsSync(join(root, "public", url.pathname))) {
      res.writeHead(200, { "content-type": "image/webp", "cache-control": "public, max-age=3600" })
      return res.end(readFileSync(join(root, "public", url.pathname)))
    }
    /* No live websites here: the preview falls back on its pictures; what is measured is its closing. */
    if (url.pathname.startsWith("/theme-previews/")) {
      res.writeHead(404)
      return res.end()
    }
    if (url.pathname === "/live.js") {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(js)
    }
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" })
      return res.end("{}")
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(`<!doctype html><html><head>${head}</head><body><div id="root"></div><script src="/live.js"></script></body></html>`)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  const open = async (W, H) => {
    const p = await browser.newPage()
    const phone = W < 768
    await p.setViewport({ width: W, height: H, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone })
    p.on("pageerror", (e) => expect(false, `no script error at ${W}`, String(e).slice(0, 200)))
    await p.goto(`${origin}/app/website-builder`, { waitUntil: "networkidle0", timeout: 60_000 })
    await p.waitForSelector("[data-wb-page]")
    await sleep(150)
    return p
  }
  const press = (p, phone, sel) => (phone ? p.tap(sel) : p.click(sel))
  const shot = async (p, name) => {
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) })
  }
  /* Where everything is: the page's scroll, the list's scroll, the chosen card's box, the address, what has the focus. */
  const where = (p, slug) =>
    p.evaluate((slug) => {
      const list = document.querySelector("[data-themes-scroll]")
      const card = slug ? document.querySelector(`[data-themes-grid] [data-template-card='${slug}']`) : null
      const r = card?.getBoundingClientRect()
      return {
        page: Math.round(document.querySelector(".page-scroll")?.scrollTop ?? -1),
        list: list ? Math.round(list.scrollTop) : null,
        card: r ? [Math.round(r.left), Math.round(r.top)] : null,
        popup: document.querySelector("[data-themes-popup]")?.getAttribute("data-state") ?? null,
        preview: !!document.querySelector("[data-theme-preview]"),
        search: location.search,
        len: history.length,
        focus: document.activeElement?.closest("[data-template-card]")?.getAttribute("data-template-card") ?? document.activeElement?.tagName ?? null,
      }
    }, slug)
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  for (const [W, H] of [[1440, 900], [390, 844]]) {
    const phone = W < 768
    console.log(`\nClosing a preview with X, ${W} x ${H}\n`)
    const p = await open(W, H)
    await p.evaluate(() => document.querySelector("[data-theme-marketplace-open='heading']").scrollIntoView({ block: "center" }))
    await sleep(100)
    await press(p, phone, "[data-theme-marketplace-open='heading']")
    await sleep(600)

    /* Deep in the list: the third card from the end, in the middle of the window. */
    const slug = await p.evaluate(() => {
      const cells = [...document.querySelectorAll("[data-themes-grid] [data-template-card]")]
      const c = cells[cells.length - 3]
      c.querySelector("[data-template-preview]").scrollIntoView({ block: "center" })
      return c.getAttribute("data-template-card")
    })
    await sleep(300)
    const cover = `[data-themes-grid] [data-template-card='${slug}'] [data-template-preview]`
    const before = await where(p, slug)
    expect(before.popup === "open" && before.list > 400, "the marketplace is open, scrolled deep into its list", `${slug}, list scroll ${before.list}`)
    await shot(p, `${W}-1-marketplace`)

    await press(p, phone, cover)
    await sleep(700)
    const opened = await where(p, slug)
    expect(opened.preview && opened.search.includes("preview="), "the cover opens its preview", opened.search)
    await shot(p, `${W}-2-preview`)

    await press(p, phone, "[data-preview-close]")
    await sleep(800)
    const after = await where(p, slug)
    await shot(p, `${W}-3-after-x`)
    expect(!after.preview && after.popup === "open", "X closes the preview and only the preview: the marketplace is still open", `preview ${after.preview}, marketplace ${after.popup}`)
    expect(after.list === before.list && same(after.card, before.card), "the list is on the same scroll, the card where it was", `scroll ${before.list} -> ${after.list}, card ${before.card} -> ${after.card}`)
    expect(after.page === before.page, "the page under it did not move", `${before.page} -> ${after.page}`)
    expect(after.search === before.search, "the address is the marketplace's again", after.search)
    expect(after.focus === slug, "the focus is back on the cover that opened it", String(after.focus))

    if (after.popup !== "open") {
      await p.close()
      continue
    }
    /* Again: a second preview and X, still the same place. */
    await press(p, phone, cover)
    await sleep(700)
    await press(p, phone, "[data-preview-close]")
    await sleep(800)
    const again = await where(p, slug)
    expect(!again.preview && again.popup === "open" && again.list === before.list && again.search === before.search, "a second preview and X: the same place again", JSON.stringify(again))

    /* Back from there: the marketplace closes and the Website page is where it was. */
    await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => null)
    await sleep(700)
    const back = await where(p, null)
    expect(back.popup === null && back.search === "" && back.page === before.page, "Back then closes the marketplace, on the Website page where it was", JSON.stringify(back))

    /* A cover on the page itself: X lands on the page at its scroll. */
    await p.evaluate(() => document.querySelector("[data-theme-grid] [data-template-preview]").scrollIntoView({ block: "center" }))
    await sleep(150)
    const onPage = await where(p, null)
    await press(p, phone, "[data-theme-grid] [data-template-preview]")
    await sleep(700)
    await press(p, phone, "[data-preview-close]")
    await sleep(800)
    const pageAfter = await where(p, null)
    expect(!pageAfter.preview && pageAfter.popup === null && pageAfter.page === onPage.page && pageAfter.search === "", "a cover on the page: X lands on the page at its scroll", `${onPage.page} -> ${pageAfter.page}, ${pageAfter.search}`)
    await p.close()
  }
  server.close()
} finally {
  if (browser) await browser.close()
  rmSync(out, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
