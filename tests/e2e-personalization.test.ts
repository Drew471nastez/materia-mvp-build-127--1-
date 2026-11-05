/**
 * ROUND 13: PERSONALIZATION, THE WHOLE WAY, THROUGH THE JOURNEY HARNESS
 *
 * A seller sells a mug that asks for a name to engrave (required, at most
 * 12 letters), a gift message (optional, line breaks) and a photo (required).
 * Through the real route handlers (tests/_journey):
 *
 *   A  THE STORELIB THEME / storelib.com PRODUCT PAGE PATH
 *      the product's fields as the buy box reads them; the buyer's photo a
 *      cart upload (lib/cart-uploads), checked by its bytes, for this browser
 *      and store; a fake one and one for a product without a photo field
 *      refused; checkout refused without the name, with a typed or changed
 *      photo value, from another browser; two mugs with two names and the
 *      photo paid for; the photo copied to the order; the seller's order
 *      shows them and the photo signed for the store; the buyer's
 *      confirmation and the seller's email say them; the photo opens for
 *      its browser only
 *   B  AN IMPORTED THEME ON THE STORE'S OWN WEBSITE
 *      the product page draws the fields in its product form; /cart/add.js
 *      without the name is a 422 the theme shows; with it, the line keeps the
 *      answers; Check out hands them to the website's checkout; paid; on the
 *      order
 *
 * Run: node scripts/run-push-tests.mjs (in SUITES)
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)



async function main() {
  const j = await Journey.start()
  /* A real photo, 64 x 64: a cart upload must be at least 16 pixels a side (lib/cart-uploads/rules). */
  const JPEG = await (await import("sharp")).default({ create: { width: 64, height: 64, channels: 3, background: { r: 192, g: 128, b: 64 } } }).jpeg().toBuffer()

  section("Setup: a seller who ships, a mug that asks for a name and a photo")
  const seller = await j.signUp("engraver@example.com", { name: "Ema Engraver" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "pz-studio" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "PZ Studio", supportEmail: "hello@pzstudio.example", defaultCountry: "RO" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "RO", businessName: "PZ Studio SRL" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const studioId = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${studioId}`, { as: seller, body: { name: "Studio", kind: "home", addressLine1: "Str. Lunga 1", city: "Cluj-Napoca", postalCode: "400001", country: "RO" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["RO"], name: "Romania" } })
  const zone = j.rows("shipping_zones")[0]
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone.id, kind: "flat", name: "Standard", priceCents: 1500, minDays: 2, maxDays: 4 } })
  const [mug] = j.db.insert("products", { creator_id: creator.id, type: "physical", title: "Engraved Mug", slug: "engraved-mug", description: "<p>A mug</p>", status: "published", price_cents: 3000, thumbnail_url: "https://cdn.example.com/m.jpg", pay_what_you_want: false }, {})
  const save = await j.call(`PUT /api/physical/products/${mug.id}`, { as: seller, body: { variants: [{ options: [], priceCents: 3000, sku: "MUG-1", weightGrams: 400, stock: { [studioId]: 20 } }], requiresShipping: true, weightGrams: 400, taxable: false, trackInventory: true, fulfillmentLocationId: studioId } })
  const variantId = j.rows("product_variants").find((v) => v.product_id === mug.id)?.id as string
  check("the mug saves with one option and stock", save.status === 200 && !!variantId, save.json)

  /* What the product editor's Personalization card saves (app/(storelib)/app/products/new/personalization-card.tsx through storedPersonalization). */
  const P = await import("@/lib/products/personalization")
  const fields = P.storedPersonalization([
    { ...P.blankField("text"), label: "Name to engrave", required: true, maxLength: 12, placeholder: "Up to 12 letters" },
    { ...P.blankField("multiline"), label: "Gift message" },
    { ...P.blankField("image"), label: "Your photo", required: true },
  ])
  j.db.update("products", { personalization: fields }, [{ path: "id", op: "eq", value: mug.id, not: false }])
  check("the product keeps its three fields (SQL part 302's column)", Array.isArray(j.rows("products").find((p) => p.id === mug.id)?.personalization) && j.rows("products").find((p) => p.id === mug.id)!.personalization.length === 3)
  const photoField = fields.find((f) => f.type === "image")!

  section("A. The product page, the photo, the checkout, the order")
  const sp = await j.call(`GET /api/physical/storefront/product?productId=${mug.id}&country=RO`)
  check("the product page's buy box gets the fields: labels as typed, required, the limit", sp.status === 200 && (sp.json?.personalization ?? []).map((f: any) => f.label).join("|") === "Name to engrave|Gift message|Your photo" && sp.json.personalization[0].required === true && sp.json.personalization[0].maxLength === 12, sp.json?.personalization)

  /* storelib.com's own product page (components/physical/buy-box): the photo is one of the store's cart uploads, the store named by the product (app/api/cart/uploads ?product=). */
  const platform = { headers: { origin: "https://storelib.com", "x-forwarded-for": "198.51.100.7" } }
  const send = async (bytes: Uint8Array, type: string, name: string, opts: { product?: string; host?: string; cookies?: Record<string, string> } = {}) => {
    const form = new FormData()
    form.append("file", new Blob([bytes], { type }), name)
    const r = await j.call(`POST /api/cart/uploads?product=${opts.product ?? mug.id}`, { host: opts.host, headers: { ...platform.headers, ...(opts.host ? { origin: `https://${opts.host}` } : {}) }, body: form, cookies: opts.cookies })
    const set = r.headers.get("set-cookie") ?? ""
    const uid = /sl_cart_uid=([^;]+)/.exec(set)?.[1] ?? null
    return { ...r, uid }
  }
  const [plain] = j.db.insert("products", { creator_id: creator.id, title: "Plain Mug", slug: "plain-mug", type: "physical", status: "published", price_cents: 2000, personalization: [] }, {})
  const notHere = await send(new Uint8Array(JPEG), "image/jpeg", "pet.jpg", { product: plain.id })
  check("a photo for a product that asks for none is refused, nothing kept", notHere.status === 403 && j.rows("cart_uploads").length === 0, notHere.json)
  const fake = await send(new TextEncoder().encode("this is not a picture at all, just words in a file"), "image/jpeg", "pet.jpg")
  check("a file that only says it is a JPG is refused by its bytes, nothing kept", fake.status === 400 && /isn't a picture/.test(fake.json?.description ?? "") && j.rows("cart_uploads").length === 0, fake.json)
  const real = await send(new Uint8Array(JPEG), "image/jpeg", "Pet photo.jpg")
  const photoUrl = real.json?.upload?.value as string
  const cookies = { sl_cart_uid: real.uid ?? "" }
  check("a real photo is kept privately for this browser and this store, the value the cart line holds", real.status === 200 && !!real.uid && P.isUploadValue(photoUrl) && photoUrl.endsWith("/Pet-photo.jpg") && [...j.net.objects.keys()].some((k) => k.startsWith(`cart-uploads/cart/${creator.id}/`)) && j.rows("cart_uploads").length === 1, { json: real.json, uid: real.uid, stored: [...j.net.objects.keys()] })

  const address = { name: "Ioana Pop", line1: "Str. Florilor 10", city: "Cluj-Napoca", postalCode: "400100", country: "RO", phone: "+40 744 000 111" }
  const quote = await j.call("POST /api/physical/checkout/quote", { body: { items: [{ productId: mug.id, variantId, quantity: 1 }], shopId: creator.id, couponCode: "", country: "RO", postalCode: "400100" } })
  const std = quote.json?.delivery?.options?.[0]
  const start = (items: unknown[], clientKey: string, jar: Record<string, string> = cookies) => j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items, email: "ioana@example.com", name: address.name, phone: address.phone, address, deliveryOptionId: std?.id, clientKey }, cookies: jar })
  const missing = await start([{ productId: mug.id, variantId, quantity: 1, properties: { "Your photo": photoUrl } }], "pz-missing-123456")
  check("checkout without the name to engrave is refused by the server, naming the item and the field", missing.status === 400 && missing.json?.error === "Engraved Mug: Fill in Name to engrave" && missing.json?.field === "personalization", missing.json)
  const typed = await start([{ productId: mug.id, variantId, quantity: 1, properties: { "Name to engrave": "Ana", "Your photo": "https://evil.example/pet.jpg" } }], "pz-typed-12345678")
  check("  a photo answer that is not an upload is refused", typed.status === 400 && /Upload the photo for Your photo again/.test(typed.json?.error ?? ""), typed.json)
  const forged = await start([{ productId: mug.id, variantId, quantity: 1, properties: { "Name to engrave": "Ana", "Your photo": photoUrl.replace(/\.([A-Za-z0-9_-])/, (_m, c) => `.${c === "A" ? "B" : "A"}`) } }], "pz-forged-1234567")
  check("  a photo value with a changed letter is refused", forged.status === 409 && /can't be used any more/.test(forged.json?.error ?? ""), forged.json)
  const stranger = await start([{ productId: mug.id, variantId, quantity: 1, properties: { "Name to engrave": "Ana", "Your photo": photoUrl } }], "pz-stranger-123456", {})
  check("  another browser's photo is refused", stranger.status === 409, stranger.json)
  const tooLong = await start([{ productId: mug.id, variantId, quantity: 1, properties: { "Name to engrave": "Alexandra Maria", "Your photo": photoUrl } }], "pz-long-12345678")
  check("  a name over 12 letters is refused", tooLong.status === 400 && /at most 12 characters/.test(tooLong.json?.error ?? ""), tooLong.json)

  const items = [
    { productId: mug.id, variantId, quantity: 1, properties: { "Name to engrave": "  Ana ", "Gift message": "Happy birthday\nLove, Mum", "Your photo": photoUrl } },
    { productId: mug.id, variantId, quantity: 1, properties: { "Name to engrave": "Bob", "Your photo": photoUrl } },
  ]
  const paidStart = await start(items, "pz-paid-123456789")
  const co = j.rows("commerce_checkouts").find((c) => c.client_key === "pz-paid-123456789")
  check("with the answers, checkout starts: two mugs, a line each, as two sets of answers", paidStart.status === 200 && co?.lines?.length === 2 && co.lines.every((l: any) => l.quantity === 1), { start: paidStart.json, lines: co?.lines?.map((l: any) => [l.quantity, l.properties]) })
  const snapA = co?.lines?.find((l: any) => l.properties?.["Name to engrave"] === "Ana")?.properties ?? {}
  const snapB = co?.lines?.find((l: any) => l.properties?.["Name to engrave"] === "Bob")?.properties ?? {}
  check("each line keeps its own answers, cleaned: the name trimmed, the message's line breaks, the photo", snapA["Gift message"] === "Happy birthday\nLove, Mum" && snapA["Your photo"] === photoUrl && snapB["Your photo"] === photoUrl && !("Gift message" in snapB), { snapA, snapB })
  const paid = j.world.pay(co!.stripe_session_id)
  await j.webhook("charge.succeeded", paid.charge!)
  await j.webhook("payment_intent.succeeded", paid.intent)
  await j.webhook("checkout.session.completed", j.world.expand(paid.session)!)
  const orderRows = j.rows("orders").filter((o) => o.checkout_id === co!.id)
  check("paid: two order lines, each with its answers", orderRows.length === 2 && orderRows.some((o) => o.product_snapshot?.properties?.["Name to engrave"] === "Bob") && orderRows.every((o) => o.product_snapshot?.properties?.["Your photo"] === photoUrl), orderRows.map((o) => o.product_snapshot?.properties))
  check("  the photo now belongs to the order: copied to the order's own place", [...j.net.objects.keys()].some((k) => k.startsWith(`cart-uploads/orders/${creator.id}/`)) && !!j.rows("cart_uploads")[0]?.attached_at, { stored: [...j.net.objects.keys()], row: j.rows("cart_uploads")[0] })
  const so = await j.call(`GET /api/physical/orders/${co!.id}`, { as: seller })
  const line = (so.json?.order?.lines ?? []).find((l: any) => l.properties?.["Name to engrave"] === "Ana")
  check("the seller's order shows each answer, labels exactly as set", so.status === 200 && so.json.order.lines.length === 2 && line?.properties?.["Gift message"] === "Happy birthday\nLove, Mum" && line?.properties?.["Your photo"] === photoUrl, so.json?.order?.lines?.map((l: any) => l.properties))
  check("  and the photo, signed for the store to open and download", line?.files?.length === 1 && /\/object\/sign\/cart-uploads\/orders\//.test(line.files[0].url ?? "") && line.files[0].name === "Pet-photo.jpg", line?.files)

  /* PZ_DUMP_DIR: the seller's order as the route answered it, for scripts/check-personalization-r13.mjs to draw in the real order panel. */
  const dump = process.env.PZ_DUMP_DIR
  if (dump) {
    mkdirSync(dump, { recursive: true })
    writeFileSync(join(dump, "order.json"), JSON.stringify(so.json))
  }

  await j.cron()
  if (dump) writeFileSync(join(dump, "mails.json"), JSON.stringify(j.net.mails.map((m) => ({ to: m.to, subject: m.subject, html: m.html }))))
  const conf = j.net.to("ioana@example.com").find((m) => /confirm/i.test(m.subject))
  const confText = conf ? `${conf.text}\n${conf.html}` : ""
  check("the buyer's confirmation lists the answers, the photo by its file name, never its address", /Name to engrave: Ana/.test(confText) && /Name to engrave: Bob/.test(confText) && /Your photo: Pet-photo\.jpg/.test(confText) && !confText.includes(photoUrl), confText.replace(/\s+/g, " ").slice(0, 1200))
  const sellerMail = j.net.mails.find((m) => m.to.some((x) => /pzstudio|engraver@/.test(x)) && /sale|order/i.test(m.subject) && m.html.includes("Name to engrave"))
  check("the seller's new order email lists them", !!sellerMail && sellerMail.html.includes("Ana") && sellerMail.html.includes("Pet-photo.jpg"), j.net.mails.map((m) => [m.to.join(","), m.subject]))

  const ref = photoUrl.split("/")[4]
  const opened = await j.call(`GET /api/cart/uploads/${ref}/Pet-photo.jpg`, { cookies })
  check("the photo opens for the browser that sent it: a redirect to a link that lasts ten minutes, never cached", opened.status === 302 && /\/object\/sign\/cart-uploads\//.test(opened.location ?? "") && /no-store/.test(opened.headers.get("cache-control") ?? ""), { status: opened.status, location: opened.location })
  const elsewhere = await j.call(`GET /api/cart/uploads/${ref}/Pet-photo.jpg`)
  check("  and for nobody else", elsewhere.status === 404)

  section("B. An imported theme on the store's own website")
  const host = "pz-studio.storelib.com"
  const t = await importedTheme()
  const [install] = j.db.insert("store_theme_installs", { creator_id: creator.id, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Posture" }, {})
  j.db.insert("store_theme_settings", { install_id: install.id, settings: t.settings }, {})
  j.db.insert("store_theme_custom_files", Object.entries(t.files).map(([path, content]) => ({ install_id: install.id, path, content })), {})
  j.db.insert("store_theme_pages", t.pages.map((p) => ({ install_id: install.id, page_key: p.page_key, sections: p.sections })), {})
  const { compatSiteByName } = await import("@/lib/website-builder/compat-site")
  const { answer } = await import("@/lib/storelib-theme/compat/site")
  const found = await compatSiteByName("pz-studio", host)
  check("the live site loads the published imported theme", found.kind === "site", found.kind)
  if (found.kind !== "site") return report(j)
  const state: { cart: any[]; note: string } = { cart: [], note: "" }
  const ask = async (method: string, path: string, body: Record<string, unknown> | null = null, ajax = false) => {
    const [p, q] = path.split("?")
    const r = await answer(found.site, { method, path: p, query: new URLSearchParams(q ?? ""), body, cart: state.cart as never, note: state.note, ajax })
    if (r.cart) state.cart = r.cart as never
    return r
  }
  /* The website's own host: the photo kept for this browser on this store (POST /api/cart/uploads, as the theme's /cart/upload does). */
  const siteUp = await send(new Uint8Array(JPEG), "image/jpeg", "cleo.jpg", { host })
  const sitePhoto = siteUp.json?.upload?.value as string
  const siteCookies = { sl_cart_uid: siteUp.uid ?? "" }
  check("a photo sent on the website's host is kept for that browser", siteUp.status === 200 && P.isUploadValue(sitePhoto) && !!siteUp.uid, siteUp.json)
  const page = String((await ask("GET", "/products/engraved-mug")).body)
  if (process.env.PZ_DUMP_DIR) writeFileSync(join(process.env.PZ_DUMP_DIR, "theme-product.html"), page)
  check("the theme's product page has the three fields inside its product form, Optional beside the message", /<form[^>]*\/cart\/add[\s\S]*data-storelib-personalization[\s\S]*<\/form>/.test(page) && page.includes('name="properties[Name to engrave]"') && page.includes('name="properties[Gift message]"') && /data-storelib-upload-value/.test(page) && /Gift message<span class="sl-pz__o">Optional/.test(page), page.match(/data-storelib-personalization[\s\S]{0,600}/)?.[0])
  const refused = await ask("POST", "/cart/add.js", { id: variantId, quantity: 1 }, true)
  check("/cart/add.js without the name: 422, Engraved Mug: Fill in Name to engrave", refused.status === 422 && JSON.parse(String(refused.body)).description === "Engraved Mug: Fill in Name to engrave" && state.cart.length === 0, String(refused.body))
  const added = await ask("POST", "/cart/add", { id: variantId, quantity: "1", "properties[Name to engrave]": "Cleo", "properties[Gift message]": "", "properties[Your photo]": sitePhoto })
  check("the theme's form post with the answers puts the line in the cart, with them", added.status === 302 || added.status === 303 ? state.cart.length === 1 && state.cart[0].props?.["Name to engrave"] === "Cleo" && state.cart[0].props?.["Your photo"] === sitePhoto && !("Gift message" in state.cart[0].props) : false, { status: added.status, cart: state.cart })
  const go = await ask("POST", "/cart", { "updates[]": "1", checkout: "" })
  const to = new URL(go.headers?.Location ?? "/", `https://${host}`)
  const { readSiteCheckoutParams } = await import("@/lib/checkout/site-checkout")
  const params = readSiteCheckoutParams(to.searchParams)
  check("Check out hands the answers to the website's checkout", to.pathname === "/checkout" && params.items[0]?.properties?.["Name to engrave"] === "Cleo" && params.items[0]?.properties?.["Your photo"] === sitePhoto, { to: to.toString(), items: params.items })
  const buyerHeaders = { "x-forwarded-for": "192.0.2.78", origin: `https://${host}` }
  const q2 = await j.call("POST /api/checkout/site", { host, headers: buyerHeaders, cookies: siteCookies, body: { action: "quote", items: params.items, country: "RO", postalCode: "400100" } })
  const option = q2.json?.delivery?.selectedId ?? q2.json?.delivery?.options?.[0]?.id
  const noName = await j.call("POST /api/checkout/site", { host, headers: buyerHeaders, cookies: siteCookies, body: { action: "intent", items: params.items.map((i: any) => ({ ...i, properties: { "Your photo": sitePhoto } })), email: "web@example.com", firstName: "Wanda", lastName: "Web", address: { line1: "Str. Web 5", city: "Cluj-Napoca", postalCode: "400100", country: "RO", phone: "+40 744 999 000" }, phone: "+40 744 999 000", agreedToTerms: true, deliveryOptionId: option, clientKey: "pz-site-missing-1234", paymentMethods: ["card"] } })
  check("the website's checkout refuses the line without the name too", noName.status === 400 && /Fill in Name to engrave/.test(noName.json?.error ?? ""), noName.json)
  const intent = await j.call("POST /api/checkout/site", { host, headers: buyerHeaders, cookies: siteCookies, body: { action: "intent", items: params.items, email: "web@example.com", firstName: "Wanda", lastName: "Web", address: { line1: "Str. Web 5", city: "Cluj-Napoca", postalCode: "400100", country: "RO", phone: "+40 744 999 000" }, phone: "+40 744 999 000", agreedToTerms: true, deliveryOptionId: option, clientKey: "pz-site-key-123456", paymentMethods: ["card"] } })
  const pi = intent.json?.paymentIntentId as string | undefined
  const siteCo = j.rows("commerce_checkouts").find((x) => x.client_key === "pz-site-key-123456")
  check("pay on the website: a held checkout with the answers on its line", intent.status === 200 && !!pi && siteCo?.lines?.[0]?.properties?.["Name to engrave"] === "Cleo", { status: intent.status, body: intent.json, lines: siteCo?.lines })
  if (pi && siteCo) {
    const paidSite = j.world.payIntent(pi)
    await j.call("POST /api/checkout/site", { host, headers: buyerHeaders, cookies: siteCookies, body: { action: "confirm", paymentIntentId: pi, clientSecret: j.world.intents.get(pi)!.client_secret, wholeCart: true } })
    await j.webhook("payment_intent.succeeded", paidSite.intent)
    const so2 = await j.call(`GET /api/physical/orders/${siteCo.id}`, { as: seller })
    check("paid: the seller's order shows Cleo and the photo", so2.json?.order?.lines?.[0]?.properties?.["Name to engrave"] === "Cleo" && so2.json?.order?.lines?.[0]?.properties?.["Your photo"] === sitePhoto, so2.json?.order?.lines?.[0])
  }
  report(j)
}

async function importedTheme() {
  const { convertShopifyTheme } = await import("@/lib/storelib-theme/shopify/convert")
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  return r.theme as never as { settings: unknown; files: Record<string, string>; pages: { page_key: string; sections: unknown }[] }
}

function report(j: Journey) {
  console.log("\nHarness")
  console.log("  refused network:", JSON.stringify([...new Set(j.net.refused)]))
  console.log("  server errors:", JSON.stringify(j.serverErrors).slice(0, 2000))
  console.log("  after() errors:", JSON.stringify(j.afterErrors).slice(0, 1000))
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
