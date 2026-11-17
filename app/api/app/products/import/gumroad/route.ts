import { NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { storeCurrencyNow } from "@/lib/store/currency-guard"
import { sellingCurrencyOf } from "@/lib/store/selling-currency"
import { screenInBackground } from "@/lib/storage/upload-guard"
import { mapGumroadProduct, readImportItem, type ImportCandidate } from "@/lib/products/import/gumroad"
import { IMPORT_SQL_PART, duplicatesFor, fetchGumroadProducts, importGumroadItem, importedProducts, looksLikeToken } from "@/lib/products/import/gumroad-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Products › Import from Gumroad (app/app/products/import/gumroad).
 *
 *   POST { action: "list", token }
 *        → { products: [candidate & { importedProductId, existing }], currency, ready, truncated }
 *          The token is read from this body, handed to the Gumroad reader
 *          (lib/products/import/gumroad-server fetchGumroadProducts) and goes
 *          out of scope with this request. Nothing writes it anywhere.
 *          `existing` is the store's product this one already is, if any
 *          (lib/products/import/duplicates): by its Gumroad id, its address
 *          or its title.
 *   POST { action: "import", item, copy? }
 *        → { status: "imported" | "exists" | "busy", productId? }, or 409
 *          { status: "duplicate", existing } when it is already in the store
 *          and `copy` was not asked for. One
 *          reviewed product, read again here as a stranger's input
 *          (readImportItem), written as a draft.
 *
 * Both need the Products area of the store (the owner, or a team member
 * whose role holds Products). Every answer is no-store.
 */
const NO_STORE = { "Cache-Control": "no-store" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(request: Request) {
  const gate = await requireTeamPermission("products")
  if (gate instanceof NextResponse) return gate

  let body: Record<string, unknown> | null = null
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    body = null
  }
  if (!body) return json({ error: "bad_request" }, 400)

  if (body.action === "list") {
    const token = body.token
    /* Read once, and the body's copy dropped, so nothing later in this request can reach it by accident. */
    delete body.token
    if (!looksLikeToken(token)) return json({ error: "bad_token" }, 400)
    const limited = await rateLimit({ bucket: "gumroad-import-list", subjects: [`creator:${gate.creatorId}`], windows: [{ limit: 20, seconds: 3600 }] })
    if (limited) return limited
    const listed = await fetchGumroadProducts(token)
    if (!listed.ok) return json({ error: listed.error }, listed.error === "bad_token" ? 400 : 502)
    const currency = sellingCurrencyOf(await storeCurrencyNow(gate.db, gate.creatorId))
    const products = listed.products.map((p) => mapGumroadProduct(p, currency)).filter((p): p is ImportCandidate => !!p)
    const { ready, map } = await importedProducts(gate.db, gate.creatorId, products.map((p) => p.gumroadId))
    const duplicates = await duplicatesFor(gate.db, gate.creatorId, "gumroad")
    return json({
      products: products.map((p) => ({ ...p, importedProductId: map.get(p.gumroadId) ?? null, existing: duplicates.find({ title: p.title, externalId: p.gumroadId, url: p.gumroadUrl }) })),
      currency,
      ready,
      sqlPart: IMPORT_SQL_PART,
      truncated: listed.truncated,
    })
  }

  if (body.action === "import") {
    const read = readImportItem(body.item)
    if (!read.ok) return json({ error: read.error }, 400)
    const limited = await rateLimit({ bucket: "gumroad-import-write", subjects: [`creator:${gate.creatorId}`], windows: [{ limit: 600, seconds: 3600 }] })
    if (limited) return limited
    /* Asked again here, so a review screen left open cannot make a second one (lib/products/import/duplicates). */
    const copy = body.copy === true
    const existing = copy ? null : (await duplicatesFor(gate.db, gate.creatorId, "gumroad")).find({ title: read.item.title, externalId: read.item.gumroadId, url: typeof body.url === "string" ? body.url : null })
    if (existing) return json({ status: "duplicate", existing, error: "duplicate" }, 409)
    const outcome = await importGumroadItem(gate.db, { creatorId: gate.creatorId, userId: gate.userId }, read.item, {
      afterUpload: ({ bucket, path, bytes }) => screenInBackground(gate.db, { bytes, bucket, path, context: "public_image", userId: gate.userId }),
      copy,
    })
    if (outcome.status === "error") return json({ error: outcome.error, sqlPart: IMPORT_SQL_PART }, outcome.error === "not_ready" ? 503 : 500)
    return json(outcome)
  }

  return json({ error: "bad_request" }, 400)
}
