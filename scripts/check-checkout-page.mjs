/**
 * ===========================================================================
 *  THE CHECKOUT, MEASURED
 * ===========================================================================
 * The real checkout page (scripts/render-checkout.tsx), served at a
 * storelib.com address inside the browser so the live Stripe.js draws its
 * own fields, at 1440x900 and on a 390x844 phone:
 *
 *   LOADS      the card form draws, and no skeleton is left
 *   SPLIT      the order on grey at the left, the form on white at the right
 *              with a shadow between them; on a phone the order above
 *   ORDER      the line says Qty 1 and has nothing on its picture; the big
 *              total; Add promotion code is a grey button that opens into
 *              the field; the chosen tip is white in a grey track, not black
 *   PHONE      the order is open as the page arrives and folds; nothing
 *              scrolls sideways; fields are 16px so iOS does not zoom
 *   BAR        a white bar on a layered shadow: Back as a 36px raised circle
 *              in a 44px target, the creator linking to their page, and
 *              Continue shopping
 *   PAY        48px, an 8px corner; "Powered by stripe · Terms · Privacy"
 *   BACK       a press is answered at once (the spinner and the dim wait
 *              250ms, so a quick back shows neither), and never pushes
 *
 *   PROBE_CSS=source node scripts/check-checkout-page.mjs
 *   Needs the network (Stripe) and, in the sandbox, SPKI for the proxy CA.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".checkout-page-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-checkout-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PK = process.env.STRIPE_PK || ""

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => "/checkout"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-checkout.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": JSON.stringify(PK) },
    alias: { "@": ".", "next/navigation": "./.checkout-page-probe/navigation.js", "next/link": "./.checkout-page-probe/link.jsx", "next/image": "./.checkout-page-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const args = ["--no-sandbox"]
  if (process.env.HTTPS_PROXY) args.push("--proxy-server=" + process.env.HTTPS_PROXY)
  if (process.env.SPKI) args.push("--ignore-certificate-errors-spki-list=" + process.env.SPKI)
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args })
  for (const [label, vp] of [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    console.log(`\n${label}`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith("https://storelib.com/__checkout_probe") ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.continue()))
    await p.goto("https://storelib.com/__checkout_probe", { waitUntil: "domcontentloaded" })
    const t0 = Date.now()
    const drew = await p
      .waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => f.name.startsWith("__privateStripeFrame") && f.getBoundingClientRect().height > 150), { timeout: 20000 })
      .then(() => true, () => false)
    expect(drew, "LOADS: the card form draws", Date.now() - t0 + "ms")
    await sleep(800)
    const left = await p.evaluate(() => ({ shimmers: document.querySelectorAll(".checkout-shimmer").length, failed: !!document.querySelector("[data-pay-failed]") }))
    expect(left.shimmers === 0 && !left.failed, "and no skeleton or failure is left", left)

    const layout = await p.evaluate(() => {
      const s = document.querySelector("[data-summary]").getBoundingClientRect()
      const f = document.querySelector("main").getBoundingClientRect()
      return { summaryX: Math.round(s.left), formX: Math.round(f.left), summaryY: Math.round(s.top), formY: Math.round(f.top), bg: getComputedStyle(document.querySelector("[data-page=checkout]")).backgroundColor }
    })
    if (label.startsWith("desktop")) expect(layout.summaryX < layout.formX && layout.summaryY === layout.formY && layout.bg === "rgb(246, 247, 248)", "SPLIT: the order left on grey, the form right", layout)
    else expect(layout.summaryY < layout.formY, "SPLIT: on a phone the order is above the form", layout)

    const order = await p.evaluate(() => {
      const li = document.querySelector("[data-line-item]")
      const on = [...document.querySelectorAll('[data-tip] [role="radio"]')].find((b) => b.getAttribute("aria-checked") === "true")
      return {
        qty: li.textContent.includes("Qty 1"),
        badge: !!li.querySelector('[aria-label="Quantity 1"]'),
        total: document.querySelector("[data-total]").textContent,
        promo: document.querySelector('[data-promo="add"]')?.textContent,
        promoBg: getComputedStyle(document.querySelector('[data-promo="add"]')).backgroundColor,
        tipOn: on && getComputedStyle(on).backgroundColor,
      }
    })
    expect(order.qty && !order.badge, "ORDER: Qty 1 on the line, nothing on the picture", order)
    expect(order.total === "$9,999.00", "the big total", order.total)
    expect(order.promo === "Add promotion code" && order.promoBg === "rgb(233, 235, 238)", "Add promotion code is a light grey button", order)
    expect(order.tipOn === "rgb(255, 255, 255)", "the chosen tip is white in its track, not black", order.tipOn)
    await p.click('[data-promo="add"]')
    await sleep(250)
    const promoOpen = await p.evaluate(() => ({ open: !!document.querySelector('[data-promo="open"]'), focused: document.activeElement?.id }))
    expect(promoOpen.open && promoOpen.focused === "discount-code", "and opens into the field, focused", promoOpen)

    const pay = await p.evaluate(() => {
      const b = document.querySelector("[data-pay]")
      const r = b.getBoundingClientRect()
      return { h: Math.round(r.height), radius: getComputedStyle(b).borderRadius, text: b.textContent, footer: document.querySelector("[data-powered-by]")?.textContent }
    })
    expect(pay.h === 48 && pay.radius === "8px", "PAY: 48px with an 8px corner", pay)
    expect(/Powered by\s*·?\s*Terms\s*·?\s*Privacy/.test(pay.footer || ""), "Powered by stripe · Terms · Privacy under it", pay.footer)

    const bar = await p.evaluate(() => {
      const back = document.querySelector("[data-back]").getBoundingClientRect()
      return {
        back: [Math.round(back.width), Math.round(back.height)],
        face: Math.round(document.querySelector("[data-back-face]").getBoundingClientRect().width),
        creator: document.querySelector("[data-creator-link]")?.getAttribute("href"),
        shop: document.querySelector("[data-continue]")?.textContent,
      }
    })
    expect(bar.back[0] >= 44 && bar.back[1] >= 44 && bar.face === 36 && bar.creator === "/lucadragoste" && bar.shop === "Continue shopping", "BAR: a raised Back with a 44px target, the creator, Continue shopping", bar)

    const name = await p.evaluate(() => ({ size: getComputedStyle(document.querySelector("#checkout-name")).fontSize, h: Math.round(document.querySelector("#checkout-name").getBoundingClientRect().height) }))
    expect(name.h === 44 && name.size === (label.startsWith("phone") ? "16px" : "15px"), "fields are 44px, 16px text on a phone and 15px on a computer", name)

    if (label.startsWith("phone")) {
      const open = await p.evaluate(() => document.querySelector("[data-line-item]").getBoundingClientRect().height > 0 && document.querySelector('[aria-controls="checkout-details"]').getAttribute("aria-expanded"))
      expect(open === "true", "PHONE: the order is open as the page arrives", open)
      await p.screenshot({ path: join(shots, `${label}-top.png`) })
      await p.click('[aria-controls="checkout-details"]')
      await sleep(450)
      const folded = await p.evaluate(() => Math.round(document.getElementById("checkout-details").getBoundingClientRect().height))
      expect(folded === 0, "and folds with Hide details", folded)
      await p.click('[aria-controls="checkout-details"]')
      await sleep(450)
    }
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(sideways <= 0, "nothing scrolls sideways", sideways)

    await p.screenshot({ path: join(shots, `${label}.png`), fullPage: true })

    await p.evaluate(() => { window.__router = []; document.querySelector("[data-back]").click() })
    await sleep(60)
    const back = await p.evaluate(() => ({ leaving: document.querySelector("[data-page=checkout]").hasAttribute("data-leaving"), opacity: getComputedStyle(document.querySelector("[data-page=checkout]")).opacity, router: window.__router }))
    expect(back.leaving && back.opacity === "1" && !back.router.some(([k]) => k === "push" || k === "link"), "BACK: answered at once without a flash, and never a push", back)
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
