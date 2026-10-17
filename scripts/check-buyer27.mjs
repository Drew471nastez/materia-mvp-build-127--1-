/**
 * ===========================================================================
 *  ROUND 27 BUYER ORDER PAGES, IN THE REAL COMPONENTS (tests/buyer27.test.ts)
 * ===========================================================================
 * Mounts the real buyer screens (scripts/render-buyer27.tsx, every /api
 * answered from demo data) in Romanian and English, at 1440x900, 1024x768,
 * 820x1180 and 390x844 on a touch phone with the CPU slowed four times, and
 * reads what they draw:
 *
 *   confirmed   the shop's logo and Visit store; the method and its estimate
 *               on two lines; the steps never cut; Email the shop opens a
 *               letter; Cancel order cancels and the page reads cancelled
 *   shipped     each parcel with its carrier's mark and what is in it
 *   delivered   Return items: steppers that stop at what can go back, big
 *               enough to press on a phone, the button says how many
 *   thanks      the thank you page: number, lines, code, address, method
 *
 * Nothing scrolls sideways at any width.
 *
 *   node scripts/check-buyer27.mjs [out dir for the screenshots]
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const shots = process.argv[2] ?? join(tmpdir(), "buyer27")
mkdirSync(shots, { recursive: true })
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const out = join(root, ".buyer27-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
/* router.refresh draws the page again, as the server would after a cancel. */
writeFileSync(join(out, "navigation.js"), `export function useRouter() { return { refresh: () => window.__probeRefresh?.(), push() {}, replace() {}, back() {}, prefetch() {} } }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() { throw new Error("redirect in a probe") }
export function notFound() { throw new Error("notFound in a probe") }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-buyer27.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', '--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY="ron"', '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
  `--alias:server-only=${join(out, "empty.js")}`,
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "inherit", "inherit"] })
const bundle = readFileSync(join(out, "probe.js"))
rmSync(out, { recursive: true, force: true })
const css = await appCss(root)
const fonts = (() => { try { return interFaces(root) } catch { return "" } })()
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.split("?")[0] === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], headless: true })
let failed = 0
const check = (label, ok, detail) => {
  if (!ok) failed++
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${!ok && detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
}
const SIZES = [
  { tag: "1440", width: 1440, height: 900 },
  { tag: "1024", width: 1024, height: 768 },
  { tag: "820", width: 820, height: 1180 },
  { tag: "390", width: 390, height: 844, phone: true },
]
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

for (const lang of ["ro", "en"]) {
  for (const size of SIZES) {
    const page = await browser.newPage()
    await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: size.phone ? 3 : 1, isMobile: !!size.phone, hasTouch: !!size.phone })
    if (size.phone) {
      const cdp = await page.target().createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    }
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    const tag = `${lang}-${size.tag}`
    console.log(`\n${tag} ${size.width}x${size.height}${size.phone ? ", touch, CPU x4" : ""}`)
    const open = async (view) => {
      await page.goto(`${base}/?view=${view}&lang=${lang}`, { waitUntil: "load" })
      await page.waitForSelector("main, [data-page]", { timeout: 15000 }).catch(() => undefined)
      await page.evaluate(() => document.fonts.ready)
      await wait(150)
    }

    /* confirmed */
    await open("confirmed")
    const c = await page.evaluate(() => {
      const est = document.querySelector("[data-delivery-estimate]")
      const ps = est ? [...est.querySelectorAll("p")].map((p) => p.textContent) : []
      const logo = document.querySelector("[data-shop-logo]")
      const visit = document.querySelector("[data-visit-store]")
      const mail = document.querySelector("[data-email-shop]")
      const steps = [...document.querySelectorAll("[data-order-steps] li p")].map((p) => ({ t: p.textContent, cut: p.scrollWidth > p.clientWidth + 1 }))
      const help = document.querySelector("[data-order-help]")
      return { ps, logo: logo ? { w: logo.getBoundingClientRect().width, h: logo.getBoundingClientRect().height, ok: logo.complete && logo.naturalWidth > 0 } : null, visit: visit?.getAttribute("href"), mail: mail?.getAttribute("href") ?? null, steps, helpMail: help?.querySelector("a[href^='mailto:']")?.getAttribute("href") ?? null, h1: document.querySelector("h1")?.textContent }
    })
    check("the shop's logo draws, at a header's size", !!c.logo && c.logo.ok && c.logo.h >= 30 && c.logo.h <= 34, c.logo)
    check("Visit store goes to the website the order came from", c.visit === "https://andrewrullz.storelib.com", c.visit)
    check("the method and its estimate are two lines, never glued", c.ps.length === 2 && c.ps[0] === "Standard" && (lang === "ro" ? c.ps[1] === "Ajunge de obicei în 3–5 zile lucrătoare de la expediere." : c.ps[1] === "Usually arrives 3 to 5 business days after it ships."), c.ps)
    check("the four steps read whole", c.steps.length >= 4 && c.steps.every((s) => !s.cut), c.steps)
    check("  the second is being prepared", c.steps.some((s) => s.t === (lang === "ro" ? "În pregătire" : "Being prepared")), c.steps.map((s) => s.t))
    const subject = c.mail ? decodeURIComponent(c.mail.split("subject=")[1].split("&")[0]) : ""
    check("Email the shop opens a letter about this order, in the help panel too", subject === (lang === "ro" ? "Întrebare despre comanda #DA0D603D" : "Question about order #DA0D603D") && c.helpMail === c.mail, { subject, helpMail: c.helpMail === c.mail })
    check("nothing scrolls sideways", await noSideways(page))
    await page.screenshot({ path: join(shots, `${tag}-confirmed.png`), fullPage: true })

    /* cancel */
    await page.click("[data-cancel-button]")
    await page.waitForSelector("[data-cancel-form]")
    await wait(400)
    const form = await page.evaluate(() => ({ mode: document.querySelector("[data-cancel-form]")?.getAttribute("data-cancel-mode"), text: document.querySelector("[data-cancel-form] p")?.textContent }))
    check("Cancel order says it cancels right away and what comes back", form.mode === "now" && (lang === "ro" ? /se anulează imediat, iar 209,00\s?lei se întorc/.test(form.text) : /cancelled right away and 209\.00\s?lei goes back/.test(form.text)), form)
    await page.screenshot({ path: join(shots, `${tag}-cancel-form.png`), fullPage: false, clip: await page.evaluate(() => { const r = document.querySelector("[data-cancel-form]").getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top + window.scrollY - 16), width: window.innerWidth, height: Math.min(r.height + 32, 900) } }) })
    await page.click("[data-cancel-confirm]")
    await page.waitForFunction(() => /anulat|cancelled/i.test(document.querySelector("h1")?.textContent ?? ""), { timeout: 8000 }).catch(() => undefined)
    await wait(300)
    const after = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, refund: document.querySelector("[data-order-cancelled]")?.textContent, calls: window.__calls.filter((x) => x.includes("/cancel")) }))
    check("pressed: the request goes, the page reads cancelled with the refund", after.calls.length === 1 && (lang === "ro" ? after.h1 === "Comanda ta a fost anulată" : after.h1 === "Your order was cancelled") && /209,00|209\.00/.test(after.refund ?? ""), after)
    await page.screenshot({ path: join(shots, `${tag}-cancelled.png`), fullPage: true })

    /* shipped */
    await open("shipped")
    const s = await page.evaluate(() => ({
      marks: [...document.querySelectorAll("[data-shipment-status] [data-carrier-logo]")].map((m) => m.getAttribute("data-carrier-logo")),
      inside: [...document.querySelectorAll("[data-shipment-items]")].map((u) => u.textContent),
      progress: [...document.querySelectorAll("[data-line-progress]")].map((p) => p.textContent),
    }))
    check("each parcel has its carrier's mark", s.marks.join() === "FAN Courier,DPD", s.marks)
    check("each parcel says what is in it; a line half sent says so", s.inside.length === 2 && s.progress.length >= 1, s)
    check("nothing scrolls sideways", await noSideways(page))
    await page.screenshot({ path: join(shots, `${tag}-shipped.png`), fullPage: true })

    /* delivered: return */
    await open("delivered")
    await page.click("[data-return-button]")
    await page.waitForSelector("[data-return-form]")
    await wait(400)
    const plus = await page.$$("[data-return-stepper] button:last-child")
    const box = await plus[0].boundingBox()
    check("the stepper's buttons are big enough to press", size.phone ? box.width >= 40 && box.height >= 40 : box.width >= 36, box)
    if (size.phone) { await plus[0].tap(); await wait(120); await plus[0].tap(); await wait(120); await plus[0].tap() } else { await plus[0].click(); await plus[0].click(); await plus[0].click() }
    await wait(200)
    const r = await page.evaluate(() => {
      const first = document.querySelector("[data-return-stepper]")
      return { value: first.querySelector("output").textContent, plusDisabled: first.querySelector("button:last-child").disabled, submit: document.querySelector("[data-return-submit]").textContent, hint: document.querySelector("[data-return-form] h2 + p")?.textContent ?? null }
    })
    check("it stops at what can go back (2) and the button says how many", r.value === "2" && r.plusDisabled && (lang === "ro" ? r.submit === "Returnează 2 produse" : r.submit === "Request return of 2 items"), r)
    check("the window is the seller's: a date, counted from delivery", !!r.hint && (lang === "ro" ? /^Până pe /.test(r.hint) : /^Until /.test(r.hint)), r.hint)
    check("nothing scrolls sideways", await noSideways(page))
    await page.screenshot({ path: join(shots, `${tag}-return.png`), fullPage: false, clip: await page.evaluate(() => { const el = document.querySelector("[data-return-form]"); el.scrollIntoView({ block: "start" }); const b = el.getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top + window.scrollY - 12), width: window.innerWidth, height: Math.min(b.height + 24, 1400) } }) })
    await page.click("[data-return-submit]")
    await page.waitForSelector("[data-return-sent]", { timeout: 8000 }).catch(() => undefined)
    const sent = await page.evaluate(() => ({ sent: !!document.querySelector("[data-return-sent]"), call: window.__calls.find((x) => x.includes("/return")) ?? null }))
    check("the request sends 2 of the first line", sent.sent && /"quantity":2/.test(sent.call ?? ""), sent)

    /* thanks */
    await open("thanks")
    const t = await page.evaluate(() => ({ number: document.querySelector("[data-order-number]")?.textContent, delivery: [...(document.querySelector("[data-thanks-delivery]")?.querySelectorAll("p") ?? [])].map((p) => p.textContent) }))
    check("the thank you page: number, address, method then estimate", /#DA0D603D/.test(t.number ?? "") && t.delivery.includes("Standard") && t.delivery.some((x) => /3–5|3 to 5/.test(x)), t)
    check("nothing scrolls sideways", await noSideways(page))
    await page.screenshot({ path: join(shots, `${tag}-thanks.png`), fullPage: true })

    check("no errors on the page", errors.length === 0, errors)
    await page.close()
  }
}

await browser.close()
server.close()
console.log(`\nscreenshots in ${shots}`)
console.log(failed ? `\n${failed} failed` : "\nall ok")
process.exit(failed ? 1 : 0)
