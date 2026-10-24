/**
 * ===========================================================================
 *  EVERY CHANGE TURNS SAVE ON, AND CHANGING IT BACK TURNS IT OFF (round 12)
 * ===========================================================================
 * The owner: "if I go to app > products > edit product page and I uncheck a
 * sales channel there, it doesn't trigger the Save button."
 *
 * The real product editor (app/app/products/new/product-editor.tsx, drawn by
 * scripts/render-product-save-r12.tsx) in headless Chromium, at 1440x900 and
 * at 390x844 touch with the CPU slowed four times. Behind it a stand-in for
 * the database and the routes it calls (Supabase's REST, the sales channels,
 * the physical catalog, a file rename), which keeps what is written, so a
 * reload draws what a Save wrote.
 *
 * For each kind of control: change it, Save turns on; change it back, Save
 * turns off again. Then change many at once, Save, reload, and each value is
 * still there. A download, then a thing that ships (its stock and shipping
 * cards, its limit per order).
 *
 *   node scripts/check-product-save-r12.mjs     (SHOTS_DIR=<dir> keeps the pictures)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}.`)
const stubs = join(root, ".save-r12-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-save-r12-")), "shots")
mkdirSync(shots, { recursive: true })
const ORIGIN = "http://storelib.test"
const P = "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6"

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── The stand-in database ─────────────────────────────────────────────── */
const pic = (hue) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="hsl(${hue},60%,78%)"/></svg>`)}`
function freshDb() {
  return {
    products: [
      {
        id: P, creator_id: "c1", title: "Analog drum pack", description: "<p>Three hundred one shots.</p>", price_cents: 2900, compare_at_cents: null,
        slug: "analog-drum-pack", type: "digital", status: "published", show_sales_badge: true, refund_policy_enabled: true, refund_policy_type: "7_day",
        seo_title: "Analog drum pack", seo_description: "Three hundred one shots.", call_to_action: "Buy Now", category: "Drum Kits",
        pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null, thumbnail_url: pic(30), gallery_urls: [pic(30), pic(200)],
        whats_included: ["300 one shots"], faqs: [{ question: "Which format?", answer: "WAV." }], custom_fields: null, sales_limit: null, archived: false,
      },
    ],
    product_variants: [
      { id: "11111111-1111-4111-8111-111111111111", product_id: P, name: "Basic", description: "", price_cents: 2900, compare_at_price_cents: null, max_purchases: null, position: 0, pay_what_you_want: false },
      { id: "22222222-2222-4222-8222-222222222222", product_id: P, name: "Pro", description: "", price_cents: 4900, compare_at_price_cents: null, max_purchases: null, position: 1, pay_what_you_want: false },
    ],
    product_variant_files: [
      { variant_id: "11111111-1111-4111-8111-111111111111", digital_asset_id: "a1a1a1a1-0000-4000-8000-000000000001" },
      { variant_id: "22222222-2222-4222-8222-222222222222", digital_asset_id: "a1a1a1a1-0000-4000-8000-000000000001" },
    ],
    digital_assets: [{ id: "a1a1a1a1-0000-4000-8000-000000000001", product_id: P, file_name: "drum-pack.zip", file_path: "c1/p/drum-pack.zip", file_size: 48_000_000, mime_type: "application/zip" }],
    off: [],
    physical: {
      vendor: null, tags: [], requiresShipping: true, weightGrams: 500, lengthMm: null, widthMm: null, heightMm: null, weightUnit: "kg", dimensionUnit: "cm",
      originCountry: null, hsCode: null, taxable: true, taxCategory: null, trackInventory: true, continueSelling: false, lowStockThreshold: null,
      fulfillmentLocationId: null, fulfillmentMethod: "self", shippingProfileId: null, maxPerOrder: null, options: [],
      variants: [{ id: "pv0", productId: P, name: "Default", options: [null, null, null], priceCents: 2500, compareAtCents: null, costCents: null, sku: null, barcode: null, weightGrams: null, imageUrl: null, trackInventory: true, inventoryPolicy: "deny", requiresShipping: true, taxable: true, active: true, fulfillmentLocationId: null, fulfillmentMethod: null, position: 0 }],
      levels: [{ variantId: "pv0", locationId: "loc1", onHand: 7, committed: 0 }],
    },
  }
}
let db = freshDb()

const CHANNELS = [
  { id: "ch-store", kind: "storefront", name: "Online store", description: "Your website.", enabled: true },
  { id: "ch-page", kind: "creator_page", name: "Creator page", description: "storelib.com/you.", enabled: true },
  { id: "ch-explore", kind: "marketplace", name: "Explore", description: "Storelib's marketplace.", enabled: true },
]
const LOCATION = { id: "loc1", name: "Studio", kind: "home", country: "RO", city: "Cluj", addressLine1: "Str. 1", addressLine2: null, region: null, postalCode: "400000", phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: false, pickupInstructions: null, pickupReady: null }

function loadedFor(kind) {
  const product = { ...db.products[0], type: kind }
  return {
    product,
    assets: kind === "physical" ? [] : db.digital_assets,
    variants: kind === "physical" ? [] : db.product_variants.map((v) => ({ ...v, product_variant_files: db.product_variant_files.filter((f) => f.variant_id === v.id).map((f) => ({ digital_asset_id: f.digital_asset_id })) })),
    sales: kind === "physical" ? undefined : { limit: product.sales_limit, sold: 3, missing: false },
  }
}

/* PostgREST, as far as the editor uses it. */
function rest(method, url, body, accept) {
  const u = new URL(url)
  const table = u.pathname.split("/").pop()
  const rows = db[table]
  if (!Array.isArray(rows)) return { status: 200, body: [] }
  const filters = [...u.searchParams].filter(([k]) => !["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k))
  const match = (r) =>
    filters.every(([k, v]) => {
      const [op, ...rest] = v.split(".")
      const val = rest.join(".")
      if (op === "eq") return String(r[k]) === val
      if (op === "neq") return String(r[k]) !== val
      if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(r[k]))
      return true
    })
  let out
  if (method === "GET") out = table === "products" && u.searchParams.has("slug") ? [] : rows.filter(match)
  else if (method === "PATCH") {
    out = rows.filter(match)
    for (const r of out) Object.assign(r, body)
  } else if (method === "POST") {
    const list = (Array.isArray(body) ? body : [body]).map((r) => ({ id: r.id ?? crypto.randomUUID(), ...r }))
    rows.push(...list)
    out = list
  } else if (method === "DELETE") {
    out = rows.filter(match)
    db[table] = rows.filter((r) => !match(r))
  }
  const one = /vnd\.pgrst\.object/.test(accept || "")
  return { status: 200, body: one ? out[0] ?? null : out }
}

function physicalPut(body) {
  const ph = db.physical
  Object.assign(ph, {
    vendor: body.vendor, tags: body.tags, requiresShipping: body.requiresShipping, weightGrams: body.weightGrams, weightUnit: body.weightUnit, dimensionUnit: body.dimensionUnit,
    lengthMm: body.lengthMm, widthMm: body.widthMm, heightMm: body.heightMm, originCountry: body.originCountry, hsCode: body.hsCode, taxable: body.taxable, taxCategory: body.taxCategory,
    trackInventory: body.trackInventory, continueSelling: body.continueSelling, lowStockThreshold: body.lowStockThreshold, fulfillmentMethod: body.fulfillmentMethod,
    fulfillmentLocationId: body.fulfillmentLocationId, shippingProfileId: body.shippingProfileId,
    options: (body.options || []).map((o, i) => ({ position: i + 1, name: o.name, values: o.values })),
  })
  if ("maxPerOrder" in body) ph.maxPerOrder = body.maxPerOrder
  ph.variants = body.variants.map((v, i) => ({ ...ph.variants[0], id: v.id ?? `pv${i}`, options: v.options, priceCents: v.priceCents, compareAtCents: v.compareAtCents, costCents: v.costCents, sku: v.sku, barcode: v.barcode, weightGrams: v.weightGrams, imageUrl: v.imageUrl, fulfillmentMethod: v.fulfillmentMethod, active: v.active, position: i }))
  body.variants.forEach((v, i) => {
    for (const [loc, n] of Object.entries(v.stock || {})) {
      const id = ph.variants[i].id
      const level = ph.levels.find((l) => l.variantId === id && l.locationId === loc)
      if (level) level.onHand = n
      else ph.levels.push({ variantId: id, locationId: loc, onHand: n, committed: 0 })
    }
  })
  return { product: ph }
}

function api(method, url, body) {
  const u = new URL(url)
  const path = u.pathname
  if (path === "/__probe/loaded") return loadedFor(u.searchParams.get("kind"))
  if (path === "/api/store/currency") return { currency: "USD" }
  if (path === "/api/store/channels/product") {
    if (method === "PUT") {
      db.off = body.off
      return { off: body.off }
    }
    return { ready: true, channels: CHANNELS, defaultKey: null, off: db.off }
  }
  if (path === "/api/physical/catalog-context") return { locations: [LOCATION], profiles: [{ id: "prof1", name: "General", isDefault: true }], settings: { unitSystem: "metric", taxMode: "none", lowStockDefault: 5, lowStockAlerts: true, fulfillmentModel: "self", defaultLocationId: "loc1" } }
  if (path.startsWith("/api/physical/products/")) return method === "PUT" ? physicalPut(body) : { product: db.physical }
  if (path === "/api/storage/upload-file" && method === "PATCH") {
    const a = db.digital_assets.find((x) => x.id === u.searchParams.get("assetId"))
    if (a) a.file_name = body.name
    return { success: true, name: body.name }
  }
  return {}
}

/* ── The page ──────────────────────────────────────────────────────────── */
try {
  const css = await appCss(root)
  const inter = interFaces(root)
  writeFileSync(join(stubs, "navigation.js"), `const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, refresh: () => {} }
export const usePathname = () => "/app/products/${P}"
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
    entryPoints: [join(root, "scripts/render-product-save-r12.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      react: join(root, "node_modules/next/dist/compiled/react"),
      "react-dom": join(root, "node_modules/next/dist/compiled/react-dom"),
      "next/navigation": "./.save-r12-probe/navigation.js",
      "next/link": "./.save-r12-probe/link.jsx",
      "next/image": "./.save-r12-probe/image.jsx",
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
  const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const phone = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const desk = { width: 1440, height: 900 }

  const open = async (vp, kind, slow) => {
    const p = await browser.newPage()
    const errors = []
    const writes = []
    p.on("pageerror", (e) => errors.push(e.message))
    p.on("dialog", (d) => d.accept().catch(() => {}))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }
      if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: cors })
      const body = (() => {
        try {
          return r.postData() ? JSON.parse(r.postData()) : null
        } catch {
          return null
        }
      })()
      if (/\/rest\/v1\//.test(u)) {
        if (r.method() !== "GET") writes.push({ method: r.method(), url: u.replace(/\?.*/, ""), body })
        const out = rest(r.method(), u, body, r.headers()["accept"])
        return r.respond({ status: out.status, contentType: "application/json", headers: cors, body: JSON.stringify(out.body) }).catch(() => {})
      }
      if (u.startsWith(ORIGIN)) {
        const path = new URL(u).pathname
        if (path.startsWith("/app/")) return r.respond({ status: 200, contentType: "text/html", body: html })
        if (r.method() !== "GET") writes.push({ method: r.method(), url: u.replace(/\?.*/, ""), body })
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(api(r.method(), u, body)) }).catch(() => {})
      }
      r.abort()
    })
    await p.setViewport(vp)
    if (slow) {
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    }
    await p.goto(`${ORIGIN}/app/products/${P}?kind=${kind}`)
    await p.waitForSelector("[data-product-editor]", { timeout: 20000 })
    await p.waitForSelector(kind === "physical" ? "[data-physical-cards] , [data-sales-channels]" : "[data-sales-channels]", { timeout: 20000 })
    await sleep(slow ? 2500 : 1000)
    return { p, errors, writes }
  }

  /* Save as the owner sees it: the visible Save, and the editor's own list of what differs. */
  const state = (p) =>
    p.evaluate(() => {
      const save = [...document.querySelectorAll("[data-save-button]")].find((b) => b.getBoundingClientRect().width > 0)
      return { save: save ? (save.disabled ? "off" : "on") : "none", unsaved: document.querySelector("[data-product-editor]")?.getAttribute("data-unsaved-fields") ?? "" }
    })
  const settle = (slow) => sleep(slow ? 700 : 250)
  const scrollTo = (p, sel) => p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), sel)
  const typeInto = async (p, sel, text, { select = true } = {}) => {
    await scrollTo(p, sel)
    await p.focus(sel)
    if (select) await p.$eval(sel, (el) => el.select?.())
    else await p.$eval(sel, (el) => { const n = el.value.length; el.setSelectionRange?.(n, n) })
    await p.keyboard.type(text)
  }
  const clickSwitch = (p, label) =>
    p.evaluate((l) => {
      const sw = [...document.querySelectorAll("[role=switch]")].find((s) => (s.getAttribute("aria-label") || "") === l || document.querySelector(`label[for="${s.id}"]`)?.textContent?.startsWith(l))
      sw.scrollIntoView({ block: "center" })
      sw.click()
      return true
    }, label)
  const switchOn = (p, label) =>
    p.evaluate((l) => {
      const sw = [...document.querySelectorAll("[role=switch]")].find((s) => (s.getAttribute("aria-label") || "") === l || document.querySelector(`label[for="${s.id}"]`)?.textContent?.startsWith(l))
      return sw ? sw.getAttribute("aria-checked") : null
    }, label)
  const tapChannel = async (p, name) => {
    const box = await p.evaluateHandle((n) => [...document.querySelectorAll("[data-sales-channels] label")].find((l) => l.textContent.includes(n)), name)
    await p.evaluate((el) => el.scrollIntoView({ block: "center" }), box)
    await sleep(100)
    await box.asElement().click()
  }
  const channelOn = (p, name) => p.evaluate((n) => [...document.querySelectorAll("[data-sales-channels] label")].find((l) => l.textContent.includes(n))?.querySelector("input")?.checked ?? null, name)
  const pickPriceMode = async (p, label) => {
    await scrollTo(p, "[data-price-mode]")
    await p.click("[data-price-mode]")
    await sleep(400)
    await p.evaluate((l) => [...document.querySelectorAll("[role=menuitem], [role=dialog] button, [data-action-menu] button")].find((b) => b.textContent.trim() === l)?.click(), label)
    await sleep(400)
  }
  const moveMedia = async (p, index, key) => {
    const handles = await p.$$("[data-media-handle]")
    await handles[index].focus()
    await p.keyboard.press("Space")
    await sleep(250)
    await p.keyboard.press(key)
    await sleep(250)
    await p.keyboard.press("Space")
    await sleep(400)
  }
  const openSeo = async (p) => {
    const open = await p.$eval("[data-seo-edit]", (b) => b.getAttribute("aria-expanded"))
    if (open !== "true") {
      await scrollTo(p, "[data-seo-edit]")
      await p.click("[data-seo-edit]")
      await sleep(700)
    }
  }
  const mediaOrder = (p) => p.evaluate(() => [...document.querySelectorAll("[data-media-handle]")].map((h) => h.closest("[data-media-id], li, div")?.querySelector("img")?.getAttribute("src")?.slice(-40) ?? ""))

  /* One control: change, Save on; change back, Save off. */
  async function roundTrip(p, slow, name, change, back, field) {
    await change()
    await settle(slow)
    const on = await state(p)
    await back()
    await settle(slow)
    const off = await state(p)
    expect(on.save === "on" && (!field || process.env.NOFIELD || on.unsaved.split(" ").includes(field)), `${name}: a change turns Save on`, on)
    expect(off.save === "off" && (process.env.NOFIELD || off.unsaved === ""), `${name}: changing it back turns Save off`, off)
  }

  for (const [label, vp, slow] of [["desktop-1440", desk, false], ["phone-390", phone, true]]) {
    db = freshDb()
    console.log(`\n${label}: a download`)
    let { p, errors } = await open(vp, "digital", slow)
    const first = await state(p)
    expect(first.save === "off" && first.unsaved === "", "a saved product opens with Save off", first)

    await roundTrip(p, slow, "text (title)", () => typeInto(p, "#title", " v2", { select: false }), async () => { for (let i = 0; i < 3; i++) await p.keyboard.press("Backspace") }, "title")
    await roundTrip(p, slow, "number (price)", () => typeInto(p, "#price", "35"), () => typeInto(p, "#price", "29.00"), "price")
    await roundTrip(
      p, slow, "rich text (description)",
      async () => {
        const ed = await p.$("[data-product-editor] [contenteditable=true]")
        await p.evaluate((el) => { el.scrollIntoView({ block: "center" }); el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r) }, ed)
        await p.keyboard.type(" More")
      },
      async () => { for (let i = 0; i < 5; i++) await p.keyboard.press("Backspace") },
      "description",
    )
    await roundTrip(p, slow, "switch (Show sales count)", () => clickSwitch(p, "Show sales count"), () => clickSwitch(p, "Show sales count"), "showSalesBadge")
    await roundTrip(p, slow, "switch (Limit sales)", () => clickSwitch(p, "Limit sales"), () => clickSwitch(p, "Limit sales"), "limitSalesEnabled")
    /* The owner's case. */
    await roundTrip(p, slow, "checkbox (sales channel: Explore unchecked)", () => tapChannel(p, "Explore"), () => tapChannel(p, "Explore"), "channels")
    await roundTrip(p, slow, "menu (how it is sold: Pay what you want)", () => pickPriceMode(p, "Pay what you want"), () => pickPriceMode(p, "Fixed price"), "payWhatYouWant")
    if (vp.width >= 640) await roundTrip(p, slow, "select (call to action)", () => p.select("#cta", "Get Access"), () => p.select("#cta", "Buy Now"), "callToAction")
    await roundTrip(
      p, slow, "order (variants)",
      () => p.evaluate(() => document.querySelector('[aria-label="Move Basic down"]').click()),
      () => p.evaluate(() => document.querySelector('[aria-label="Move Basic up"]').click()),
      "variants",
    )
    await roundTrip(p, slow, "order (media, the cover)", () => moveMedia(p, 0, "ArrowRight"), () => moveMedia(p, 1, "ArrowLeft"), "mediaItems")
    /* Opening a variant's card is not a change; its price is. */
    await p.evaluate(() => document.querySelector("[data-variant-id] > div").click())
    await settle(slow)
    const opened = await state(p)
    expect(opened.save === "off", "opening a variant's card is not a change", opened)
    const variantPrice = "[data-variant-id] input[inputmode=decimal]"
    await roundTrip(p, slow, "variant (its price)", () => typeInto(p, variantPrice, "31"), () => typeInto(p, variantPrice, "29"), "variants")
    await openSeo(p)
    await roundTrip(p, slow, "text (SEO title)", () => typeInto(p, "#seoTitle", "Drum samples"), () => typeInto(p, "#seoTitle", "Analog drum pack"), "seoTitle")
    await p.screenshot({ path: join(shots, `${label}-digital-clean.png`) })

    /* Many at once, saved, then read back after a reload. */
    await typeInto(p, "#title", "Analog drum pack II")
    await typeInto(p, "#price", "35")
    await clickSwitch(p, "Show sales count")
    await tapChannel(p, "Explore")
    if (vp.width >= 640) await p.select("#cta", "Get Access")
    await p.evaluate(() => document.querySelector('[aria-label="Move Basic down"]').click())
    await moveMedia(p, 0, "ArrowRight")
    await openSeo(p)
    await typeInto(p, "#seoTitle", "Drum samples")
    await settle(slow)
    const before = await state(p)
    expect(before.save === "on", "many changes: Save on", before)
    await p.screenshot({ path: join(shots, `${label}-digital-unsaved.png`) })
    await p.evaluate(() => [...document.querySelectorAll("[data-save-button]")].find((b) => b.getBoundingClientRect().width > 0).click())
    await sleep(slow ? 5000 : 2500)
    const after = await state(p)
    expect(after.save === "off" && after.unsaved === "", "saving turns Save off", after)
    expect(errors.length === 0, "nothing threw", errors)
    await p.close()

    ;({ p, errors } = await open(vp, "digital", slow))
    const back = await p.evaluate(() => ({
      title: document.getElementById("title")?.value,
      price: document.getElementById("price")?.value,
      seoTitle: document.getElementById("seoTitle")?.value,
      cta: document.getElementById("cta")?.value,
      variants: [...document.querySelectorAll("[data-variant-id]")].map((v) => v.querySelector("span")?.textContent.trim()),
    }))
    const badge = await switchOn(p, "Show sales count")
    const explore = await channelOn(p, "Explore")
    const store = await channelOn(p, "Online store")
    expect(back.title === "Analog drum pack II" && back.price === "35", "after a reload: the title and the price", back)
    expect(badge === "false", "after a reload: Show sales count stays off", badge)
    expect(explore === false && store === true, "after a reload: Explore stays unchecked (the owner's case), the others checked", { explore, store })
    expect(back.seoTitle === "Drum samples", "after a reload: the SEO title", back.seoTitle)
    if (vp.width >= 640) expect(back.cta === "Get Access", "after a reload: the call to action", back.cta)
    expect(back.variants.join() === "Pro,Basic", "after a reload: the variants' order", back.variants)
    expect(db.products[0].gallery_urls?.[0] === freshDb().products[0].gallery_urls[1], "after a reload: the cover is the photo moved first", db.products[0].thumbnail_url?.slice(-30))
    const reopened = await state(p)
    expect(reopened.save === "off", "and the reloaded product opens with Save off", reopened)
    await p.screenshot({ path: join(shots, `${label}-digital-reloaded.png`) })
    const wide = await p.evaluate(() => document.scrollingElement.scrollWidth)
    expect(wide <= vp.width, "nothing scrolls sideways", wide)
    expect(errors.length === 0, "nothing threw", errors)
    await p.close()

    /* A thing that ships. */
    db = freshDb()
    db.products[0].type = "physical"
    db.products[0].category = "T-Shirts"
    console.log(`\n${label}: a thing that ships`)
    ;({ p, errors } = await open(vp, "physical", slow))
    await p.waitForSelector("[data-physical-cards]", { timeout: 20000 })
    await sleep(slow ? 1500 : 600)
    const pfirst = await state(p)
    expect(pfirst.save === "off" && pfirst.unsaved === "", "a saved physical product opens with Save off (its cards loaded after it)", pfirst)
    await roundTrip(p, slow, "switch (Track inventory)", () => clickSwitch(p, "Track inventory"), () => clickSwitch(p, "Track inventory"), "physical")
    await roundTrip(p, slow, "number (quantity)", () => typeInto(p, 'input[aria-label="Quantity"]', "12"), () => typeInto(p, 'input[aria-label="Quantity"]', "7"), "physical")
    await roundTrip(p, slow, "decimal (weight)", () => typeInto(p, 'input[aria-label="Weight"]', "0.75"), () => typeInto(p, 'input[aria-label="Weight"]', "0.50"), "physical")
    await roundTrip(p, slow, "select (weight unit, the weight converted)", () => p.select('select[aria-label="Weight unit"]', "g"), () => p.select('select[aria-label="Weight unit"]', "kg"), "physical")
    await roundTrip(p, slow, "switch (Limit sales, per order)", () => clickSwitch(p, "Limit sales"), () => clickSwitch(p, "Limit sales"), "orderLimit")
    await roundTrip(p, slow, "checkbox (sales channel: Online store)", () => tapChannel(p, "Online store"), () => tapChannel(p, "Online store"), "channels")
    await p.screenshot({ path: join(shots, `${label}-physical-clean.png`) })

    await typeInto(p, 'input[aria-label="Quantity"]', "12")
    await typeInto(p, 'input[aria-label="Weight"]', "0.75")
    await clickSwitch(p, "Limit sales")
    await settle(slow)
    expect((await state(p)).save === "on", "many changes: Save on", await state(p))
    await p.evaluate(() => [...document.querySelectorAll("[data-save-button]")].find((b) => b.getBoundingClientRect().width > 0).click())
    await sleep(slow ? 5000 : 2500)
    const pafter = await state(p)
    expect(pafter.save === "off" && pafter.unsaved === "", "saving turns Save off, with the cards read back", pafter)
    expect(errors.length === 0, "nothing threw", errors)
    await p.close()
    ;({ p, errors } = await open(vp, "physical", slow))
    await p.waitForSelector('input[aria-label="Quantity"]', { timeout: 20000 })
    await sleep(slow ? 1500 : 600)
    const pback = await p.evaluate(() => ({ qty: document.querySelector('input[aria-label="Quantity"]')?.value, weight: document.querySelector('input[aria-label="Weight"]')?.value }))
    const limit = await switchOn(p, "Limit sales")
    expect(pback.qty === "12" && pback.weight === "0.75", "after a reload: the quantity and the weight", pback)
    expect(limit === "true" && db.physical.maxPerOrder === 2, "after a reload: the limit per order is on, at 2", { limit, saved: db.physical.maxPerOrder })
    const preopened = await state(p)
    expect(preopened.save === "off", "and it opens with Save off", preopened)
    await p.screenshot({ path: join(shots, `${label}-physical-reloaded.png`) })
    expect(errors.length === 0, "nothing threw", errors)
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall good")
process.exit(broken ? 1 : 0)
