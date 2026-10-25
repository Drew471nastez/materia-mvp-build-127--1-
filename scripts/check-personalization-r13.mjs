/**
 * ===========================================================================
 *  PERSONALIZATION, SEEN AND PRESSED (round 13)
 * ===========================================================================
 * The owner: personalization fields "should work 100%: uploading images,
 * uploading text, field labels, everything", on every Storelib theme and an
 * imported theme, through to the order.
 *
 * In headless Chromium, at 1440x900 and at 390x844 touch with the CPU slowed
 * four times, the real components (scripts/render-personalization-r13.tsx)
 * and an imported theme's real product page:
 *
 *   editor    the Personalization card and the Custom fields card
 *   product   a Storelib theme's product section: Add to cart with nothing
 *             typed is held, each required field says so; a name typed, a
 *             photo chosen and uploaded (to a stand-in /api/cart/uploads),
 *             Add to cart puts the line in the cart with the answers
 *   buybox    the storelib.com product page's buy box, the same fields
 *   cart      the website's cart page, two lines with their answers, a photo
 *   theme     an imported theme's product page as the live site draws it
 *             (drawn by the journey, tests/e2e-personalization): its form
 *             held without the name, a photo uploaded by Storelib's script,
 *             the hidden answer filled
 *   order     the seller's order (PhysicalOrderPanel), from the order the
 *             journey's real route answered: each item's answers under On
 *             the items, the photo signed for the store, with Download
 *
 *   node scripts/check-personalization-r13.mjs     (SHOTS_DIR=<dir> keeps the pictures)
 *
 * Needs the journey's dump first (the script runs it when DUMP_DIR has none):
 *   PZ_DUMP_DIR=<dir> through scripts/run-push-tests' suite tests/e2e-personalization.test.ts
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}.`)
const stubs = join(root, ".pz-r13-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-pz-r13-")), "shots")
mkdirSync(shots, { recursive: true })
const dump = process.env.DUMP_DIR
if (!dump || !existsSync(join(dump, "order.json")) || !existsSync(join(dump, "theme-product.html"))) throw new Error("DUMP_DIR needs order.json and theme-product.html from tests/e2e-personalization.test.ts (PZ_DUMP_DIR)")
const PET = readFileSync(process.env.PHOTO || join(dump, "pet.jpg"))
const ORIGIN = "http://pz-studio.storelib.test"
const SHOP = "5b1c0000-0000-4000-8000-000000000001"
const PID = "5b1c0000-0000-4000-8000-0000000000a1"
const VID = "5b1c0000-0000-4000-8000-0000000000b1"
const PHOTO_URL = `/api/cart/uploads/${"a".repeat(32)}.AbCdEfGhIjKlMnOpQrStUv/pet.jpg`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined || ok ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fields = [
  { id: "f0name01", label: "Name to engrave", type: "text", required: true, maxLength: 12, placeholder: "Up to 12 letters", help: "We engrave it exactly as typed." },
  { id: "f0msg002", label: "Gift message", type: "multiline", required: false, maxLength: null, placeholder: "", help: "" },
  { id: "f0pic003", label: "Your photo", type: "image", required: true, maxLength: null, placeholder: "", help: "A clear photo works best." },
]
const product = {
  id: PID, title: "Engraved Mug", slug: "engraved-mug", type: "physical", description: "", description_html: "<p>Stoneware, 350 ml, engraved by hand in Cluj.</p>",
  price_cents: 3000, compare_at_cents: null, thumbnail_url: "/__img/mug.jpg", gallery_urls: [], images: ["/__img/mug.jpg"],
  variants: [{ id: VID, name: "Default", options: [null, null, null], price_cents: 3000, compare_at_cents: null, image_url: null, available: true, left: null, max_quantity: 20 }],
  options: [], personalization: fields, details: [{ key: "material", label: "Material", value: "Stoneware", type: "text" }],
}
const loaded = {
  product: {
    id: PID, creator_id: "c1", title: "Engraved Mug", description: "<p>Stoneware, 350 ml.</p>", price_cents: 3000, compare_at_cents: null, slug: "engraved-mug", type: "physical", status: "published",
    show_sales_badge: false, refund_policy_enabled: false, refund_policy_type: null, seo_title: "", seo_description: "", call_to_action: null, category: "Home & Kitchen",
    pay_what_you_want: false, thumbnail_url: "/__img/mug.jpg", gallery_urls: ["/__img/mug.jpg"], whats_included: [], faqs: [],
    custom_fields: { material: { value: "Stoneware", label: "Material", type: "text", show: true, pos: 0 }, care_instructions: { value: "Hand wash.\nNo microwave.", label: "Care instructions", type: "multiline", show: true, pos: 1 } },
    personalization: fields,
  },
  assets: [], variants: [],
}
const physical = {
  vendor: null, tags: [], requiresShipping: true, weightGrams: 400, lengthMm: null, widthMm: null, heightMm: null, weightUnit: "kg", dimensionUnit: "cm", originCountry: null, hsCode: null, taxable: true, taxCategory: null,
  trackInventory: true, continueSelling: false, lowStockThreshold: null, fulfillmentLocationId: null, fulfillmentMethod: "self", shippingProfileId: null, maxPerOrder: null, options: [],
  variants: [{ id: "pv0", productId: PID, name: "Default", options: [null, null, null], priceCents: 3000, compareAtCents: null, costCents: null, sku: "MUG-1", barcode: null, weightGrams: 400, imageUrl: null, trackInventory: true, inventoryPolicy: "deny", requiresShipping: true, taxable: true, active: true, fulfillmentLocationId: null, fulfillmentMethod: null, position: 0 }],
  levels: [{ variantId: "pv0", locationId: "loc1", onHand: 20, committed: 0 }],
}
const LOCATION = { id: "loc1", name: "Studio", kind: "home", country: "RO", city: "Cluj", addressLine1: "Str. 1", addressLine2: null, region: null, postalCode: "400000", phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: false, pickupInstructions: null, pickupReady: null }
const order = JSON.parse(readFileSync(join(dump, "order.json"), "utf8"))
const themeHtml = readFileSync(join(dump, "theme-product.html"), "utf8")
const mugSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="#efe9e1"/><rect x="250" y="260" width="360" height="420" rx="40" fill="#f9f7f3" stroke="#d8d0c4" stroke-width="6"/><path d="M610 360c120 0 120 200 0 200" fill="none" stroke="#d8d0c4" stroke-width="34"/><text x="430" y="490" font-family="Georgia" font-size="56" text-anchor="middle" fill="#8a7c6b">Ana</text></svg>`

function api(method, url, body) {
  const u = new URL(url)
  const path = u.pathname
  if (path === "/__probe/loaded") return loaded
  if (path === "/api/store/currency") return { currency: "USD" }
  if (path === "/api/store/channels/product") return { ready: true, channels: [{ id: "ch-store", kind: "storefront", name: "Online store", description: "Your website.", enabled: true }], defaultKey: null, off: [] }
  if (path === "/api/physical/catalog-context") return { locations: [LOCATION], profiles: [{ id: "prof1", name: "General", isDefault: true }], settings: { unitSystem: "metric", taxMode: "none", lowStockDefault: 5, lowStockAlerts: true, fulfillmentModel: "self", defaultLocationId: "loc1" } }
  if (path.startsWith("/api/physical/products/")) return { product: physical }
  if (path === "/api/physical/storefront/product") return { product: { id: PID, creatorId: SHOP, title: "Engraved Mug", slug: "engraved-mug", imageUrl: "/__img/mug.jpg" }, currency: "USD", personalization: fields, delivery: { lines: ["Delivery 15.00 lei, 2 to 4 days"] }, options: [], variants: [{ id: VID, name: "Default", options: [null, null, null], priceCents: 3000, compareAtCents: null, imageUrl: null, soldOut: false, left: null, maxQuantity: 20, pickup: [] }] }
  if (path.startsWith("/api/physical/orders/")) return order
  if (path === "/api/cart/prices") return { prices: [] }
  return {}
}

try {
  const css = await appCss(root)
  const inter = interFaces(root)
  writeFileSync(join(stubs, "navigation.js"), `const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, refresh: () => {} }
export const usePathname = () => "/app/products/${PID}"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
export const notFound = () => {}
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
    entryPoints: [join(root, "scripts/render-personalization-r13.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      react: join(root, "node_modules/next/dist/compiled/react"),
      "react-dom": join(root, "node_modules/next/dist/compiled/react-dom"),
      "next/navigation": "./.pz-r13-probe/navigation.js",
      "next/link": "./.pz-r13-probe/link.jsx",
      "next/image": "./.pz-r13-probe/image.jsx",
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
  const page = (extra = "") => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>window.__product=${JSON.stringify(product)};window.__shop=${JSON.stringify(SHOP)};window.__orderId=${JSON.stringify(order.order.id)};${extra}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const phone = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const desk = { width: 1440, height: 900, deviceScaleFactor: 1 }

  const open = async (vp, view, opts = {}) => {
    const p = await browser.newPage()
    const errors = []
    const puts = []
    /* Add to cart on a site with no cart drawer goes to /cart, which this probe answers with a stand-in that does not opt into the page's cross-document view transition; Chrome says so as a page error. Not the product's. */
    p.on("pageerror", (e) => /ViewTransition opt-in disabled/.test(e.message) || errors.push(e.message))
    p.on("dialog", (d) => d.accept().catch(() => {}))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }
      if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: cors })
      /* The buyer's photo (lib/cart-uploads): sent as one multipart POST (/api/cart/uploads on a Storelib page, /cart/upload on an imported theme), opened by its value, or by the order's signed link. */
      if (r.method() === "POST" && /\/api\/cart\/uploads(\?|$)|\/cart\/upload$/.test(u.split("#")[0])) {
        puts.push(r.method())
        return r.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ upload: { value: PHOTO_URL, name: "pet.jpg", type: "image/jpeg", size: PET.length, width: 640, height: 640 } }) })
      }
      if (u.includes("/api/cart/uploads/") || u.includes("/object/sign/cart-uploads/")) return r.respond({ status: 200, contentType: "image/jpeg", headers: cors, body: PET })
      if (u.includes("/__img/")) return r.respond({ status: 200, contentType: "image/svg+xml", body: mugSvg })
      if (/\/rest\/v1\//.test(u)) return r.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(/vnd\.pgrst\.object/.test(r.headers()["accept"] || "") ? null : []) })
      if (u.startsWith(ORIGIN)) {
        const path = new URL(u).pathname
        if (path === "/products/engraved-mug") return r.respond({ status: 200, contentType: "text/html", body: themeHtml })
        if (path.startsWith("/app/") || path === "/" || path.startsWith("/view")) return r.respond({ status: 200, contentType: "text/html", body: page(opts.extra) })
        const body = (() => {
          try {
            return r.postData() ? JSON.parse(r.postData()) : null
          } catch {
            return null
          }
        })()
        if (path.startsWith("/cart/add")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, body }) })
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(api(r.method(), u, body)) }).catch(() => {})
      }
      r.abort()
    })
    await p.setViewport(vp)
    if (vp.isMobile) {
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    }
    /* One view's cart is not the next view's: the site's storage starts empty for each. */
    await (await p.createCDPSession()).send("Storage.clearDataForOrigin", { origin: ORIGIN, storageTypes: "local_storage" })
    if (opts.storage) await p.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v) } catch {} }, opts.storage[0], opts.storage[1])
    await p.goto(view === "theme" ? `${ORIGIN}/products/engraved-mug` : `${ORIGIN}/view?view=${view}`, { waitUntil: "load" })
    return { p, errors, puts }
  }
  const tag = (vp) => (vp.isMobile ? "390" : "1440")
  const shot = async (p, name, el) => {
    const file = join(shots, `${name}.png`)
    if (el) {
      const h = await p.$(el)
      if (h) {
        await h.scrollIntoView?.()
        await sleep(250)
        await h.screenshot({ path: file })
        return file
      }
    }
    await p.screenshot({ path: file })
    return file
  }

  for (const vp of [desk, phone]) {
    console.log(`\n${tag(vp)}: the product editor`)
    {
      const { p, errors } = await open(vp, "editor")
      await p.waitForSelector("[data-personalization-card]", { timeout: 30000 })
      const rows = await p.$$eval("[data-personalization-field]", (els) => els.length)
      expect(rows === 3, "the Personalization card lists the product's three fields", rows)
      const labels = await p.$$eval("[data-personalization-card] input[aria-label='Field name']", (els) => els.map((e) => e.value))
      expect(labels.join("|") === "Name to engrave|Gift message|Your photo", "each label exactly as saved", labels)
      const photoRow = await p.$eval("[data-personalization-field='f0pic003']", (el) => ({ hint: el.textContent.includes("JPG, PNG or WEBP"), limit: !!el.querySelector("[aria-label$='character limit']") }))
      expect(photoRow.hint && !photoRow.limit, "a photo field says what it takes and has no character limit", photoRow)
      await shot(p, `editor-personalization-${tag(vp)}`, "[data-personalization-card]")
      await shot(p, `editor-custom-fields-${tag(vp)}`, "[data-custom-fields]")
      await p.click("[data-personalization-add]")
      await sleep(200)
      expect((await p.$$eval("[data-personalization-field]", (els) => els.length)) === 4, "Add field adds a row")
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    console.log(`\n${tag(vp)}: a Storelib theme's product page`)
    {
      const { p, errors, puts } = await open(vp, "product")
      await p.waitForSelector("[data-personalization]", { timeout: 30000 })
      const order = await p.evaluate(() => {
        const f = document.querySelector("[data-personalization]")
        const b = document.querySelector("[data-buy-buttons]")
        return !!f && !!b && !!(f.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      })
      expect(order, "the fields are above the buy buttons (no Personalization block in the section)")
      const optional = await p.$eval("[data-personalization-field='f0msg002'] label", (el) => el.textContent)
      expect(/Gift message\s*Optional/.test(optional), "the optional field says Optional beside its label", optional)
      await p.click("[data-add-to-cart]")
      await sleep(400)
      const said = await p.$$eval("[data-personalization-error]", (els) => els.map((e) => e.textContent))
      expect(said.join("|") === "Fill in Name to engrave|Fill in Your photo", "Add to cart with nothing typed is held: each required field says what is missing", said)
      const cartBefore = await p.evaluate((k) => localStorage.getItem(k), `storelib.cart.${SHOP}`)
      expect(!cartBefore || cartBefore === "[]", "  and nothing went in the cart", cartBefore)
      await shot(p, `product-held-${tag(vp)}`, "[data-product-info]")
      await p.type("[data-personalization-input='f0name01']", "Ana Maria Popescu")
      const typed = await p.$eval("[data-personalization-input='f0name01']", (el) => el.value)
      expect(typed === "Ana Maria Po", "the name stops at its 12 letter limit", typed)
      const left = await p.$eval("[data-personalization-field='f0name01'] label", (el) => el.textContent)
      expect(/0 characters left/.test(left), "  and the counter says 0 characters left", left)
      await p.type("[data-personalization-input='f0msg002']", "Happy birthday!")
      const file = await p.$("[data-personalization-field='f0pic003'] input[type=file]")
      const photo = join(stubs, "pet.jpg")
      writeFileSync(photo, PET)
      await file.uploadFile(photo)
      await p.waitForFunction(() => document.querySelector("[data-personalization-photo='done']"), { timeout: 15000 }).catch(() => {})
      expect(!!(await p.$("[data-personalization-photo='done']")), "the photo uploads (to the store's private cart uploads) and shows as added", puts)
      expect(puts.length === 1, "  one upload request", puts)
      await shot(p, `product-filled-${tag(vp)}`, "[data-product-info]")
      await p.click("[data-add-to-cart]")
      await sleep(500)
      const cart = JSON.parse((await p.evaluate((k) => localStorage.getItem(k), `storelib.cart.${SHOP}`)) || "[]")
      expect(cart.length === 1 && cart[0].properties?.["Name to engrave"] === "Ana Maria Po" && cart[0].properties?.["Your photo"] === PHOTO_URL && cart[0].properties?.["Gift message"] === "Happy birthday!", "Add to cart keeps the line with every answer, the photo as its link", cart)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    console.log(`\n${tag(vp)}: the storelib.com product page's buy box`)
    {
      const { p, errors } = await open(vp, "buybox")
      await p.waitForSelector("[data-physical-buy-box] [data-personalization]", { timeout: 30000 })
      expect((await p.$$eval("[data-physical-buy-box] [data-personalization-field]", (els) => els.length)) === 3, "the buy box draws the three fields")
      await shot(p, `buybox-${tag(vp)}`)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    console.log(`\n${tag(vp)}: the website's cart`)
    {
      const lines = [
        { productId: PID, variantId: VID, title: "Engraved Mug", variantName: null, priceCents: 3000, thumbnailUrl: "/__img/mug.jpg", slug: "engraved-mug", digital: false, physical: true, quantity: 1, currency: "USD", properties: { "Name to engrave": "Ana", "Gift message": "Happy birthday\nLove, Mum", "Your photo": PHOTO_URL } },
        { productId: PID, variantId: VID, title: "Engraved Mug", variantName: null, priceCents: 3000, thumbnailUrl: "/__img/mug.jpg", slug: "engraved-mug", digital: false, physical: true, quantity: 1, currency: "USD", properties: { "Name to engrave": "Bob", "Your photo": PHOTO_URL } },
      ]
      const { p, errors } = await open(vp, "cart", { storage: [`storelib.cart.${SHOP}`, JSON.stringify(lines)] })
      await p.waitForSelector("[data-cart-line-properties]", { timeout: 30000 })
      const rows = await p.$$eval("[data-cart-line-properties]", (els) => els.map((e) => e.textContent))
      expect(rows.length === 2 && /Name to engrave:\s*Ana/.test(rows[0]) && /Name to engrave:\s*Bob/.test(rows[1]), "two lines of the same mug, each with its own answers", rows)
      expect((await p.$$eval("[data-cart-line-properties] img", (els) => els.filter((i) => i.complete && i.naturalWidth > 0).length)) === 2 && rows.every((t) => /pet\.jpg/.test(t) && !t.includes("/api/cart/uploads")), "  each photo shown small, by its file name", rows)
      await shot(p, `cart-${tag(vp)}`)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    console.log(`\n${tag(vp)}: an imported theme's product page`)
    {
      const { p, errors, puts } = await open(vp, "theme")
      await p.waitForSelector("[data-storelib-personalization]", { timeout: 30000 })
      const inForm = await p.evaluate(() => !!document.querySelector("form[action*='/cart/add'] [data-storelib-personalization]"))
      expect(inForm, "the fields are inside the theme's product form")
      const submit = await p.$("form[action*='/cart/add'] button[type=submit][name=add], form[action*='/cart/add'] [type=submit]")
      await submit.click()
      await sleep(400)
      const err = await p.$$eval(".sl-pz__err:not([hidden])", (els) => els.map((e) => e.textContent))
      expect(err.includes("Fill in Name to engrave") && err.includes("Fill in Your photo"), "the theme's Add to cart is held: Storelib's script says what is missing", err)
      expect(p.url().endsWith("/products/engraved-mug"), "  and the form was not sent", p.url())
      await shot(p, `theme-held-${tag(vp)}`, "[data-storelib-personalization]")
      await p.type("input[name='properties[Name to engrave]']", "Cleo")
      const file = await p.$("[data-storelib-upload]")
      const photo = join(stubs, "pet.jpg")
      await file.uploadFile(photo)
      await p.waitForFunction(() => document.querySelector("[data-storelib-pz-field][data-state=done]"), { timeout: 15000 }).catch(() => {})
      const hidden = await p.$eval("[data-storelib-upload-value]", (el) => el.value)
      expect(hidden === PHOTO_URL && puts.length === 1, "a chosen photo uploads (one POST to /cart/upload) and fills the hidden properties[Your photo]", { hidden, puts })
      await shot(p, `theme-filled-${tag(vp)}`, "[data-storelib-personalization]")
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    console.log(`\n${tag(vp)}: the seller's order`)
    {
      const { p, errors } = await open(vp, "order")
      await p.waitForSelector("[data-order-line-properties]", { timeout: 30000 })
      const answers = await p.$$eval("[data-order-line-properties] li", (els) => els.map((e) => e.textContent))
      expect(answers.length === 2 && answers.some((t) => /Name to engrave: Ana/.test(t)) && answers.some((t) => /Name to engrave: Bob/.test(t)), "each item's answers under On the items, labels as set", answers)
      expect((await p.$$eval("[data-order-line-files] img", (els) => els.filter((i) => i.complete && i.naturalWidth > 0).length)) === 2 && (await p.$$eval("[data-order-line-files] a", (els) => els.map((a) => a.textContent))).every((t) => t === "Download"), "  each photo shown, with Download", null)
      await shot(p, `order-items-${tag(vp)}`)
      await shot(p, `order-notes-${tag(vp)}`, "[data-order-line-properties]")
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }
  await browser.close()
} finally {
  console.log(`\nshots: ${shots}`)
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
