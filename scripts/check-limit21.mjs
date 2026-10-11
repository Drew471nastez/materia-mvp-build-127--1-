/**
 * ===========================================================================
 *  LIMIT SALES FOR A DOWNLOAD, MEASURED (round 21)
 * ===========================================================================
 * The real components in headless Chromium, at 390x844 touch with the CPU
 * slowed four times, and at 1440x900:
 *
 *   THE EDITOR   a saved limit opens on, with its number and "97 of 100
 *                sold" under it; a lower number says Sold out there; the
 *                toggle off hides both; Save writes `sales_limit` to the
 *                product in a request of its own (the stand-in database
 *                below reads it back), and off writes null.
 *   THE SHOP     the product page's buy box says Sold out, disabled, where
 *                the buy button was; three left says "Only 3 left" under a
 *                working button; the Explore card (the creator page draws the
 *                same card) says Sold out beside its price. Nothing scrolls
 *                sideways.
 *
 *   node scripts/check-limit21.mjs        (SHOTS_DIR=<dir> keeps the pictures)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const inter = interFaces(root)
const stubs = join(root, ".limit21-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-limit21-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, refresh: () => {} }
export const usePathname = () => "/app/products/x"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, placeholder, blurDataURL, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)
  writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-limit21.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      react: join(root, "node_modules/next/dist/compiled/react"),
      "react-dom": join(root, "node_modules/next/dist/compiled/react-dom"),
      "next/navigation": "./.limit21-probe/navigation.js",
      "next/link": "./.limit21-probe/link.jsx",
      "next/image": "./.limit21-probe/image.jsx",
    },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: [{ name: "server-action-stub", setup(b) { b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") })) } }],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const phone = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const desk = { width: 1440, height: 900 }

  const open = async (vp, query, slow) => {
    const p = await browser.newPage()
    const errors = []
    const writes = []
    p.on("pageerror", (e) => errors.push(e.message))
    p.on("dialog", (d) => d.accept().catch(() => {}))
    await p.setRequestInterception(true)
    /* The database's REST calls answered by a stand-in: a write is kept to read back, a read gets the saved row. */
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("file:") || u.startsWith("data:")) return r.continue()
      if (/\/rest\/v1\//.test(u)) {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }
        if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: cors })
        if (r.method() !== "GET" && r.method() !== "HEAD") writes.push({ method: r.method(), url: u.replace(/\?.*/, ""), body: r.postData() })
        const one = /vnd\.pgrst\.object/.test(r.headers()["accept"] || "")
        const row = { id: "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6", slug: "drum-pack", status: "published", archived: false }
        return r.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(one ? row : []) }).catch(() => {})
      }
      r.abort()
    })
    await p.setViewport(vp)
    if (slow) {
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    }
    await p.goto(`file://${join(stubs, "index.html")}${query}`)
    await sleep(slow ? 2500 : 1200)
    return { p, errors, writes }
  }

  for (const [label, vp, slow] of [["phone-390", phone, true], ["desktop-1440", desk, false]]) {
    console.log(`\n${label}: the editor`)
    const { p, errors, writes } = await open(vp, "?editor", slow)
    const read = () =>
      p.evaluate(() => {
        const box = document.querySelector("[data-sales-limit]")
        const sw = [...document.querySelectorAll("[role=switch]")].find((s) => (s.getAttribute("aria-label") || "") === "Limit sales")
        return {
          on: sw ? sw.getAttribute("aria-checked") : null,
          shown: !!box,
          value: document.getElementById("sales-limit")?.value ?? null,
          sold: document.querySelector("[data-sales-sold]")?.textContent ?? null,
          wide: document.scrollingElement.scrollWidth,
        }
      })
    const first = await read()
    expect(first.on === "true" && first.shown && first.value === "100", "a saved limit opens on, with its number", first)
    expect(first.sold === "97 of 100 sold", "copies sold from the orders, against it", first.sold)
    await p.evaluate(() => document.querySelector("[data-sales-limit]").scrollIntoView({ block: "center" }))
    await sleep(400)
    await p.screenshot({ path: join(shots, `${label}-editor-limit.png`) })
    const field = await p.evaluate(() => {
      const r = document.getElementById("sales-limit").getBoundingClientRect()
      const s = document.querySelector("[data-sales-sold]").getBoundingClientRect()
      return { h: Math.round(r.height), soldBelow: s.top >= r.bottom, soldLeft: Math.round(s.left - r.left) }
    })
    expect(field.h >= (vp.width < 640 ? 44 : 36) && field.soldBelow && Math.abs(field.soldLeft) <= 1, "the box is a finger's height on a phone, the line under it on its left edge", field)

    await p.$eval("#sales-limit", (el) => { el.focus(); el.select() })
    await p.keyboard.type("90")
    await sleep(300)
    const lower = await read()
    expect(lower.value === "90" && /^97 of 90 sold · Sold out$/.test(lower.sold || ""), "a number under what has sold says Sold out there", lower.sold)
    await p.$eval("#sales-limit", (el) => { el.focus(); el.select() })
    await p.keyboard.type("0a25o0")
    await sleep(200)
    expect((await read()).value === "250", "the box takes digits only, no leading zero", (await read()).value)
    await p.screenshot({ path: join(shots, `${label}-editor-typed.png`) })

    /* Save: the product, then the limit in a request of its own. */
    await p.keyboard.down(process.platform === "darwin" ? "Meta" : "Control")
    await p.keyboard.press("s")
    await p.keyboard.up(process.platform === "darwin" ? "Meta" : "Control")
    await sleep(slow ? 4000 : 2000)
    const limitWrites = writes.filter((w) => w.method === "PATCH" && /sales_limit/.test(w.body || ""))
    expect(limitWrites.length === 1 && JSON.parse(limitWrites[0].body).sales_limit === 250, "Save writes sales_limit 250 to the product", limitWrites.map((w) => w.body))
    expect(writes.some((w) => w.method === "PATCH" && !/sales_limit/.test(w.body || "") && /"title"/.test(w.body || "")), "in its own request, after the product's own write", writes.map((w) => (w.body || "").slice(0, 40)))

    await p.evaluate(() => [...document.querySelectorAll("[role=switch]")].find((s) => s.getAttribute("aria-label") === "Limit sales").click())
    await sleep(300)
    const off = await read()
    expect(off.on === "false" && !off.shown, "off hides the number and the count", off)
    const before = writes.length
    await p.keyboard.down("Control")
    await p.keyboard.press("s")
    await p.keyboard.up("Control")
    await sleep(slow ? 4000 : 2000)
    const offWrite = writes.slice(before).filter((w) => /sales_limit/.test(w.body || ""))
    expect(offWrite.length === 1 && JSON.parse(offWrite[0].body).sales_limit === null, "and Save then writes no limit", offWrite.map((w) => w.body))
    expect(off.wide <= vp.width, "nothing scrolls sideways", off.wide)
    expect(errors.length === 0, "nothing threw", errors)
    await p.close()

    console.log(`\n${label}: the shop`)
    const shop = await open(vp, "?shop", slow)
    const s = await shop.p.evaluate(() => {
      const sold = document.querySelector("[data-box=sold]")
      const few = document.querySelector("[data-box=few]")
      const soldBtn = sold.querySelector("[data-sold-out]")
      const fewBtns = [...few.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().height > 30)
      const cards = [...document.querySelectorAll("[data-cards] [data-product-title]")].map((t) => {
        const card = t.closest("a")?.parentElement ?? t.parentElement
        return { title: t.textContent, soldOut: !!card.querySelector("[data-sold-out]") }
      })
      return {
        soldText: soldBtn?.textContent ?? null,
        soldDisabled: soldBtn ? soldBtn.disabled : null,
        soldHeight: soldBtn ? Math.round(soldBtn.getBoundingClientRect().height) : null,
        buyInSold: [...sold.querySelectorAll("button")].filter((b) => /buy/i.test(b.textContent)).length,
        fewLine: few.querySelector("[data-few-left]")?.textContent ?? null,
        fewBuy: fewBtns.map((b) => ({ text: b.textContent.trim(), disabled: b.disabled })),
        cards,
        wide: document.scrollingElement.scrollWidth,
      }
    })
    expect(s.soldText === "Sold out" && s.soldDisabled === true && s.buyInSold === 0, "the buy box says Sold out, disabled, and no buy button", s)
    expect(s.soldHeight >= 48, "as tall as the buy button it replaces", s.soldHeight)
    expect(s.fewLine === "Only 3 left" && s.fewBuy.some((b) => /buy/i.test(b.text) && !b.disabled), "three left: Only 3 left under a working buy button", { line: s.fewLine, buttons: s.fewBuy })
    expect(s.cards.length === 2 && s.cards[0].soldOut && !s.cards[1].soldOut, "the card says Sold out, the other card does not", s.cards)
    expect(s.wide <= vp.width, "nothing scrolls sideways", s.wide)
    await shop.p.screenshot({ path: join(shots, `${label}-shop.png`), fullPage: true })
    expect(shop.errors.length === 0, "nothing threw", shop.errors)
    await shop.p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall good")
process.exit(broken ? 1 : 0)
