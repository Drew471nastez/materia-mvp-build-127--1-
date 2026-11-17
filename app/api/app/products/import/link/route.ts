import { NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { storeCurrencyNow } from "@/lib/store/currency-guard"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { fetchPublic } from "@/lib/api/public-fetch"
import { LinkImportError, fetchProductLink, fetchShopifyCatalog } from "@/lib/products/import/product-link-server"
import { importImageUrl, importLink } from "@/lib/products/import/product-link"
import { duplicatesFor, importGumroadItem } from "@/lib/products/import/gumroad-server"
import { screenInBackground } from "@/lib/storage/upload-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

/**
 * Products › Create new product › Import (app/app/products/new/link-import-form).
 *
 *   POST { action: "preview", url }
 *        A product page (Shopify, Gumroad, Payhip) → { product, storeCurrency, existing }.
 *        A Shopify store's address → { catalog: { origin, currency, items, truncated }, storeCurrency },
 *        each item with `existing` when it is already in the store.
 *   POST { action: "import", url, type?, copy? }
 *        The page is read again here; nothing the browser sends about the
 *        product is written. A catalog import sends one product link per request.
 */
export async function POST(request: Request) {
  const gate = await requireTeamPermission("products")
  if (gate instanceof NextResponse) return gate
  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 4096) return json({ error: "The product link is too long." }, 400)
    body = JSON.parse(raw)
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error()
  } catch { return json({ error: "Enter a product link." }, 400) }
  if (body.action !== "preview" && body.action !== "import") return json({ error: "Choose preview or import." }, 400)
  /* Reading is counted apart from writing, so a store of 200 products can be imported after its list was read. */
  const reading = body.action === "preview"
  const limit = await rateLimit({ bucket: reading ? "product-link-import" : "product-link-import-write", subjects: [`creator:${gate.creatorId}`], windows: [{ limit: reading ? 60 : 600, seconds: 3600 }] })
  if (limit) return limit
  try {
    const link = importLink(body.url)
    if (link.kind === "store") {
      if (!reading) return json({ error: "Pick the products to import from the list first." }, 400)
      const [catalog, currency] = await Promise.all([fetchShopifyCatalog(link.url.origin), storeCurrencyNow(gate.db, gate.creatorId)])
      if (!currency) return json({ error: "Your store currency could not be read. Try again in a moment." }, 503)
      const duplicates = await duplicatesFor(gate.db, gate.creatorId, "shopify")
      return json({ catalog: { ...catalog, items: catalog.items.map((item) => ({ ...item, existing: duplicates.find({ title: item.title, externalId: item.externalId, url: item.url }) })) }, storeCurrency: currency })
    }
    // Re-read the public source on import. Client-supplied metadata is never written.
    const product = await fetchProductLink(link.url.href)
    const currency = await storeCurrencyNow(gate.db, gate.creatorId)
    if (!currency) return json({ error: "Your store currency could not be read. Try again in a moment." }, 503)
    /* Already in the store? Said on the preview, and asked again before a write, so a stale page cannot make a second one (lib/products/import/duplicates). */
    const existing = (await duplicatesFor(gate.db, gate.creatorId, product.source)).find({ title: product.title, externalId: product.externalId, url: product.url })
    if (reading) return json({ product, storeCurrency: currency, existing })
    const copy = body.copy === true
    if (existing && !copy) return json({ status: "duplicate", existing, error: "This product is already in your products. Import it as a copy, or open the one you have." }, 409)
    if (product.currency !== currency) return json({ error: `This product is priced in ${product.currency}; your store sells in ${currency}. Set the source to your store's currency before importing.` }, 400)
    if (body.type === "digital" || body.type === "course" || body.type === "physical") product.type = body.type
    if (product.type === "physical" && !(await isPhysicalCommerceEnabled())) return json({ error: "Physical products are not enabled for this store." }, 403)
    const storefront = product.source === "shopify" ? product.url : undefined
    const result = await importGumroadItem(gate.db, { creatorId: gate.creatorId, userId: gate.userId }, {
      gumroadId: product.externalId,
      title: product.title,
      descriptionHtml: product.descriptionHtml,
      priceCents: product.priceCents,
      payWhatYouWant: product.payWhatYouWant,
      images: product.images,
      variants: product.variants,
      tags: product.tags,
    }, {
      source: product.source,
      linkProduct: product,
      imageUrl: (url) => importImageUrl(url, storefront),
      fetchImage: async (url) => {
        if (!importImageUrl(url, storefront)) return null
        try {
          const r = await fetchPublic(url, { maxBytes: 10 * 1024 * 1024, timeoutMs: 7000, maxRedirects: 0, httpsOnly: true })
          return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
        } catch { return null }
      },
      afterUpload: ({ bucket, path, bytes }) => screenInBackground(gate.db, { bytes, bucket, path, context: "public_image", userId: gate.userId }),
      copy,
    })
    if (result.status === "error") return json({ error: result.error === "not_ready" ? "Imports need their database update. Run SQL parts 344, 469 and 470, then try again." : "The draft could not be saved. Check the import database updates and try again." }, result.error === "not_ready" ? 503 : 500)
    if (result.status === "busy") return json({ error: "This product is already being imported. Wait a moment and try again." }, 409)
    return json({ ...result, warnings: product.warnings })
  } catch (error) {
    if (error instanceof LinkImportError) return json({ error: error.message.slice(0, 300) }, 400)
    const message = error instanceof Error ? error.message : ""
    if (/larger than allowed/i.test(message)) return json({ error: "That page is too large to read. Paste the product's own page link." }, 400)
    // Parser messages contain no credentials; transport exceptions may contain addresses or network details.
    const transport = !message || /fetch|socket|network|ENOTFOUND|EAI_AGAIN|ECONN|EPRIVATE|Refused|private|public address|redirect|timeout|timed out|certificate|TLS|SSL/i.test(message)
    return json({ error: transport ? "The product page could not be reached. Check the public link and try again." : message.slice(0, 300) }, 400)
  }
}
