/**
 * ===========================================================================
 *  ADD FROM THE MARKETPLACE: ADDING, IT CLOSES, THE PAGE GOES TO THE NEW ROW (round 67)
 * ===========================================================================
 * The owner: "Adding a theme to the library from the marketplace preview:
 * show Adding, close the marketplace modal, smooth scroll the website
 * builder page to the newly added theme."
 *
 * The real Website page (scripts/render-theme-popup-probe.tsx, ?land=1) in
 * Chromium at 1280 x 800 and 390 x 844: the marketplace opened, a
 * template's preview opened from it, Add pressed in the preview. Sampled:
 * the button's words a moment after the press, whether the preview and the
 * marketplace are gone, the page's scroll over time (each frame's step, so a
 * jump shows), and where the new website's row ends up.
 *
 *   node scripts/check-theme-add-r67.mjs     SHOTS=dir saves pictures
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
const out = mkdtempSync(join(tmpdir(), "storelib-add-r67-"))
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
    /* The add answers after a moment, as the server does: the website made. */
    if (url.pathname === "/api/themes/marketplace/add") {
      return setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ ok: true, install_id: "new-1", cover_pending: false }))
      }, 900)
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
    await p.goto(`${origin}/app/website-builder?land=1`, { waitUntil: "networkidle0", timeout: 60_000 })
    await p.waitForSelector("[data-wb-page]")
    await sleep(150)
    return p
  }
  const press = (p, phone, sel) => (phone ? p.tap(sel) : p.click(sel))
  for (const [W, H] of [[1280, 800], [390, 844]]) {
    const phone = W < 768
    const p = await open(W, H)
    await press(p, phone, '[data-theme-marketplace-open="heading"]')
    await sleep(700)
    /* A template's preview, from its cover in the marketplace. */
    const opened = await p.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]')
      /* A free template not in the library yet: its card has Add. */
      const add = dlg?.querySelector('[data-template-action="add"]')
      let card = add?.parentElement
      while (card && !card.querySelector("button[aria-label^='Preview']")) card = card.parentElement
      const b = card?.querySelector("button[aria-label^='Preview']")
      if (!b) return false
      b.click()
      return true
    })
    expect(opened, `${W}: a template's preview opens from the marketplace`)
    await sleep(900)
    const before = await p.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
    const addAt = await p.evaluate(() => {
      const dlgs = [...document.querySelectorAll('[role="dialog"]')]
      const top = dlgs[dlgs.length - 1]
      const b = top?.querySelector('[data-template-action="add"]')
      if (!b) return null
      b.setAttribute("data-r67-add", "")
      return true
    })
    expect(addAt === true, `${W}: the preview has Add`)
    if (!addAt) { await p.close(); continue }
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `add-${W}-0-before.png`) })
    /* Every frame's scroll of the page, from the press. */
    await p.evaluate(() => {
      const s = document.querySelector(".page-scroll")
      window.__scrolls = []
      const t0 = performance.now()
      const tick = () => { window.__scrolls.push([Math.round(performance.now() - t0), s ? s.scrollTop : -1]); if (performance.now() - t0 < 4500) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await press(p, phone, "[data-r67-add]")
    await sleep(150)
    const words = await p.evaluate(() => {
      const b = document.querySelector("[data-r67-add]")
      return b ? `${b.getAttribute("data-template-action")} ${(b.textContent ?? "").trim()}` : "(gone)"
    })
    expect(/Adding/.test(words), `${W}: a moment after the press the button says Adding`, words)
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `add-${W}-1-adding.png`) })
    await sleep(700)
    const dialogs = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getBoundingClientRect().width > 0 && getComputedStyle(d).opacity !== "0").length)
    expect(before >= 1 && dialogs === 0, `${W}: then the preview and the marketplace have both gone`, `${before} open before, ${dialogs} after`)
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `add-${W}-2-closed.png`) })
    await sleep(3000)
    const end = await p.evaluate(() => {
      const row = document.querySelector('[data-install-row="new-1"]')
      const s = document.querySelector(".page-scroll")
      if (!row || !s) return null
      const r = row.getBoundingClientRect()
      const v = s.getBoundingClientRect()
      return { rowMid: Math.round(r.top + r.height / 2), viewMid: Math.round(v.top + v.height / 2), height: Math.round(v.height), url: location.search }
    })
    expect(!!end && Math.abs(end.rowMid - end.viewMid) < end.height * 0.25, `${W}: the new website's row ends near the middle of the screen`, JSON.stringify(end))
    expect(!!end && !/themes=|preview=/.test(end.url), `${W}: and the address no longer opens the marketplace`, end?.url)
    const scrolls = await p.evaluate(() => window.__scrolls)
    const moved = scrolls.filter((s, i) => i > 0 && s[1] !== scrolls[i - 1][1])
    const biggest = Math.max(0, ...scrolls.slice(1).map((s, i) => Math.abs(s[1] - scrolls[i][1])))
    const first = moved[0]?.[0] ?? null
    const total = scrolls.length ? scrolls[scrolls.length - 1][1] - scrolls[0][1] : 0
    expect(Math.abs(total) < 40 || (moved.length >= 6 && biggest < Math.max(120, Math.abs(total) * 0.5)), `${W}: the page scrolls there over several frames, no jump (or the row was already in the middle)`, `moved ${total}px over ${moved.length} frames, largest step ${biggest}px, first at ${first} ms`)
    expect(first === null || first >= 400, `${W}: and only once the marketplace has left (first move at ${first} ms)`)
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `add-${W}-3-landed.png`) })
    await p.close()
  }
  server.close()
} finally {
  await browser?.close()
  rmSync(out, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
