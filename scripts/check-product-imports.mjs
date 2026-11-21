/**
 * ===========================================================================
 *  PRODUCT IMPORTS, MEASURED
 * ===========================================================================
 * Runs the import's own readers (lib/products/import/product-link-server.ts
 * and ./gumroad.ts, bundled as they are, nothing re-implemented) against
 *
 *   FIXTURES  tests/fixtures/product-imports, always; and
 *   LIVE      real public pages, through the same public-address fetch the
 *             route uses (lib/api/public-fetch): a Shopify store address
 *             lists its catalog and its first product is read in full; a
 *             product link (Shopify, Gumroad, Payhip) is read as the import
 *             reads it.
 *
 * and prints, per page, which fields came through: title, description,
 * price and currency, pay what you want, images, variants and options,
 * compare-at prices, SKUs, tags, vendor, category, type, warnings. A page that
 * cannot be reached says why (a network that refuses the host is not a broken
 * import, and is reported as unreachable, never as a pass).
 *
 *   node scripts/check-product-imports.mjs                      fixtures, then the default live stores
 *   node scripts/check-product-imports.mjs <url> [<url> ...]    fixtures, then these
 *   OFFLINE=1 node scripts/check-product-imports.mjs            fixtures only
 *   VIA_PROXY=1 NODE_USE_ENV_PROXY=1 node scripts/...            live pages through an HTTPS proxy (a sandbox)
 *
 * Exit code 1 when a fixture reads wrong. Live pages change; their table is
 * the measurement, read by a person.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"

const root = process.cwd()
/* Public Shopify storefronts, store addresses only: the catalog says which products exist today. */
const DEFAULT_LIVE = ["https://www.allbirds.com", "https://kith.com", "https://gumroad.com/l/catpin", "https://juliawinterpaw.gumroad.com/l/Feline", "https://payhip.com/b/AbC12"]

const dir = mkdtempSync(join(tmpdir(), "storelib-import-check-"))
const out = join(dir, "imports.mjs")
await build({
  stdin: {
    contents: `export * from "./lib/products/import/product-link-server"; export * from "./lib/products/import/product-link"; export { mapGumroadProduct } from "./lib/products/import/gumroad"`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error",
  alias: { "@": root },
  plugins: [{ name: "server-only", setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" })); b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export {}", loader: "js" })) } }],
})
const m = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

let broken = 0
const row = (p) => ({
  title: p.title ? `${p.title.slice(0, 48)}` : "MISSING",
  description: p.descriptionHtml ? `${p.descriptionHtml.length} chars` : "none",
  price: `${p.priceCents} ${p.currency}${p.payWhatYouWant ? " pwyw" : ""}`,
  images: p.images.length,
  variants: p.variants.length,
  options: p.options.map((o) => `${o.name}(${o.values.length})`).join(" ") || "-",
  compareAt: p.variants.filter((v) => v.compareAtCents).length,
  skus: p.variants.filter((v) => v.sku).length,
  tags: p.tags.length,
  vendor: p.vendor ?? "-",
  category: p.category ?? "-",
  type: p.type,
  warnings: p.warnings.length,
})
const show = (label, fields) => {
  console.log(`\n${label}`)
  for (const [k, v] of Object.entries(fields)) console.log(`  ${k.padEnd(12)} ${v}`)
}
const expect = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) broken++ }

/* ── fixtures ─────────────────────────────────────────────────────────── */

const fx = (name) => readFileSync(join(root, "tests/fixtures/product-imports", name), "utf8")
console.log("FIXTURES (tests/fixtures/product-imports)")
const feline = m.parseGumroadProduct(fx("gumroad-feline-page.html"), "https://juliawinterpaw.gumroad.com/l/Feline")
show("gumroad-feline-page.html (real, trimmed)", row(feline))
expect(feline.priceCents === 0 && feline.payWhatYouWant && feline.variants.length === 5 && feline.images.length === 5, "Gumroad free, pay what you want, five versions, five covers")
const layla = m.parseGumroadProduct(fx("gumroad-layla-page.html"), "https://heartmarksman.gumroad.com/l/Layla_by_Heartmarksman")
show("gumroad-layla-page.html (real, trimmed)", row(layla))
expect(layla.currency === "EUR" && layla.priceCents === 3500 && layla.images.length === 8, "Gumroad: the seller's EUR price, not the JSON-LD's USD")
const catpin = m.parseGumroadProduct(fx("gumroad-catpin-landing.html"), "https://alexsokol.gumroad.com/l/catpin", JSON.parse(fx("gumroad-catpin.json")))
show("gumroad-catpin.json (real, trimmed)", row(catpin))
expect(catpin.priceCents === 3000 && catpin.variants.length === 3, "Gumroad landing page product from its public JSON")
const s = m.parseShopifyProduct(JSON.parse(fx("shopify-allbirds-dasher.js.json")), fx("shopify-allbirds-dasher-page.html"), "https://www.allbirds.com/products/womens-tree-dashers-natural-white-true-navy")
show("shopify-allbirds-dasher.js.json (real, trimmed)", row(s))
expect(s.priceCents === 9800 && s.currency === "USD" && s.images.length === 6 && s.variants[0].compareAtCents === 14000, "Shopify .js: price, six images, compare-at")
const kith = m.parseShopifyCatalog([JSON.parse(fx("shopify-kith-products-page.json"))], "https://kith.com")
expect(kith.length === 3 && kith[0].priceCents === 66000, "Shopify /products.json: three products in hundredths")
const api = JSON.parse(fx("gumroad-api-products.json")).products.map((p) => m.mapGumroadProduct(p, "EUR"))
console.log("\ngumroad-api-products.json (store in EUR)")
for (const c of api) console.log(`  ${c.title.slice(0, 32).padEnd(32)} ${c.priceCents === null ? "needs a price (" + c.gumroadPrice.currency + ")" : c.priceCents + " EUR"}  images ${c.images.length}  variants ${c.variants.length}  ${c.unsupported ?? ""} ${c.notes.join(",")}`)
expect(api.length === 5 && api[0].priceCents === 2900 && api[2].unsupported === "membership" && api[3].unsupported === "bundle", "Gumroad API: mapped, memberships and bundles held back")

/* ── live ─────────────────────────────────────────────────────────────── */

const live = process.env.OFFLINE ? [] : process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_LIVE
if (live.length) console.log(`\nLIVE (${process.env.VIA_PROXY ? "Node fetch through the HTTPS proxy, the import's own requests and limits" : "through lib/api/public-fetch, as the route reads"})`)
/*
 * TRANSPORT. lib/api/public-fetch connects straight to the address a name resolves to (that is its private-address
 * guard). A sandbox whose only way out is an HTTPS proxy cannot do that, so with VIA_PROXY=1 (and NODE_USE_ENV_PROXY=1)
 * the same requests go through Node's fetch and the proxy instead: the same headers public-fetch sends, the same
 * redirect count, size and time limits, https only. Only the wire changes; which URLs are asked and how the answers
 * are read is the import's own code (fetchProductLink, fetchShopifyCatalog take the fetcher as an argument).
 */
const viaProxy = async (href, opts = {}) => {
  let url = href
  for (let hop = 0; ; hop++) {
    if (!url.startsWith("https://")) throw new Error("Refused: not https")
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "Storelib/1.0 (+https://storelib.com)", accept: "*/*" }, signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000) })
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= (opts.maxRedirects ?? 3)) throw new Error("Refused: too many redirects")
      url = new URL(res.headers.get("location"), url).href
      continue
    }
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length > (opts.maxBytes ?? 4 * 1024 * 1024)) throw new Error("The response is larger than allowed")
    return Object.defineProperty(new Response(body.length ? body : null, { status: res.status, headers: res.headers }), "url", { value: url })
  }
}
const get = process.env.VIA_PROXY ? viaProxy : undefined
const unreachable = (e) => /fetch|socket|network|ENOTFOUND|EAI_AGAIN|ECONN|Refused|private|timeout|timed out|certificate|TLS|SSL|tunnel/i.test(String(e?.message ?? e))
for (const raw of live) {
  try {
    const link = m.importLink(raw)
    if (link.kind === "store") {
      const c = await m.fetchShopifyCatalog(link.url.origin, get)
      show(`${raw}  (store)`, { products: c.items.length, currency: c.currency || "NONE", truncated: c.truncated, first: c.items[0]?.url ?? "-" })
      const multi = c.items.find((i) => i.variants > 1)
      for (const it of [c.items[0], multi].filter((x, i, a) => x && a.indexOf(x) === i)) show(it.url, row(await m.fetchProductLink(it.url, get)))
    } else {
      show(raw, row(await m.fetchProductLink(link.url.href, get)))
    }
  } catch (e) {
    console.log(`\n${raw}\n  ${unreachable(e) && !(e instanceof m.LinkImportError) ? "UNREACHABLE from this machine" : "REFUSED by the import"}: ${String(e?.message ?? e).slice(0, 200)}`)
  }
}

console.log(broken ? `\n${broken} fixture checks failed` : "\nfixtures read as expected")
process.exit(broken ? 1 : 0)
