/**
 * ===========================================================================
 *  ROUND 11, STORE: ADD TO CART WHILE IT WORKS, AND PAY IN ITS PLACE
 * ===========================================================================
 * Two of the owner's asks, in Chromium, on a phone (390x844, touch, the CPU
 * slowed four times) and a laptop (1440x900):
 *
 *   ADD TO CART  An imported theme's product page (scripts/render-store-r11-
 *                theme.ts), served by the live site's own handler, with an
 *                Add to cart in a main product section (Dawn's way), a
 *                featured product section (aria-busy) and a product card's
 *                quick add (busy on the form), each with a cart icon. Each
 *                is pressed (a tap on the phone) while every frame is
 *                sampled: while the spinner shows, the icon is never
 *                visible; the button never changes width or height; once
 *                the line is in, the drawer slides open and the icon is
 *                back; a sold out option's error puts the icon back too.
 *   CHECKOUT     Every checkout (scripts/render-store-r11.tsx): nothing is
 *                pinned to the foot of the screen (no fixed or sticky box
 *                anchored to the bottom), Pay's box is in the normal flow,
 *                and a picture of the bottom of each page on the phone.
 *
 *   PROBE_CSS=source node scripts/check-store-r11.mjs
 *   ONLY=atc or ONLY=checkout     one half
 *   NO_FIX=1                      the theme page without Storelib's rule: the ADD TO CART half should fail
 *   SHOTS_DIR=...                 where the pictures go
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-store-r11-")), "shots")
mkdirSync(shots, { recursive: true })
const only = process.env.ONLY || ""
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`.slice(0, 420)}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const esbuild = join(root, "node_modules/.bin/esbuild")
const stubs = join(root, ".store-r11-probe")
mkdirSync(stubs, { recursive: true })

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const LAPTOP = { width: 1440, height: 900 }
const SIZES = [["phone 390, touch, CPU 4x slower", PHONE, "390"], ["laptop 1440", LAPTOP, "1440"]]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, timeout: 180000, protocolTimeout: 300000, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage"] })
async function newPage(vp) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  if (vp.isMobile) {
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  return p
}

try {
  /* ── ADD TO CART ─────────────────────────────────────────────────────── */
  if (!only || only === "atc") {
    /* `server-only` is the empty marker it is on the server. */
    writeFileSync(join(stubs, "server-only.js"), "export {}\n")
    execFileSync(esbuild, [join(root, "scripts/render-store-r11-theme.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${join(stubs, "theme.mjs")}`, `--alias:@=${root}`, `--alias:server-only=${join(stubs, "server-only.js")}`, "--packages=external", "--log-level=error"], { cwd: root, stdio: "inherit" })
    const { startThemeServer } = await import(join(stubs, "theme.mjs"))
    const { origin, server } = await startThemeServer()
    const BUTTONS = [
      ["main", "main product section (Dawn: `loading` on the button, label made clear)"],
      ["featured", "featured product section (aria-busy, the label stays)"],
      ["card", "a product card's quick add (busy on the form)"],
      ["error", "a sold out option: the theme's error"],
    ]
    for (const [label, vp, tag] of SIZES) {
      console.log(`\nADD TO CART, ${label}${process.env.NO_FIX ? " (NO_FIX: Storelib's rule taken out)" : ""}`)
      const p = await newPage(vp)
      const errors = []
      p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      await p.goto(`${origin}/products/stoneware-mug`, { waitUntil: "load" })
      await sleep(400)
      expect(await p.evaluate(() => !!document.querySelector("style[data-sl-busy-buttons]")) === !process.env.NO_FIX, "the page carries Storelib's busy-button rule in its head")
      for (const [which, what] of BUTTONS) {
        await p.evaluate(() => window.__closeDrawer())
        await sleep(400)
        await p.evaluate((w) => document.querySelector(`[data-probe="${w}"]`).scrollIntoView({ block: "center" }), which)
        await sleep(250)
        await p.evaluate((w) => {
          const b = document.querySelector(`[data-probe="${w}"]`)
          const f = b.closest("form")
          const icon = b.querySelector(".icon")
          const spin = b.querySelector(".loading__spinner,.btn__spinner,.quick-add__loader")
          window.__frames = []
          window.__run = true
          const tick = (t) => {
            const r = b.getBoundingClientRect()
            const ss = getComputedStyle(spin)
            const is = getComputedStyle(icon)
            window.__frames.push({
              t: Math.round(t),
              busy: b.classList.contains("loading") || b.getAttribute("aria-busy") === "true" || f.classList.contains("is-loading"),
              spinner: ss.display !== "none" && ss.visibility === "visible" && spin.getBoundingClientRect().width > 0,
              icon: is.visibility === "visible" && is.display !== "none" && Number(is.opacity) > 0,
              w: Math.round(r.width * 10) / 10,
              h: Math.round(r.height * 10) / 10,
            })
            if (window.__run) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }, which)
        await sleep(120)
        if (vp.hasTouch) await p.tap(`[data-probe="${which}"]`)
        else await p.click(`[data-probe="${which}"]`)
        /* The picture mid-press: the spinner, no icon. */
        await sleep(vp.isMobile ? 260 : 180)
        await p.screenshot({ path: join(shots, `atc-${which}-busy-${tag}.png`) })
        await p.waitForFunction(() => window.__frames.some((f) => f.busy) && !window.__frames[window.__frames.length - 1].busy, { timeout: 15000 }).catch(() => {})
        await sleep(650)
        const frames = await p.evaluate(() => { window.__run = false; return window.__frames })
        const spinning = frames.filter((f) => f.spinner)
        const first = frames[0]
        const last = frames[frames.length - 1]
        const drawer = await p.evaluate(() => { const d = document.querySelector("cart-drawer"); const r = d.getBoundingClientRect(); return { open: d.classList.contains("active"), left: Math.round(r.left), lines: d.querySelectorAll(".line").length } })
        const err = await p.evaluate((w) => document.querySelector(`[data-probe="${w}"]`).closest("form").querySelector(".error")?.textContent ?? null, which)
        console.log(`  ${what}`)
        expect(spinning.length >= 3, "    the spinner shows while it works", `${spinning.length} of ${frames.length} frames`)
        expect(spinning.every((f) => !f.icon), "    and in every one of those frames the icon is not visible", spinning.filter((f) => f.icon).length + " frames with both")
        const sizes = [...new Set(frames.map((f) => `${f.w}x${f.h}`))]
        expect(sizes.length === 1, "    the button never changes size", sizes)
        expect(!last.busy && !last.spinner && last.icon, "    afterwards: the spinner is gone and the icon is back", last)
        if (which === "error") {
          expect(!!err && !drawer.open, "    the theme's error shows and the drawer stays shut", { err, drawer })
        } else {
          expect(drawer.open && drawer.left < vp.width && drawer.lines >= 1, "    the line is in and the drawer slid open", drawer)
          await p.screenshot({ path: join(shots, `atc-${which}-drawer-${tag}.png`) })
        }
        void first
      }
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
    server.close()
  }

  /* ── CHECKOUT ────────────────────────────────────────────────────────── */
  if (!only || only === "checkout") {
    writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/checkout"
export const useRouter = () => ({ push(u) { window.__pushed = u }, prefetch() {}, replace(u) { window.__replaced = u }, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
    writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
    writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
    writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-store-r11.tsx")}"
window.__errors = []
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
    execFileSync(esbuild, [
      join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(stubs, "probe.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:next/image=${join(stubs, "image.jsx")}`, `--alias:@=${root}`,
      "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      "--log-level=error",
    ], { cwd: root, stdio: "inherit" })
    const bundle = readFileSync(join(stubs, "probe.js"))
    const css = await appCss(root)
    const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;background:#fff}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/probe.js"></script></body></html>`
    const server = createServer((req, res) => {
      if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
      res.writeHead(200, { "content-type": "text/html" })
      res.end(html)
    })
    await new Promise((r) => server.listen(0, "127.0.0.1", r))
    const origin = `http://127.0.0.1:${server.address().port}`
    const CASES = [
      ["digital", "a single product (card)"],
      ["free", "a free product"],
      ["membership", "a membership"],
      ["site", "a website's cart (imported or built themes)"],
      ["site-cod", "a website's cart with cash on delivery"],
      ["physical", "Storelib's cart checkout for things that ship"],
      ["physical-cod", "the same with cash on delivery"],
    ]
    /* Every box with something to press pinned to the foot of the screen: fixed or sticky with a bottom of its own, and on screen (the desktop's plain white panel behind the summary has nothing in it). */
    const pinned = (p) => p.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("body *")) {
        const s = getComputedStyle(el)
        if ((s.position !== "fixed" && s.position !== "sticky") || s.bottom === "auto" || s.display === "none" || s.visibility === "hidden") continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < window.innerHeight - 8 || r.top > window.innerHeight) continue
        if (!el.querySelector("button,a[href],input,[role=button]")) continue
        out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), position: s.position, bottom: s.bottom, h: Math.round(r.height), buttons: el.querySelectorAll("button").length })
      }
      return out
    })
    for (const [label, vp, tag] of SIZES) {
      console.log(`\nCHECKOUT, ${label}`)
      for (const [which, what] of CASES) {
        const p = await newPage(vp)
        await p.setRequestInterception(true)
        p.on("request", (r) => (r.url().startsWith(origin) ? r.continue() : r.respond({ status: 204, body: "" })))
        await p.goto(`${origin}/?case=${which}`, { waitUntil: "load", timeout: 180000 })
        const drew = await p.waitForSelector(`[data-case="${which}"]`, { timeout: 60000 }).then(() => true, () => false)
        if (!drew) { expect(false, `${what}: drew`, await p.evaluate(() => window.__errors)); await p.close(); continue }
        await sleep(vp.isMobile ? 1600 : 800)
        await p.evaluate(() => window.scrollTo(0, 0))
        await sleep(250)
        const top = await pinned(p)
        await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await sleep(400)
        const bottom = await pinned(p)
        const dock = await p.evaluate(() => {
          const d = document.querySelector("[data-pay-dock]")
          if (!d) return null
          const r = d.getBoundingClientRect()
          return { position: getComputedStyle(d).position, top: Math.round(r.top), bottom: Math.round(r.bottom), button: (d.querySelector("button")?.textContent ?? "").trim().slice(0, 30) }
        })
        const page = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
        console.log(`  ${what}`)
        expect(top.length === 0 && bottom.length === 0, "    nothing is pinned to the foot of the screen, at the top of the page or at its end", { top, bottom })
        if (dock) expect(dock.position === "static", "    Pay's box is in the normal flow, at the end of the form", dock)
        expect(page.sideways <= 0, "    nothing scrolls sideways", page)
        await p.screenshot({ path: join(shots, `checkout-${which}-bottom-${tag}.png`) })
        await p.close()
      }
    }
    server.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
