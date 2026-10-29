/**
 * Products › Import from Gumroad (lib/products/import/gumroad.ts, its server
 * half and app/api/app/products/import/gumroad).
 *
 * What a seller's Gumroad products become (prices, currencies, pay what you
 * want, options, pictures, descriptions), that pictures are only ever fetched
 * from Gumroad's CDN, that an import run twice makes one product, that every
 * product is a draft, that the access token goes in one header to one host
 * and is never stored or logged, and that the route is behind the Products
 * permission. Gumroad's API is a fake here; nothing leaves the machine.
 *
 *   npx esbuild tests/gumroad-import.test.ts --bundle --platform=node --format=cjs \
 *     --alias:@=. --alias:server-only=<empty.js> --outfile=<out.cjs> && node <out.cjs>
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import {
  GUMROAD_API,
  descriptionImages,
  gumroadImageUrl,
  gumroadToHundredths,
  mapGumroadProduct,
  mapVariants,
  readImportItem,
  storePrice,
  type ImportItem,
} from "../lib/products/import/gumroad"
import { fetchGumroadProducts, importGumroadItem, importedProducts, looksLikeToken } from "../lib/products/import/gumroad-server"
import { permits } from "../lib/team/permissions"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else {
    failed++
    failures.push(name)
  }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
function section(t: string) {
  console.log(`\n${t}`)
}

const TOKEN = "gr_SECRET_token_0123456789abcdefABCDEF"
const CDN = "https://public-files.gumroad.com"
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"))
const STORE = "11111111-1111-4111-8111-111111111111"
const USER = "22222222-2222-4222-8222-222222222222"

function product(over: Record<string, unknown> = {}) {
  return {
    id: "A-m3CDDC5dlrSdKZp0RFhA==",
    name: "Pencil Icon PSD",
    description: "<p>I made this <strong>for fun</strong>.</p>",
    price: 1500,
    currency: "usd",
    customizable_price: null,
    published: true,
    deleted: false,
    short_url: "https://sahil.gumroad.com/l/pencil",
    thumbnail_url: `${CDN}/thumb.png`,
    covers: [{ url: `${CDN}/cover-small.png`, original_url: `${CDN}/cover.png`, type: "image" }],
    tags: ["Pencil", "icon", "pencil"],
    variants: [],
    sales_count: 12,
    sales_usd_cents: 18000,
    ...over,
  }
}

function storeDb(extra: Record<string, Record<string, unknown>[]> = {}, options: Parameters<typeof fakeDb>[1] = {}) {
  const db = fakeDb({ products: [], product_variants: [], product_import_links: [], ...extra }, { unique: { product_import_links: [["creator_id", "source", "external_id"]] }, ...options }) as ReturnType<typeof fakeDb> & { storage: unknown }
  const uploads: string[] = []
  db.storage = {
    from: () => ({
      upload: async (path: string) => {
        uploads.push(path)
        return { error: null }
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/lead-form-files-v2/${path}` } }),
      remove: async () => ({ error: null }),
    }),
  }
  return { db, uploads }
}

function item(over: Partial<ImportItem> = {}): ImportItem {
  return {
    gumroadId: "gid-1",
    title: "Brush pack",
    descriptionHtml: `<p>Hello</p><img src="${CDN}/inline.png"><img src="https://evil.example/x.png"><script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">link</a>`,
    priceCents: 1500,
    payWhatYouWant: false,
    images: [`${CDN}/cover.png`],
    variants: [],
    tags: ["brushes"],
    ...over,
  }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("mapping: prices and currencies")
  const usd = mapGumroadProduct(product(), "USD")!
  check("same currency: Gumroad's cents are the store's cents", usd.priceCents === 1500)
  check("no currency note when they match", !usd.notes.includes("currency"))
  const eur = mapGumroadProduct(product({ currency: "eur" }), "USD")!
  check("another currency is never converted: no price, a note", eur.priceCents === null && eur.notes.includes("currency"))
  check("Gumroad's own price kept for the review", eur.gumroadPrice.amount === 1500 && eur.gumroadPrice.currency === "EUR")
  check("JPY on Gumroad is whole yen", gumroadToHundredths(1000, "jpy") === 100000 && gumroadToHundredths(1000, "usd") === 1000)
  check("storePrice refuses a negative or missing amount", storePrice(-5, "USD", "USD") === null && storePrice(null, "USD", "USD") === null)
  const free = mapGumroadProduct(product({ price: 0 }), "USD")!
  check("a free product is 0", free.priceCents === 0)
  const pwyw = mapGumroadProduct(product({ customizable_price: true, price: 300 }), "USD")!
  check("pay what you want: Gumroad's price is the minimum", pwyw.payWhatYouWant && pwyw.priceCents === 300)
  check("buyers' totals are never read", !("sales_count" in usd) && !JSON.stringify(usd).includes("18000"))

  section("mapping: variants")
  const one = mapVariants([{ title: "Size", options: [{ name: "Small", price_difference: 0 }, { name: "Large", price_difference: 500, is_pay_what_you_want: true }] }], 1000, "USD", "USD")
  check("one category: an option each, base plus difference", one.variants.length === 2 && one.variants[0].priceCents === 1000 && one.variants[1].priceCents === 1500)
  check("an option's pay what you want kept", one.variants[1].payWhatYouWant && !one.variants[0].payWhatYouWant)
  const two = mapVariants(
    [
      { title: "Size", options: [{ name: "S", price_difference: 0 }, { name: "L", price_difference: 200 }] },
      { title: "License", options: [{ name: "Personal", price_difference: 0 }, { name: "Commercial", price_difference: 1000 }] },
    ],
    500,
    "USD",
    "USD",
  )
  check("two categories: every combination", two.variants.map((v) => v.name).join("|") === "S / Personal|S / Commercial|L / Personal|L / Commercial")
  check("a combination's price adds both differences", two.variants[3].priceCents === 1700)
  const many = mapVariants([{ options: Array.from({ length: 8 }, (_, i) => ({ name: `a${i}` })) }, { options: Array.from({ length: 8 }, (_, i) => ({ name: `b${i}` })) }], 100, "USD", "USD")
  check("at most 30, and it says so", many.variants.length === 30 && many.trimmed)
  const other = mapVariants([{ options: [{ name: "X", price_difference: 100 }] }], 100, "EUR", "USD")
  check("variants in another currency have no price either", other.variants[0].priceCents === null)
  check("empty options are skipped", mapVariants([{ options: [{ name: " " }] }], 0, "USD", "USD").variants.length === 0)

  section("mapping: kinds Storelib does not take here")
  check("membership", mapGumroadProduct(product({ is_tiered_membership: true }), "USD")!.unsupported === "membership")
  check("subscription", mapGumroadProduct(product({ subscription_duration: "monthly" }), "USD")!.unsupported === "membership")
  check("physical", mapGumroadProduct(product({ require_shipping: true }), "USD")!.unsupported === "physical")
  check("bundle", mapGumroadProduct(product({ bundle_products: [{ product_id: "x" }] }), "USD")!.unsupported === "bundle")
  check("a deleted product is not listed", mapGumroadProduct(product({ deleted: true }), "USD") === null)
  check("no id, no product", mapGumroadProduct(product({ id: "" }), "USD") === null && mapGumroadProduct(product({ id: "<script>" }), "USD") === null)
  check("unpublished on Gumroad is listed, with a note", mapGumroadProduct(product({ published: false }), "USD")!.notes.includes("unpublished"))

  section("mapping: pictures, tags, description")
  check("the cover's original first, nothing repeated", usd.images.length === 1 && usd.images[0] === `${CDN}/cover.png`)
  const video = mapGumroadProduct(product({ covers: [{ url: "https://youtube.com/x", type: "oembed" }] }), "USD")!
  check("a video cover is skipped; the thumbnail stands in", video.images.length === 1 && video.images[0] === `${CDN}/thumb.png`)
  const off = mapGumroadProduct(product({ covers: [{ url: "https://images.unsplash.com/photo", type: "image" }], thumbnail_url: null }), "USD")!
  check("a picture off Gumroad's CDN is left behind, and it says so", off.images.length === 0 && off.notes.includes("images_left"))
  check("tags lowercased and without repeats", usd.tags.join(",") === "pencil,icon")
  check("the excerpt is text", usd.excerpt === "I made this for fun.")
  check("description images: Gumroad CDN only", descriptionImages(`<img src="${CDN}/a.png"><img src='https://evil.example/b.png'><img src="${CDN}/a.png">`).join() === `${CDN}/a.png`)

  // ═══════════════════════════════════════════════════════════════════════
  section("the picture host allowlist")
  check("public-files.gumroad.com", gumroadImageUrl(`${CDN}/x.png`) === `${CDN}/x.png`)
  check("static-2.gumroad.com", !!gumroadImageUrl("https://static-2.gumroad.com/res/gumroad/x.png"))
  check("protocol relative becomes https", gumroadImageUrl("//public-files.gumroad.com/x.png") === `${CDN}/x.png`)
  for (const bad of [
    "http://public-files.gumroad.com/x.png",
    "https://public-files.gumroad.com.evil.com/x.png",
    "https://evil.com/public-files.gumroad.com/x.png",
    "https://user:pass@public-files.gumroad.com/x.png",
    "https://public-files.gumroad.com:8443/x.png",
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost/x.png",
    "https://gumroad.com/x.png",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "",
  ]) {
    check(`refused: ${bad || "(empty)"}`, gumroadImageUrl(bad) === null)
  }

  section("what the review sends is read again")
  const ok = readImportItem({ ...item(), images: [`${CDN}/a.png`, "https://169.254.169.254/x", "http://public-files.gumroad.com/b.png"] })
  check("only Gumroad CDN pictures survive", ok.ok && ok.item.images.length === 1)
  check("no price, no import", readImportItem({ ...item(), priceCents: null }).ok === false)
  check("a negative price is refused", readImportItem({ ...item(), priceCents: -1 }).ok === false)
  check("a fractional cent is refused", readImportItem({ ...item(), priceCents: 10.5 }).ok === false)
  check("no title, no import", readImportItem({ ...item(), title: "   " }).ok === false)
  check("a made up id is refused", readImportItem({ ...item(), gumroadId: "../../etc" }).ok === false)
  const vr = readImportItem({ ...item(), variants: [{ name: "L", priceCents: "lots" }] })
  check("an option with no price takes the product's", vr.ok && vr.item.variants[0].priceCents === 1500)

  // ═══════════════════════════════════════════════════════════════════════
  section("reading Gumroad: the token goes in one header to one host")
  const calls: { url: string; init: RequestInit }[] = []
  const pages: Record<string, unknown> = {
    "": { success: true, products: [product({ id: "p1" }), product({ id: "p2" })], next_page_key: "k2" },
    k2: { success: true, products: [product({ id: "p3" })] },
  }
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const key = new URL(url).searchParams.get("page_key") ?? ""
    return new Response(JSON.stringify(pages[key]), { status: 200, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
  const logged: string[] = []
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  const capture = (...a: unknown[]) => logged.push(a.map(String).join(" "))
  console.error = capture
  console.warn = capture
  console.info = capture
  const listed = await fetchGumroadProducts(TOKEN, { fetchImpl: fakeFetch })
  check("every page read", listed.ok && listed.products.length === 3 && !listed.truncated)
  check("only api.gumroad.com/v2/products", calls.every((c) => c.url.startsWith(GUMROAD_API)))
  check("the token is a Bearer header", calls.every((c) => (c.init.headers as Record<string, string>).Authorization === `Bearer ${TOKEN}`))
  check("the token is never in a URL", calls.every((c) => !c.url.includes(TOKEN)))
  check("a redirect is refused, not followed", calls.every((c) => c.init.redirect === "error"))

  const status = (code: number, body: unknown = { success: false, message: "The access token is invalid" }) =>
    (async () => new Response(JSON.stringify(body), { status: code })) as unknown as typeof fetch
  const bad = await fetchGumroadProducts(TOKEN, { fetchImpl: status(401) })
  check("401: the token was not accepted", !bad.ok && bad.error === "bad_token")
  const down = await fetchGumroadProducts(TOKEN, { fetchImpl: status(503) })
  check("5xx: Gumroad is down", !down.ok && down.error === "gumroad_down")
  const thrown = await fetchGumroadProducts(TOKEN, { fetchImpl: (async () => { throw new Error(`boom ${TOKEN}`) }) as unknown as typeof fetch })
  check("a network error is Gumroad down, and its message is not passed on", !thrown.ok && thrown.error === "gumroad_down" && !JSON.stringify(thrown).includes(TOKEN))
  const junk = await fetchGumroadProducts(TOKEN, { fetchImpl: (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch })
  check("an answer that is not Gumroad's JSON", !junk.ok && junk.error === "gumroad_refused")
  let loops = 0
  const loop = await fetchGumroadProducts(TOKEN, { fetchImpl: (async () => (loops++, new Response(JSON.stringify({ success: true, products: [product()], next_page_key: "same" })))) as unknown as typeof fetch })
  check("a page key that repeats stops", loop.ok && loops === 2)
  const capped = await fetchGumroadProducts(TOKEN, { maxPages: 2, fetchImpl: (async () => new Response(JSON.stringify({ success: true, products: [product()], next_page_key: String(Math.random()) }))) as unknown as typeof fetch })
  check("at most the page limit, and it says so", capped.ok && capped.products.length === 2 && capped.truncated)
  let asked = false
  const shape = await fetchGumroadProducts("not a token", { fetchImpl: (async () => ((asked = true), new Response("{}"))) as unknown as typeof fetch })
  check("a token with spaces is refused before any request", !shape.ok && shape.error === "bad_token" && !asked)
  check("token shape", looksLikeToken(TOKEN) && !looksLikeToken("short") && !looksLikeToken("a b".repeat(10)))
  console.error = orig.error
  console.warn = orig.warn
  console.info = orig.info
  check("nothing about the token was logged", !logged.some((l) => l.includes(TOKEN)), logged)

  // ═══════════════════════════════════════════════════════════════════════
  section("importing: a draft, its pictures copied, its description cleaned")
  const { db, uploads } = storeDb()
  const fetched: string[] = []
  const deps = { fetchImage: async (u: string) => (fetched.push(u), PNG) }
  const first = await importGumroadItem(db, { creatorId: STORE, userId: USER }, item({ variants: [{ name: "Small", priceCents: 1500, payWhatYouWant: false }, { name: "Large", priceCents: 2500, payWhatYouWant: true }] }), deps)
  check("imported", first.status === "imported", first)
  const made = (db.tables.products as Record<string, unknown>[])[0]
  check("one product, in this store", db.tables.products.length === 1 && made.creator_id === STORE)
  check("a draft, never published", made.status === "draft")
  check("a digital product", made.type === "digital")
  check("its price", made.price_cents === 1500 && made.pay_what_you_want === false)
  check("its address from the title", made.slug === "brush-pack")
  check("its cover is a Storelib copy", typeof made.thumbnail_url === "string" && (made.thumbnail_url as string).startsWith("https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/"))
  check("pictures fetched from Gumroad's CDN only", fetched.length === 2 && fetched.every((u) => u.startsWith(CDN)), fetched)
  check("each one stored under the store's folder", uploads.length === 2 && uploads.every((p) => p.startsWith(`${STORE}/product-images/`)))
  const desc = String(made.description)
  check("the inline Gumroad picture points at its copy", desc.includes("skgtqglupjcnfhfscink.supabase.co") && !desc.includes(CDN))
  check("a picture from anywhere else is dropped", !desc.includes("evil.example"))
  check("no script, no handler, no javascript: link", !/script|onclick|javascript:/i.test(desc), desc)
  check("the words stay", desc.includes("Hello"))
  const variants = db.tables.product_variants as Record<string, unknown>[]
  check("options saved in order with their prices", variants.length === 2 && variants[0].name === "Small" && variants[1].price_cents === 2500 && variants[1].position === 1)
  check("an option's pay what you want has its minimum", variants[1].pay_what_you_want === true && variants[1].pwyw_min_price_cents === 2500)
  check("tags saved", JSON.stringify(made.tags) === '["brushes"]')
  const link = (db.tables.product_import_links as Record<string, unknown>[])[0]
  check("the Gumroad id remembered against the product", link.external_id === "gid-1" && link.source === "gumroad" && link.product_id === made.id)
  check("the token is nowhere in the database", !JSON.stringify(db.tables).includes(TOKEN) && !JSON.stringify(db.log).includes(TOKEN))

  section("importing: once per Gumroad product")
  const again = await importGumroadItem(db, { creatorId: STORE, userId: USER }, item(), deps)
  check("run again: the same product, not a second", again.status === "exists" && (again as { productId: string }).productId === made.id && db.tables.products.length === 1)
  const seen = await importedProducts(db, STORE, ["gid-1", "gid-2"])
  check("the list says which are in already", seen.ready && seen.map.get("gid-1") === made.id && !seen.map.has("gid-2"))
  const otherStore = await importedProducts(db, "33333333-3333-4333-8333-333333333333", ["gid-1"])
  check("another store's imports are not this store's", otherStore.map.size === 0)
  /* The product deleted (the database empties product_id, ON DELETE SET NULL). */
  db.tables.products.splice(0)
  link.product_id = null
  link.updated_at = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const back = await importGumroadItem(db, { creatorId: STORE, userId: USER }, item(), deps)
  check("deleted since: it can come in again, once", back.status === "imported" && db.tables.products.length === 1 && db.tables.product_import_links.length === 1)

  const fresh = storeDb({ product_import_links: [{ id: "l1", creator_id: STORE, source: "gumroad", external_id: "gid-9", product_id: null, updated_at: new Date().toISOString() }] })
  const busy = await importGumroadItem(fresh.db, { creatorId: STORE, userId: USER }, item({ gumroadId: "gid-9" }), deps)
  check("another tab's import still running: nothing written", busy.status === "busy" && fresh.db.tables.products.length === 0)
  const stale = storeDb({ product_import_links: [{ id: "l2", creator_id: STORE, source: "gumroad", external_id: "gid-8", product_id: null, updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() }] })
  const taken = await importGumroadItem(stale.db, { creatorId: STORE, userId: USER }, item({ gumroadId: "gid-8" }), deps)
  check("a claim left by a run that stopped is taken over", taken.status === "imported" && stale.db.tables.products.length === 1)

  const twice = storeDb()
  const [a, b] = await Promise.all([
    importGumroadItem(twice.db, { creatorId: STORE, userId: USER }, item({ gumroadId: "gid-7" }), deps),
    importGumroadItem(twice.db, { creatorId: STORE, userId: USER }, item({ gumroadId: "gid-7" }), deps),
  ])
  check("two at once make one product", twice.db.tables.products.length === 1 && [a.status, b.status].sort().join() === "busy,imported", [a.status, b.status])

  section("importing: when it cannot")
  const noTable = storeDb({}, { failInsert: { product_import_links: { code: "42P01", message: 'relation "public.product_import_links" does not exist' } } })
  const notReady = await importGumroadItem(noTable.db, { creatorId: STORE, userId: USER }, item(), deps)
  check("before SQL part 344: nothing written, and it says why", notReady.status === "error" && notReady.error === "not_ready" && noTable.db.tables.products.length === 0)
  const refused = storeDb({}, { failInsert: { products: { code: "23502", message: "null value" } } })
  const failedSave = await importGumroadItem(refused.db, { creatorId: STORE, userId: USER }, item({ gumroadId: "gid-5" }), deps)
  check("a product the database refuses releases its claim", failedSave.status === "error" && refused.db.tables.product_import_links.length === 0)
  const noPics = storeDb()
  const html = await importGumroadItem(noPics.db, { creatorId: STORE, userId: USER }, item({ gumroadId: "gid-4" }), { fetchImage: async () => new TextEncoder().encode("<html><script>x</script></html>") })
  const hp = noPics.db.tables.products[0] as Record<string, unknown>
  check("an answer that is not a picture is not stored", html.status === "imported" && (html as { imagesFailed: number }).imagesFailed === 2 && noPics.uploads.length === 0 && hp.thumbnail_url === null)

  // ═══════════════════════════════════════════════════════════════════════
  section("the route: Products permission, token handled once")
  const route = readFileSync(join(process.cwd(), "app/api/app/products/import/gumroad/route.ts"), "utf8")
  const gateAt = route.indexOf('requireTeamPermission("products")')
  check("gated by the Products area", gateAt > 0)
  check("the gate comes before the body is read", gateAt < route.indexOf("request.json()"))
  check("the route never logs", !/console\.(log|error|warn|info)/.test(route))
  check("the token is not sent back", !/json\(\{[^}]*\btoken\b\s*[,}:]/.test(route))
  check("every answer is no-store", route.includes('"Cache-Control": "no-store"'))
  const server = readFileSync(join(process.cwd(), "lib/products/import/gumroad-server.ts"), "utf8")
  check("the importer writes drafts only", /status: "draft"/.test(server) && !/status: "published"/.test(server))
  check("the importer never logs", !/console\.(log|error|warn|info)/.test(server))
  const client = readFileSync(join(process.cwd(), "app/app/products/import/gumroad/gumroad-import-client.tsx"), "utf8")
  check("the page keeps nothing in the browser's storage", !/localStorage|sessionStorage|indexedDB/.test(client))
  check("the page says files are not copied", client.includes("Files are not copied."))
  section("SQL part 344")
  const part = readFileSync(join(process.cwd(), "supabase/sql/run-now/344_product_import_links.sql"), "utf8")
  check("one row per store, platform and product id", /CREATE UNIQUE INDEX IF NOT EXISTS product_import_links_source_key ON public\.product_import_links \(creator_id, source, external_id\)/.test(part))
  check("a deleted product can come in again", /REFERENCES public\.products\(id\) ON DELETE SET NULL/.test(part))
  check("service role only", part.includes("ENABLE ROW LEVEL SECURITY") && part.includes("REVOKE ALL ON public.product_import_links FROM anon, authenticated"))
  check("no column for a token or a buyer", !/token|email|customer|buyer_/i.test(part.split("\n").slice(1).join("\n")))
  check("the migration is the same part", readFileSync(join(process.cwd(), "supabase/migrations/20271102_product_import_links.sql"), "utf8") === part)
  const after = readFileSync(join(process.cwd(), "supabase/sql/run-now/99_check_after.sql"), "utf8")
  check("99_check_after has a p344 column that cannot error before 344 ran", /as p344_product_import_links[,;]/.test(after) && after.includes("case when to_regclass('public.product_import_links') is null then false"))
  check("the README lists it", readFileSync(join(process.cwd(), "supabase/sql/run-now/README.md"), "utf8").includes("| `344_product_import_links.sql` |"))

  check("a member with Products may import", permits(["products"], "products"))
  check("a member without Products may not", !permits(["orders", "customers"], "products"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
