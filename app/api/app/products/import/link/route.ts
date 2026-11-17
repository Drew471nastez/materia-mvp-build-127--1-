import { NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { storeCurrencyNow } from "@/lib/store/currency-guard"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { fetchPublic } from "@/lib/api/public-fetch"
import { fetchProductLink } from "@/lib/products/import/product-link-server"
import { importImageUrl } from "@/lib/products/import/product-link"
import { duplicatesFor, importGumroadItem } from "@/lib/products/import/gumroad-server"
import { screenInBackground } from "@/lib/storage/upload-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  const gate = await requireTeamPermission("products")
  if (gate instanceof NextResponse) return gate
  const limit = await rateLimit({ bucket: "product-link-import", subjects: [`creator:${gate.creatorId}`], windows: [{ limit: 30, seconds: 3600 }] })
  if (limit) return limit
  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 4096) return json({ error: "The product link is too long." }, 400)
    body = JSON.parse(raw)
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error()
  } catch { return json({ error: "Enter a product link." }, 400) }
  if (body.action !== "preview" && body.action !== "import") return json({ error: "Choose preview or import." }, 400)
  try {
    // Re-read the public source on import. Client-supplied metadata is never written.
    const product = await fetchProductLink(body.url)
    const currency = await storeCurrencyNow(gate.db, gate.creatorId)
    if (!currency) return json({ error: "Your store currency could not be read. Try again in a moment." }, 503)
    /* Already in the store? Said on the preview, and asked again before a write, so a stale page cannot make a second one (lib/products/import/duplicates). */
    const existing = (await duplicatesFor(gate.db, gate.creatorId, product.source)).find({ title: product.title, externalId: product.externalId, url: product.url })
    if (body.action === "preview") return json({ product, storeCurrency: currency, existing })
    const copy = body.copy === true
    if (existing && !copy) return json({ status: "duplicate", existing, error: "This product is already in your products. Import it as a copy, or open the one you have." }, 409)
    if (product.currency !== currency) return json({ error: `This product is priced in ${product.currency}; your store sells in ${currency}. Set the source to your store's currency before importing.` }, 400)
    if (body.type === "digital" || body.type === "course" || body.type === "physical") product.type = body.type
    if (product.type === "physical" && !(await isPhysicalCommerceEnabled())) return json({ error: "Physical products are not enabled for this store." }, 403)
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
      imageUrl: (url) => importImageUrl(url, product.source === "shopify" ? product.url : undefined),
      fetchImage: async (url) => {
        if (!importImageUrl(url, product.source === "shopify" ? product.url : undefined)) return null
        try {
          const r = await fetchPublic(url, { maxBytes: 10 * 1024 * 1024, timeoutMs: 7000, maxRedirects: 0 })
          return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
        } catch { return null }
      },
      afterUpload: ({ bucket, path, bytes }) => screenInBackground(gate.db, { bytes, bucket, path, context: "public_image", userId: gate.userId }),
      copy,
    })
    if (result.status === "error") return json({ error: result.error === "not_ready" ? "Imports need their database update. Run SQL parts 344 and 469, then try again." : "The draft could not be saved. Check the import database updates and try again." }, result.error === "not_ready" ? 503 : 500)
    if (result.status === "busy") return json({ error: "This product is already being imported. Wait a moment and try again." }, 409)
    return json({ ...result, warnings: product.warnings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "The product could not be read. Try again."
    // Parser messages contain no credentials; transport exceptions may contain addresses or network details.
    return json({ error: /fetch|socket|network|ENOTFOUND|ECONN|private|public address|redirect|timeout|timed out/i.test(message) ? "The product page could not be reached. Check the public link and try again." : message.slice(0, 300) }, 400)
  }
}
