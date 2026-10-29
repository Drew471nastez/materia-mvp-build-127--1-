/**
 * ===========================================================================
 *  IMPORT FROM GUMROAD, MEASURED
 * ===========================================================================
 * The import page (app/app/products/import/gumroad, drawn by
 * scripts/render-gumroad-import.tsx) in headless Chromium at 390x844 and
 * 1280x800, through its four screens with a fake API answered in the page:
 *
 *   TOKEN     the steps, the field and Find products; the field is at least
 *             44px tall on a phone; nothing scrolls sideways
 *   LIST      one row per Gumroad product, each at least 56px tall; the
 *             membership has no checkbox and says why; the one already
 *             imported links to its product; the token field is gone and
 *             the token is nowhere in the page or the browser's storage
 *   REVIEW    the row that needs a price opened by itself, its fields inside
 *             the card and the window, 44px tall on a phone; Import waits
 *             for the price
 *   SUMMARY   each product as a draft with Edit to /app/products/<id>, and
 *             every import posted as a draft request, one per product
 *
 *   node scripts/check-gumroad-import.mjs     (SHOTS_DIR=dir keeps the shots)
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const inter = interFaces(root)
const stubs = join(root, ".gumroad-import-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-gumroad-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const TOKEN = "probe_TOKEN_0123456789abcdefghij"

writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/app/products/import/gumroad"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-gumroad-import.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.gumroad-import-probe/navigation.js", "next/link": "./.gumroad-import-probe/link.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  throw e
}
const js = readFileSync(join(stubs, "app.js"), "utf8")
rmSync(stubs, { recursive: true, force: true })

const CDN = "https://public-files.gumroad.com"
const products = [
  { gumroadId: "g1", title: "Lightroom presets: the whole film collection", descriptionHtml: "<p>Twelve presets.</p>", excerpt: "Twelve presets.", priceCents: 1900, gumroadPrice: { amount: 1900, currency: "USD" }, payWhatYouWant: false, published: true, gumroadUrl: null, images: [`${CDN}/a.png`], variants: [{ name: "Personal", priceCents: 1900, payWhatYouWant: false }, { name: "Commercial license with a long name", priceCents: 4900, payWhatYouWant: false }], tags: [], unsupported: null, notes: [], importedProductId: null },
  { gumroadId: "g2", title: "Notion budget template", descriptionHtml: "<p>A template.</p>", excerpt: "A template.", priceCents: null, gumroadPrice: { amount: 1200, currency: "EUR" }, payWhatYouWant: true, published: false, gumroadUrl: null, images: [], variants: [], tags: [], unsupported: null, notes: ["currency", "unpublished"], importedProductId: null },
  { gumroadId: "g3", title: "Monthly sample club", descriptionHtml: "", excerpt: "", priceCents: 900, gumroadPrice: { amount: 900, currency: "USD" }, payWhatYouWant: false, published: true, gumroadUrl: null, images: [], variants: [], tags: [], unsupported: "membership", notes: [], importedProductId: null },
  { gumroadId: "g4", title: "Brush pack", descriptionHtml: "", excerpt: "", priceCents: 500, gumroadPrice: { amount: 500, currency: "USD" }, payWhatYouWant: false, published: true, gumroadUrl: null, images: [], variants: [], tags: [], unsupported: null, notes: [], importedProductId: "00000000-0000-4000-8000-000000000004" },
]
const server = `
window.__posts = []
let made = 0
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  if (url === "/api/app/products/import/gumroad") {
    const body = JSON.parse(init.body)
    window.__posts.push(body)
    if (body.action === "list") return json({ products: ${JSON.stringify(products)}, currency: "USD", ready: true, sqlPart: 344, truncated: false })
    if (body.action === "import") { made++; return json({ status: "imported", productId: "00000000-0000-4000-8000-00000000010" + made, imagesCopied: 1, imagesFailed: 0, variantsSaved: true }) }
  }
  return json({}, 404)
}
`
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${server}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
/** Elements whose box leaves the window sideways. */
const outside = (p, sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5) }).map((e) => `${e.outerHTML.slice(0, 80)} ${Math.round(e.getBoundingClientRect().left)}-${Math.round(e.getBoundingClientRect().right)}`), sel)

try {
  for (const [label, vp, phone] of [
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
    ["desktop-1280", { width: 1280, height: 800 }, false],
  ]) {
    console.log(`\n${label}`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = new URL(r.url())
      if (u.pathname === "/__probe") return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.hostname === "public-files.gumroad.com") return r.respond({ status: 200, contentType: "image/png", body: PNG })
      return r.respond({ status: 404, body: "" })
    })
    await p.goto("https://storelib.com/__probe", { waitUntil: "domcontentloaded" })
    await p.waitForSelector("[data-gumroad-token]")

    // TOKEN
    const field = await p.$eval("#gumroad-token", (e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), type: e.getAttribute("type") } })
    expect(field.type === "password", "the token field hides what is typed", field.type)
    expect(!phone || field.h >= 44, "the token field is at least 44px tall on a phone", field.h)
    expect((await overflow(p)) <= 0, "nothing scrolls sideways (token)", await overflow(p))
    await p.screenshot({ path: join(shots, `${label}-1-token.png`) })

    await p.type("#gumroad-token", TOKEN)
    await p.click("[data-gumroad-token] button[type=submit]")
    await p.waitForSelector("[data-gumroad-products]")

    // LIST
    const rows = await p.$$eval("[data-gumroad-row]", (els) => els.map((e) => ({ id: e.getAttribute("data-gumroad-row"), h: Math.round(e.firstElementChild.getBoundingClientRect().height), box: !!e.querySelector("input[type=checkbox]"), edit: e.querySelector("a")?.getAttribute("href") ?? null, text: e.textContent })))
    expect(rows.length === 4, "one row per Gumroad product", rows.length)
    expect(rows.every((r) => r.h >= 56), "every row at least 56px tall", rows.map((r) => r.h))
    const club = rows.find((r) => r.id === "g3")
    expect(club && !club.box && /Memberships are not imported/.test(club.text), "the membership has no checkbox and says why")
    const brush = rows.find((r) => r.id === "g4")
    expect(brush && !brush.box && brush.edit === "/app/products/00000000-0000-4000-8000-000000000004", "the one already imported links to its product", brush?.edit)
    const posted = await p.evaluate(() => window.__posts[0])
    expect(posted?.action === "list" && posted.token === TOKEN, "the token went in the one list request")
    const kept = await p.evaluate((t) => document.documentElement.outerHTML.includes(t) || JSON.stringify(localStorage).includes(t) || JSON.stringify(sessionStorage).includes(t), TOKEN)
    expect(!kept && !(await p.$("#gumroad-token")), "afterwards the token is nowhere in the page or the browser's storage")
    expect((await overflow(p)) <= 0, "nothing scrolls sideways (list)", await overflow(p))
    await p.screenshot({ path: join(shots, `${label}-2-list.png`) })

    // REVIEW
    const review = await p.evaluate(() => {
      const row = document.querySelector('[data-gumroad-row="g2"]')
      const card = document.querySelector("[data-gumroad-products]").getBoundingClientRect()
      const inputs = [...row.querySelectorAll("input:not([type=checkbox])")].map((i) => i.getBoundingClientRect())
      return { open: inputs.length, inside: inputs.every((r) => r.left >= card.left - 0.5 && r.right <= card.right + 0.5), min: Math.min(...inputs.map((r) => Math.round(r.height))), note: /type the price/.test(row.textContent), files: !!row.querySelector("[data-files-note]") }
    })
    expect(review.open === 2, "the row that needs a price opened by itself, with title and price", review.open)
    expect(review.inside, "its fields inside the card")
    expect(!phone || review.min >= 44, "its fields at least 44px tall on a phone", review.min)
    expect(review.note, "it says Gumroad sells it in another currency")
    expect(review.files, "it says the files are not copied")
    await p.click('[data-gumroad-row="g1"] button[aria-expanded]')
    const variants = await p.$$eval('[data-gumroad-row="g1"] fieldset input', (els) => els.length)
    expect(variants === 2, "an opened row lists its options with their prices", variants)
    { const out = await outside(p, "[data-gumroad-products] input, [data-gumroad-run]"); expect(out.length === 0, "no field or button leaves the window", out) }
    expect((await overflow(p)) <= 0, "nothing scrolls sideways (review)", await overflow(p))
    const waiting = await p.$eval("[data-gumroad-run]", (b) => b.parentElement.textContent)
    expect(/need a price/.test(waiting), "the bar says what is missing before Import", waiting)
    await p.evaluate(() => document.querySelector('[data-gumroad-row="g2"]').scrollIntoView({ block: "center" }))
    await p.screenshot({ path: join(shots, `${label}-3-review.png`) })

    await p.type('[data-gumroad-row="g2"] input[inputmode=decimal]', "12")
    await p.click("[data-gumroad-run]")
    await p.waitForSelector("[data-gumroad-done]")

    // SUMMARY
    const imports = await p.evaluate(() => window.__posts.filter((b) => b.action === "import"))
    expect(imports.length === 2 && imports.every((b) => !("token" in b) && !JSON.stringify(b).includes("TOKEN")), "one import request per product, none carrying the token", imports.length)
    expect(imports.find((b) => b.item.gumroadId === "g2")?.item.priceCents === 1200, "the typed price is sent in cents")
    const done = await p.$$eval("[data-gumroad-done] li", (els) => els.map((e) => ({ href: e.querySelector("a")?.getAttribute("href"), text: e.textContent, h: Math.round(e.getBoundingClientRect().height) })))
    expect(done.length === 2 && done.every((d) => /^\/app\/products\/0000/.test(d.href) && /Draft/.test(d.text)), "each product a draft, with Edit to its editor", done.map((d) => d.href))
    expect(done.every((d) => d.h >= 56), "summary rows at least 56px tall", done.map((d) => d.h))
    expect((await overflow(p)) <= 0, "nothing scrolls sideways (summary)", await overflow(p))
    await p.screenshot({ path: join(shots, `${label}-4-summary.png`) })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
} finally {
  await browser.close()
}
console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`${broken} failed`)
  process.exit(1)
}
console.log("all passed")
